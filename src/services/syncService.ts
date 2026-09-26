import type { Table } from 'dexie'
import { db } from '../db/database'
import type {
  Aporte,
  Categoria,
  ControlSync,
  Cuenta,
  Deuda,
  Frecuencia,
  Meta,
  Moneda,
  OrigenTransaccion,
  Presupuesto,
  Recurrente,
  ResultadoSincronizacion,
  TablaSincronizable,
  TipoCategoria,
  TipoCuenta,
  TipoDeuda,
  TipoTransaccion,
  Transaccion,
} from '../types'
import { supabase } from './supabaseClient'

/*
 * Sincronización Dexie <-> Supabase.
 *
 * - Transacciones: cola de pendientes (`sincronizado === false`) que se
 *   sube; luego se descargan las recientes y se reconcilian los borrados.
 * - Resto de entidades (categorías, cuentas, presupuestos, metas, deudas,
 *   recurrentes): con el esquema v7 (`supabase/migraciones/v0.7.sql`) cada
 *   fila remota tiene `fecha_actualizacion` y se resuelven conflictos por
 *   "gana la edición más reciente". Sin ese esquema (modo "legado"), solo
 *   se sincronizan categorías y cuentas como antes (se suben completas).
 * - Borrados: se registran en `eliminacionesPendientes` y se replican aquí.
 *
 * Es el único lugar que traduce camelCase (Dexie) <-> snake_case (Supabase).
 */

const LIMITE_DESCARGA = 200
const PAGINA_IDS = 1000

/** Código de error de Postgres para violación de restricción única (23505). */
const CODIGO_ERROR_DUPLICADO = '23505'
/** Violación de llave foránea (p. ej. `cuenta_id` que no existe en `cuentas`). */
const CODIGO_ERROR_LLAVE_FORANEA = '23503'

interface ErrorSupabase {
  message: string
  code?: string
  details?: string | null
  hint?: string | null
}

/** Qué significa cada código de error frecuente y qué hacer. */
function explicarCodigo(code?: string): string | null {
  switch (code) {
    case 'PGRST204': // columna desconocida en el payload
    case '42703': // columna inexistente
      return 'Una tabla de Supabase no tiene todas las columnas que usa la app (¿falta ejecutar la migración SQL?).'
    case 'PGRST205':
    case '42P01':
      return 'Falta una tabla en Supabase (ejecuta la migración SQL de la app).'
    case CODIGO_ERROR_LLAVE_FORANEA:
      return 'Un registro apunta a una cuenta o categoría que no existe en Supabase.'
    case '42501':
      return 'Supabase rechazó los datos por permisos (política RLS de la tabla).'
    case '23514':
      return 'Un valor no cumple una restricción CHECK de la tabla (p. ej. un "tipo" no permitido).'
    case '23502':
      return 'Falta un valor en una columna obligatoria (NOT NULL) de Supabase.'
    case CODIGO_ERROR_DUPLICADO:
      return 'Ya existe un registro con ese valor único en Supabase.'
    default:
      return null
  }
}

/**
 * Traduce un error de Supabase/PostgREST a un mensaje que diga qué pasó e
 * incluye los datos técnicos completos (código, detalle y pista) para
 * poder diagnosticarlo.
 */
function describirError(accion: string, error: ErrorSupabase): string {
  console.error(`[sync] ${accion}`, error)

  const tecnico = [
    error.code && `código ${error.code}`,
    error.message,
    error.details && `detalle: ${error.details}`,
    error.hint && `pista: ${error.hint}`,
  ]
    .filter(Boolean)
    .join(' · ')

  const explicacion = explicarCodigo(error.code)
  return `${accion}. ${explicacion ? `${explicacion} ` : ''}(${tecnico})`
}

/** Error de datos (Postgres/PostgREST) y no de red: vale reintentar fila por fila. */
function esErrorDeDatos(error: ErrorSupabase): boolean {
  return /^(PGRST\d+|[0-9A-Z]{5})$/.test(error.code ?? '')
}

/**
 * Id del usuario con sesión activa en Supabase. Las filas se suben con este
 * `user_id` (el que valida la política RLS), nunca con uno de otra sesión.
 */
async function usuarioSesionActiva(usuarioId: string): Promise<string> {
  if (!supabase) throw new Error('Supabase no está configurado.')

  const { data, error } = await supabase.auth.getSession()
  const idSesion = data.session?.user.id

  if (error || !idSesion) {
    throw new Error('La sesión expiró: vuelve a iniciar sesión para sincronizar.')
  }
  if (idSesion !== usuarioId) {
    throw new Error('La sesión activa no corresponde a este usuario; vuelve a iniciar sesión.')
  }
  return idSesion
}

// ---------------------------------------------------------------------------
// Detección del esquema remoto
// ---------------------------------------------------------------------------

/**
 * Migraciones de supabase/migraciones/ y una consulta vacía (`limit 0`)
 * que solo funciona si ya se ejecutó. En orden: cada una asume las
 * anteriores.
 */
const MIGRACIONES: { archivo: string; comprobar: () => PromiseLike<{ error: unknown }>[] }[] = [
  {
    archivo: 'v0.7.sql',
    comprobar: () => [
      supabase!.from('categorias').select('fecha_actualizacion').limit(0),
      supabase!.from('metas').select('id').limit(0),
      supabase!.from('transacciones').select('moneda, transferencia_id').limit(0),
    ],
  },
  {
    archivo: 'v0.11.sql',
    comprobar: () => [
      supabase!.from('transacciones').select('etiquetas').limit(0),
      supabase!.from('deudas').select('gasto_dividido').limit(0),
    ],
  },
  {
    archivo: 'v0.13.sql',
    comprobar: () => [supabase!.from('recurrentes').select('dia_mes').limit(0)],
  },
]

/** Migraciones ya confirmadas en esta sesión (no se vuelven a consultar). */
const migracionesConfirmadas = new Set<string>()

/** Archivos de migración que aún no se ejecutaron en Supabase. */
async function migracionesPendientes(): Promise<string[]> {
  if (!supabase) return []
  const pendientes: string[] = []
  for (const m of MIGRACIONES) {
    if (migracionesConfirmadas.has(m.archivo)) continue
    const resultados = await Promise.all(m.comprobar())
    if (resultados.every((r) => !r.error)) migracionesConfirmadas.add(m.archivo)
    else pendientes.push(m.archivo)
  }
  return pendientes
}

// ---------------------------------------------------------------------------
// Conversión de tipos
// ---------------------------------------------------------------------------

/** Fecha local → 'YYYY-MM-DD' (columnas `date`). */
function aFechaSql(fecha: Date): string {
  const m = String(fecha.getMonth() + 1).padStart(2, '0')
  const d = String(fecha.getDate()).padStart(2, '0')
  return `${fecha.getFullYear()}-${m}-${d}`
}

/** 'YYYY-MM-DD' (o ISO completo) → Date local, sin desfase de zona horaria. */
function deFechaSql(valor: string): Date {
  const soloFecha = /^(\d{4})-(\d{2})-(\d{2})$/.exec(valor)
  return soloFecha
    ? new Date(Number(soloFecha[1]), Number(soloFecha[2]) - 1, Number(soloFecha[3]))
    : new Date(valor)
}

const aNumero = (valor: unknown): number => Number(valor) || 0
const aNumeroOpcional = (valor: unknown): number | undefined =>
  valor === null || valor === undefined ? undefined : Number(valor)

function marcaDeTiempo(fila: { fecha_actualizacion?: string | null }): Partial<ControlSync> {
  return fila.fecha_actualizacion
    ? { sincronizado: true, fechaActualizacion: new Date(fila.fecha_actualizacion) }
    : { sincronizado: true }
}

interface AporteRemoto {
  id: string
  fecha: string
  monto: number
  nota?: string | null
}

const aAportesRemotos = (aportes: Aporte[]): AporteRemoto[] =>
  aportes.map((a) => ({ id: a.id, fecha: a.fecha.toISOString(), monto: a.monto, nota: a.nota ?? null }))

const aAportesLocales = (aportes: unknown): Aporte[] =>
  Array.isArray(aportes)
    ? (aportes as AporteRemoto[]).map((a) => ({
        id: a.id,
        fecha: new Date(a.fecha),
        monto: aNumero(a.monto),
        nota: a.nota ?? undefined,
      }))
    : []

// ---------------------------------------------------------------------------
// Mapeos por entidad (local camelCase <-> remoto snake_case). Las filas
// remotas se construyen campo por campo (lista blanca): los campos
// solo-locales como `sincronizado` nunca viajan.
// ---------------------------------------------------------------------------

type FilaRemota = Record<string, unknown> & { id: string }

function aFilaTransaccion(t: Transaccion, userId: string): FilaRemota {
  const fila: FilaRemota = {
    id: t.id,
    user_id: userId,
    // Las descargadas sin cuenta llegan como '' (ver aTransaccionLocal).
    cuenta_id: t.cuentaId || null,
    // Las transferencias no tienen categoría.
    categoria_id: t.categoriaId || null,
    monto: t.monto,
    tipo: t.tipo,
    fecha: t.fecha.toISOString(),
    // En Supabase `concepto` es NOT NULL; en la app es opcional. Sin
    // concepto se envía '' (y al descargar '' vuelve a ser undefined).
    concepto: t.concepto ?? '',
    // null y no '': el índice único (user_id, nro_operacion) trataría
    // todos los '' como duplicados.
    nro_operacion: t.nroOperacion ?? null,
    origen: t.origen,
    fecha_actualizacion: t.fechaActualizacion.toISOString(),
  }

  // Columnas del esquema v7: solo se envían si tienen valor, para que las
  // transacciones normales sigan subiendo aunque falte la migración.
  if (t.moneda) {
    fila.moneda = t.moneda
    fila.monto_original = t.moneda === 'PEN' ? null : (t.montoOriginal ?? null)
    fila.tipo_cambio = t.moneda === 'PEN' ? null : (t.tipoCambio ?? null)
  }
  if (t.transferenciaId) fila.transferencia_id = t.transferenciaId
  if (t.recurrenteId) fila.recurrente_id = t.recurrenteId
  // [] explícito = se quitaron las etiquetas (hay que limpiarlas remoto).
  if (t.etiquetas !== undefined) fila.etiquetas = t.etiquetas

  return fila
}

function aOrigen(valor: unknown): OrigenTransaccion {
  return valor === 'yape' || valor === 'transferencia' || valor === 'recurrente'
    ? valor
    : 'manual'
}

function aTransaccionLocal(fila: Record<string, unknown>): Transaccion {
  const moneda = fila.moneda === 'USD' ? 'USD' : undefined
  return {
    id: fila.id as string,
    usuarioId: fila.user_id as string,
    cuentaId: (fila.cuenta_id as string | null) ?? '',
    categoriaId: (fila.categoria_id as string | null) ?? '',
    monto: aNumero(fila.monto),
    tipo: fila.tipo as TipoTransaccion,
    fecha: new Date(fila.fecha as string),
    concepto: (fila.concepto as string | null) || undefined,
    nroOperacion: (fila.nro_operacion as string | null) ?? undefined,
    origen: aOrigen(fila.origen),
    moneda,
    montoOriginal: moneda ? aNumeroOpcional(fila.monto_original) : undefined,
    tipoCambio: moneda ? aNumeroOpcional(fila.tipo_cambio) : undefined,
    transferenciaId: (fila.transferencia_id as string | null) ?? undefined,
    recurrenteId: (fila.recurrente_id as string | null) ?? undefined,
    etiquetas:
      Array.isArray(fila.etiquetas) && fila.etiquetas.length > 0 ? (fila.etiquetas as string[]) : undefined,
    sincronizado: true,
    fechaActualizacion: new Date(fila.fecha_actualizacion as string),
  }
}

/**
 * Configuración de una entidad sincronizada por marca de tiempo. `aFila`
 * recibe `conFecha` = false en modo legado (sin la columna remota
 * `fecha_actualizacion` ni las columnas nuevas de v7).
 */
interface Entidad<L extends { id: string; usuarioId: string } & ControlSync> {
  tabla: TablaSincronizable
  local: Table<L, string>
  etiqueta: string
  nombre: (l: L) => string
  aFila: (l: L, userId: string, conFecha: boolean) => FilaRemota
  aLocal: (fila: Record<string, unknown>) => L
}

const fechaRemota = (l: ControlSync) => (l.fechaActualizacion ?? new Date()).toISOString()

const CATEGORIAS: Entidad<Categoria> = {
  tabla: 'categorias',
  local: db.categorias,
  etiqueta: 'la categoría',
  nombre: (c) => `"${c.nombre}" (${c.tipo})`,
  aFila: (c, userId, conFecha) => ({
    id: c.id,
    user_id: userId,
    nombre: c.nombre,
    tipo: c.tipo,
    icono: c.icono ?? null,
    color: c.color ?? null,
    ...(conFecha ? { fecha_actualizacion: fechaRemota(c) } : {}),
  }),
  aLocal: (f) => ({
    id: f.id as string,
    usuarioId: f.user_id as string,
    nombre: f.nombre as string,
    tipo: f.tipo as TipoCategoria,
    icono: (f.icono as string | null) ?? undefined,
    color: (f.color as string | null) ?? undefined,
    ...marcaDeTiempo(f),
  }),
}

const CUENTAS: Entidad<Cuenta> = {
  tabla: 'cuentas',
  local: db.cuentas,
  etiqueta: 'la cuenta',
  nombre: (c) => `"${c.nombre}" (${c.tipo})`,
  aFila: (c, userId, conFecha) => ({
    id: c.id,
    user_id: userId,
    nombre: c.nombre,
    tipo: c.tipo,
    saldo_inicial: c.saldoInicial,
    ...(conFecha
      ? {
          limite_credito: c.limiteCredito ?? null,
          dia_corte: c.diaCorte ?? null,
          dia_pago: c.diaPago ?? null,
          fecha_actualizacion: fechaRemota(c),
        }
      : {}),
  }),
  aLocal: (f) => ({
    id: f.id as string,
    usuarioId: f.user_id as string,
    nombre: f.nombre as string,
    tipo: f.tipo as TipoCuenta,
    saldoInicial: aNumero(f.saldo_inicial),
    limiteCredito: aNumeroOpcional(f.limite_credito),
    diaCorte: aNumeroOpcional(f.dia_corte),
    diaPago: aNumeroOpcional(f.dia_pago),
    ...marcaDeTiempo(f),
  }),
}

const PRESUPUESTOS: Entidad<Presupuesto> = {
  tabla: 'presupuestos',
  local: db.presupuestos,
  etiqueta: 'el presupuesto',
  nombre: (p) => `${p.mes}/${p.anio}`,
  aFila: (p, userId) => ({
    id: p.id,
    user_id: userId,
    categoria_id: p.categoriaId,
    monto_limite: p.montoLimite,
    mes: p.mes,
    anio: p.anio,
    fecha_actualizacion: fechaRemota(p),
  }),
  aLocal: (f) => ({
    id: f.id as string,
    usuarioId: f.user_id as string,
    categoriaId: f.categoria_id as string,
    montoLimite: aNumero(f.monto_limite),
    mes: aNumero(f.mes),
    anio: aNumero(f.anio),
    ...marcaDeTiempo(f),
  }),
}

const METAS: Entidad<Meta> = {
  tabla: 'metas',
  local: db.metas,
  etiqueta: 'la meta',
  nombre: (m) => `"${m.nombre}"`,
  aFila: (m, userId) => ({
    id: m.id,
    user_id: userId,
    nombre: m.nombre,
    monto_objetivo: m.montoObjetivo,
    fecha_limite: m.fechaLimite ? aFechaSql(m.fechaLimite) : null,
    icono: m.icono,
    color: m.color,
    aportes: aAportesRemotos(m.aportes),
    fecha_actualizacion: fechaRemota(m),
  }),
  aLocal: (f) => ({
    id: f.id as string,
    usuarioId: f.user_id as string,
    nombre: f.nombre as string,
    montoObjetivo: aNumero(f.monto_objetivo),
    fechaLimite: f.fecha_limite ? deFechaSql(f.fecha_limite as string) : undefined,
    icono: (f.icono as string | null) ?? 'bullseye',
    color: (f.color as string | null) ?? '#4a3aa7',
    aportes: aAportesLocales(f.aportes),
    ...marcaDeTiempo(f),
  }),
}

const DEUDAS: Entidad<Deuda> = {
  tabla: 'deudas',
  local: db.deudas,
  etiqueta: 'la deuda',
  nombre: (d) => `"${d.persona}"`,
  aFila: (d, userId) => ({
    id: d.id,
    user_id: userId,
    persona: d.persona,
    tipo: d.tipo,
    monto: d.monto,
    concepto: d.concepto ?? null,
    fecha: aFechaSql(d.fecha),
    fecha_limite: d.fechaLimite ? aFechaSql(d.fechaLimite) : null,
    abonos: aAportesRemotos(d.abonos),
    fecha_actualizacion: fechaRemota(d),
    // Solo si aplica: así las deudas normales suben aunque falte v0.11.
    ...(d.gastoDividido ? { gasto_dividido: true } : {}),
  }),
  aLocal: (f) => ({
    id: f.id as string,
    usuarioId: f.user_id as string,
    persona: f.persona as string,
    tipo: f.tipo as TipoDeuda,
    monto: aNumero(f.monto),
    concepto: (f.concepto as string | null) ?? undefined,
    fecha: deFechaSql(f.fecha as string),
    fechaLimite: f.fecha_limite ? deFechaSql(f.fecha_limite as string) : undefined,
    abonos: aAportesLocales(f.abonos),
    gastoDividido: f.gasto_dividido === true ? true : undefined,
    ...marcaDeTiempo(f),
  }),
}

const RECURRENTES: Entidad<Recurrente> = {
  tabla: 'recurrentes',
  local: db.recurrentes,
  etiqueta: 'el movimiento recurrente',
  nombre: (r) => `"${r.concepto}"`,
  aFila: (r, userId) => ({
    id: r.id,
    user_id: userId,
    tipo: r.tipo,
    monto: r.monto,
    moneda: r.moneda ?? 'PEN',
    categoria_id: r.categoriaId,
    cuenta_id: r.cuentaId,
    concepto: r.concepto,
    frecuencia: r.frecuencia,
    proxima_fecha: aFechaSql(r.proximaFecha),
    // Solo viaja si difiere del día de proxima_fecha (fecha recortada): así
    // los recurrentes siguen subiendo aunque falte la migración v0.13.
    ...(r.diaMes && r.diaMes !== r.proximaFecha.getDate() ? { dia_mes: r.diaMes } : {}),
    activa: r.activa,
    fecha_actualizacion: fechaRemota(r),
  }),
  aLocal: (f) => ({
    id: f.id as string,
    usuarioId: f.user_id as string,
    tipo: f.tipo as TipoTransaccion,
    monto: aNumero(f.monto),
    moneda: f.moneda === 'USD' ? ('USD' as Moneda) : undefined,
    categoriaId: f.categoria_id as string,
    cuentaId: f.cuenta_id as string,
    concepto: (f.concepto as string | null) ?? '',
    frecuencia: f.frecuencia as Frecuencia,
    proximaFecha: deFechaSql(f.proxima_fecha as string),
    diaMes: typeof f.dia_mes === 'number' ? f.dia_mes : undefined,
    activa: f.activa !== false,
    ...marcaDeTiempo(f),
  }),
}

// ---------------------------------------------------------------------------
// Sincronización genérica por marca de tiempo (esquema v7)
// ---------------------------------------------------------------------------

/** Nombre comparable: sin mayúsculas, espacios extremos ni tildes. */
function normalizar(texto: string): string {
  return texto
    .trim()
    .toLocaleLowerCase('es')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
}

async function idsBorradosPendientes(usuarioId: string): Promise<Set<string>> {
  const borrados = await db.eliminacionesPendientes.where('usuarioId').equals(usuarioId).toArray()
  return new Set(borrados.map((e) => e.registroId))
}

/**
 * Upsert de filas locales pendientes. Si el lote falla por un error de
 * datos (una fila viola un CHECK, NOT NULL, etc.), se reintenta fila por
 * fila para que las demás sí suban. Marca como sincronizadas las que
 * subieron, salvo que se hayan vuelto a editar mientras tanto.
 */
async function subirPendientes<L extends { id: string; usuarioId: string } & ControlSync>(
  entidad: Entidad<L>,
  pendientes: L[],
  userId: string,
  conFecha: boolean,
): Promise<string | null> {
  if (!supabase || pendientes.length === 0) return null

  const subidas: L[] = []
  const rechazadas: string[] = []
  let ultimoError: ErrorSupabase | null = null

  const { error } = await supabase
    .from(entidad.tabla)
    // Columnas opcionales (gasto_dividido, dia_mes) que no trae una fila del
    // lote toman su DEFAULT, no NULL (gasto_dividido es NOT NULL).
    .upsert(pendientes.map((l) => entidad.aFila(l, userId, conFecha)), { defaultToNull: false })

  if (!error) {
    subidas.push(...pendientes)
  } else if (!esErrorDeDatos(error)) {
    return describirError(`No se pudo subir ${entidad.etiqueta}`, error)
  } else {
    for (const l of pendientes) {
      const { error: errorFila } = await supabase
        .from(entidad.tabla)
        .upsert(entidad.aFila(l, userId, conFecha))
      if (errorFila) {
        rechazadas.push(entidad.nombre(l))
        ultimoError = errorFila
      } else {
        subidas.push(l)
      }
    }
  }

  const version = new Map(subidas.map((l) => [l.id, l.fechaActualizacion?.getTime() ?? 0]))
  await entidad.local
    .where('id')
    .anyOf([...version.keys()])
    .modify((l) => {
      if ((l.fechaActualizacion?.getTime() ?? 0) === version.get(l.id)) l.sincronizado = true
    })

  return ultimoError
    ? describirError(`Supabase rechazó ${entidad.etiqueta} ${rechazadas.join(', ')}`, ultimoError)
    : null
}

/**
 * Sincroniza una entidad en ambos sentidos con "gana la edición más
 * reciente":
 * 1. Descarga todas sus filas remotas del usuario.
 * 2. Remota sin copia local → se agrega. Con copia local sin cambios →
 *    se reemplaza. Con copia local editada → gana la más reciente.
 * 3. Local ya sincronizada que no está en el servidor → se borró en otro
 *    dispositivo: se borra aquí.
 * 4. Sube las locales con cambios.
 * `fusionar` (solo catálogos) corre antes del paso 2 para unir registros
 * equivalentes creados por separado en dos dispositivos.
 */
async function sincronizarEntidad<L extends { id: string; usuarioId: string } & ControlSync>(
  entidad: Entidad<L>,
  usuarioId: string,
  userId: string,
  borrados: Set<string>,
  fusionar?: (remotos: L[]) => Promise<void>,
): Promise<string | null> {
  if (!supabase) return null

  const { data, error } = await supabase
    .from(entidad.tabla)
    .select('*')
    .eq('user_id', usuarioId)
    .limit(5000)

  if (error) return describirError(`No se pudo descargar ${entidad.etiqueta}`, error)

  const remotos = ((data ?? []) as Record<string, unknown>[])
    .map(entidad.aLocal)
    .filter((r) => !borrados.has(r.id))

  if (fusionar) await fusionar(remotos)

  await db.transaction('rw', entidad.local, async () => {
    const locales = new Map(
      (await entidad.local.where('usuarioId').equals(usuarioId).toArray()).map((l) => [l.id, l]),
    )

    const aGuardar = remotos.filter((r) => {
      const local = locales.get(r.id)
      if (!local || local.sincronizado === true) return true
      return (local.fechaActualizacion?.getTime() ?? 0) < (r.fechaActualizacion?.getTime() ?? 0)
    })
    await entidad.local.bulkPut(aGuardar)

    const idsRemotos = new Set(remotos.map((r) => r.id))
    const borradasEnOtroLado = [...locales.values()]
      .filter((l) => l.sincronizado === true && !idsRemotos.has(l.id))
      .map((l) => l.id)
    await entidad.local.bulkDelete(borradasEnOtroLado)
  })

  const pendientes = await entidad.local
    .where('usuarioId')
    .equals(usuarioId)
    .filter((l) => l.sincronizado !== true)
    .toArray()

  return subirPendientes(entidad, pendientes, userId, true)
}

// ---------------------------------------------------------------------------
// Catálogos (categorías y cuentas)
// ---------------------------------------------------------------------------

/**
 * Fusiona en Dexie las filas remotas de un catálogo (categorías o cuentas)
 * que no existen localmente. Si localmente hay una con el mismo nombre y
 * tipo pero otro id que aún no está en el servidor (típico de las sembradas
 * por defecto en cada dispositivo), se adopta el id remoto y se re-apuntan
 * las transacciones, presupuestos y recurrentes locales a él.
 */
async function fusionarCatalogo<T extends Categoria | Cuenta>(
  usuarioId: string,
  tabla: Table<T, string>,
  campo: 'categoriaId' | 'cuentaId',
  remotos: T[],
): Promise<void> {
  if (remotos.length === 0) return

  const clave = (r: T) => `${normalizar(r.nombre)}|${r.tipo}`
  const tablas = [tabla, db.transacciones, db.presupuestos, db.recurrentes]

  await db.transaction('rw', tablas, async () => {
    const locales = await tabla.where('usuarioId').equals(usuarioId).toArray()
    const idsLocales = new Set(locales.map((l) => l.id))
    const idsRemotos = new Set(remotos.map((r) => r.id))
    const localesSoloAqui = new Map(
      locales.filter((l) => !idsRemotos.has(l.id)).map((l) => [clave(l), l]),
    )

    for (const remoto of remotos) {
      if (idsLocales.has(remoto.id)) continue

      const duplicado = localesSoloAqui.get(clave(remoto))
      if (duplicado) {
        const ahora = new Date()
        await db.transacciones
          .where(campo)
          .equals(duplicado.id)
          .modify((t) => {
            t[campo] = remoto.id
            t.sincronizado = false
            t.fechaActualizacion = ahora
          })
        await db.recurrentes
          .where('usuarioId')
          .equals(usuarioId)
          .filter((r) => r[campo] === duplicado.id)
          .modify({ [campo]: remoto.id, sincronizado: false, fechaActualizacion: ahora })
        if (campo === 'categoriaId') {
          await db.presupuestos
            .where('categoriaId')
            .equals(duplicado.id)
            .modify({ categoriaId: remoto.id, sincronizado: false, fechaActualizacion: ahora })
        }
        await tabla.delete(duplicado.id)
        localesSoloAqui.delete(clave(remoto))
      }

      await tabla.put(remoto)
    }
  })
}

/**
 * Trae las categorías y cuentas remotas del usuario y agrega a Dexie las
 * que falten (ver `fusionarCatalogo`). Se llama al iniciar sesión, antes de
 * sembrar las categorías/cuentas por defecto.
 */
export async function descargarCatalogos(usuarioId: string): Promise<void> {
  if (!supabase) return

  const borrados = await idsBorradosPendientes(usuarioId)
  const [categorias, cuentas] = await Promise.all([
    supabase.from(CATEGORIAS.tabla).select('*').eq('user_id', usuarioId),
    supabase.from(CUENTAS.tabla).select('*').eq('user_id', usuarioId),
  ])

  if (categorias.error) {
    throw new Error(describirError('No se pudieron descargar las categorías', categorias.error))
  }
  if (cuentas.error) {
    throw new Error(describirError('No se pudieron descargar las cuentas', cuentas.error))
  }

  const convertir = <L extends { id: string }>(filas: unknown, aLocal: (f: Record<string, unknown>) => L) =>
    ((filas ?? []) as Record<string, unknown>[]).map(aLocal).filter((l) => !borrados.has(l.id))

  await fusionarCatalogo(usuarioId, db.categorias, 'categoriaId', convertir(categorias.data, CATEGORIAS.aLocal))
  await fusionarCatalogo(usuarioId, db.cuentas, 'cuentaId', convertir(cuentas.data, CUENTAS.aLocal))
}

/**
 * Modo legado (sin migración v7): sube todas las categorías y cuentas
 * locales (sin marca de tiempo), fila por fila si el lote falla.
 */
async function subirCatalogosLegado(usuarioId: string, userId: string): Promise<string[]> {
  const [categorias, cuentas] = await Promise.all([
    db.categorias.where('usuarioId').equals(usuarioId).toArray(),
    db.cuentas.where('usuarioId').equals(usuarioId).toArray(),
  ])

  const errores = [
    await subirPendientes(CATEGORIAS, categorias, userId, false),
    await subirPendientes(CUENTAS, cuentas, userId, false),
  ]
  return errores.filter((e): e is string => e !== null)
}

/**
 * Una transacción pendiente cuya categoría/cuenta ya no existe localmente
 * nunca podría subirse (llave foránea). Se re-apunta a la categoría
 * "ambos"/"Otros" y a la primera cuenta, para que no quede pendiente para
 * siempre. Las transferencias no tienen categoría y se respetan.
 */
async function repararReferenciasHuerfanas(usuarioId: string): Promise<void> {
  const [categorias, cuentas] = await Promise.all([
    db.categorias.where('usuarioId').equals(usuarioId).toArray(),
    db.cuentas.where('usuarioId').equals(usuarioId).toArray(),
  ])
  if (categorias.length === 0) return

  const idsCategorias = new Set(categorias.map((c) => c.id))
  const idsCuentas = new Set(cuentas.map((c) => c.id))
  const categoriaRespaldo =
    categorias.find((c) => c.tipo === 'ambos') ??
    categorias.find((c) => normalizar(c.nombre) === 'otros') ??
    categorias[0]
  const cuentaRespaldo = cuentas[0]?.id ?? ''

  const categoriaRota = (t: Transaccion) =>
    t.origen !== 'transferencia' && !idsCategorias.has(t.categoriaId)
  const cuentaRota = (t: Transaccion) => t.cuentaId !== '' && !idsCuentas.has(t.cuentaId)

  await db.transacciones
    .where('usuarioId')
    .equals(usuarioId)
    .filter((t) => !t.sincronizado && (categoriaRota(t) || cuentaRota(t)))
    .modify((t) => {
      if (categoriaRota(t)) t.categoriaId = categoriaRespaldo.id
      if (cuentaRota(t)) t.cuentaId = cuentaRespaldo
    })
}

// ---------------------------------------------------------------------------
// Borrados
// ---------------------------------------------------------------------------

/** Orden de borrado: primero lo que referencia a categorías/cuentas. */
const ORDEN_BORRADO: TablaSincronizable[] = [
  'transacciones',
  'presupuestos',
  'recurrentes',
  'metas',
  'deudas',
  'categorias',
  'cuentas',
]

/** Replica en Supabase los borrados locales pendientes. */
async function procesarEliminaciones(usuarioId: string): Promise<string[]> {
  if (!supabase) return []

  const pendientes = await db.eliminacionesPendientes.where('usuarioId').equals(usuarioId).toArray()
  const errores: string[] = []

  for (const tabla of ORDEN_BORRADO) {
    const deTabla = pendientes.filter((e) => e.tabla === tabla)
    if (deTabla.length === 0) continue

    const { error } = await supabase
      .from(tabla)
      .delete()
      .eq('user_id', usuarioId)
      .in(
        'id',
        deTabla.map((e) => e.registroId),
      )

    if (!error) {
      await db.eliminacionesPendientes.bulkDelete(deTabla.map((e) => e.id!))
    } else if (error.code !== CODIGO_ERROR_LLAVE_FORANEA && error.code !== 'PGRST205' && error.code !== '42P01') {
      // Llave foránea: aún la usa algo remoto, se reintenta el próximo
      // ciclo. Tabla inexistente: falta la migración (se avisa aparte).
      errores.push(describirError('No se pudo eliminar en Supabase', error))
    }
  }

  return errores
}

// ---------------------------------------------------------------------------
// Transacciones
// ---------------------------------------------------------------------------

async function marcarComoSincronizadas(transacciones: Transaccion[]): Promise<void> {
  if (transacciones.length === 0) return

  // Solo si no se volvieron a editar mientras se subían.
  const version = new Map(transacciones.map((t) => [t.id, t.fechaActualizacion.getTime()]))
  await db.transacciones
    .where('id')
    .anyOf([...version.keys()])
    .modify((t) => {
      if (t.fechaActualizacion.getTime() === version.get(t.id)) t.sincronizado = true
    })
}

/**
 * Reintenta la subida fila por fila cuando el upsert por lotes falló por un
 * error de datos, para que una sola fila no bloquee al resto de la cola.
 * Los duplicados (mismo n° de operación ya en el servidor) se descartan
 * localmente y se marcan como sincronizados para no reintentarlos.
 */
async function subirUnaPorUna(pendientes: Transaccion[], userId: string): Promise<number> {
  if (!supabase) return 0

  let subidas = 0
  const resueltas: Transaccion[] = []
  let ultimoError: ErrorSupabase | null = null

  for (const transaccion of pendientes) {
    const { error } = await supabase
      .from('transacciones')
      .upsert(aFilaTransaccion(transaccion, userId))

    if (!error) {
      resueltas.push(transaccion)
      subidas++
    } else if (error.code === CODIGO_ERROR_DUPLICADO) {
      resueltas.push(transaccion)
    } else {
      // Otros errores: se deja pendiente para reintentar en el próximo ciclo.
      ultimoError = error
    }
  }

  await marcarComoSincronizadas(resueltas)

  if (ultimoError) {
    throw new Error(describirError('Algunas transacciones no se pudieron subir', ultimoError))
  }

  return subidas
}

/**
 * Sube a Supabase las transacciones locales pendientes (sincronizado === false)
 * del usuario indicado, con el user_id de la sesión activa, y las marca
 * como sincronizadas en Dexie si la subida tiene éxito.
 */
export async function subirTransaccionesPendientes(usuarioId: string): Promise<number> {
  if (!supabase) return 0

  const userId = await usuarioSesionActiva(usuarioId)

  // 'sincronizado' no está indexado (IndexedDB no admite booleans como
  // clave de índice), por lo que se filtra en memoria.
  const pendientes = await db.transacciones
    .where('usuarioId')
    .equals(usuarioId)
    .filter((transaccion) => !transaccion.sincronizado)
    .toArray()

  if (pendientes.length === 0) return 0

  // Las columnas v7 solo van en algunas filas: con defaultToNull=false, a
  // las filas que no las traen se les aplica el DEFAULT de la columna.
  const { error } = await supabase
    .from('transacciones')
    .upsert(pendientes.map((t) => aFilaTransaccion(t, userId)), { defaultToNull: false })

  if (error) {
    if (esErrorDeDatos(error)) return subirUnaPorUna(pendientes, userId)
    throw new Error(describirError('No se pudieron subir las transacciones', error))
  }

  await marcarComoSincronizadas(pendientes)

  return pendientes.length
}

/**
 * Descarga las transacciones más recientes del usuario y las guarda en
 * Dexie. No pisa las que tienen cambios locales sin subir ni las borradas
 * localmente cuyo borrado aún no llega al servidor.
 */
export async function descargarTransaccionesRecientes(
  usuarioId: string,
  limite: number = LIMITE_DESCARGA,
): Promise<number> {
  if (!supabase) return 0

  const { data, error } = await supabase
    .from('transacciones')
    .select('*')
    .eq('user_id', usuarioId)
    .order('fecha_actualizacion', { ascending: false })
    .limit(limite)

  if (error) {
    throw new Error(describirError('No se pudieron descargar las transacciones', error))
  }

  if (!data || data.length === 0) return 0

  const borrados = await idsBorradosPendientes(usuarioId)
  const pendientes = new Set(
    (
      await db.transacciones
        .where('usuarioId')
        .equals(usuarioId)
        .filter((t) => !t.sincronizado)
        .primaryKeys()
    ).map(String),
  )

  const transacciones = (data as Record<string, unknown>[])
    .map(aTransaccionLocal)
    .filter((t) => !borrados.has(t.id) && !pendientes.has(t.id))

  await db.transacciones.bulkPut(transacciones)

  return transacciones.length
}

/**
 * Borra localmente las transacciones ya sincronizadas que no existen en el
 * servidor (se eliminaron desde otro dispositivo). Por seguridad no hace
 * nada si no pudo leer la lista completa de ids, o si borraría una
 * proporción sospechosa de los datos.
 */
async function reconciliarBorradosTransacciones(usuarioId: string): Promise<void> {
  if (!supabase) return

  const idsRemotos = new Set<string>()
  let total: number | null = null

  for (let desde = 0; total === null || desde < total; desde += PAGINA_IDS) {
    const { data, error, count } = await supabase
      .from('transacciones')
      .select('id', { count: 'exact' })
      .eq('user_id', usuarioId)
      .order('id')
      .range(desde, desde + PAGINA_IDS - 1)

    if (error || count === null) return
    total = count
    for (const fila of data ?? []) idsRemotos.add(fila.id as string)
    if ((data ?? []).length === 0) break
  }

  if (idsRemotos.size !== total) return

  const sincronizadas = await db.transacciones
    .where('usuarioId')
    .equals(usuarioId)
    .filter((t) => t.sincronizado)
    .primaryKeys()
  const aBorrar = sincronizadas.map(String).filter((id) => !idsRemotos.has(id))

  if (aBorrar.length > Math.max(20, sincronizadas.length * 0.3)) {
    console.warn(
      `[sync] Se omitió borrar ${aBorrar.length} de ${sincronizadas.length} transacciones ausentes en el servidor (proporción sospechosa).`,
    )
    return
  }

  await db.transacciones.bulkDelete(aBorrar)
}

// ---------------------------------------------------------------------------
// Ciclo completo
// ---------------------------------------------------------------------------

/**
 * Ejecuta un ciclo completo de sincronización para el usuario indicado.
 * El orden importa por las llaves foráneas:
 * 1. categorías y cuentas (antes que lo que las referencia),
 * 2. re-apunta transacciones pendientes con referencias rotas,
 * 3. sube las transacciones pendientes,
 * 4. replica los borrados,
 * 5. presupuestos, recurrentes, metas y deudas (solo esquema v7),
 * 6. descarga las transacciones recientes y reconcilia borrados.
 * Los errores de una entidad no detienen a las demás; al final se lanzan
 * todos juntos para mostrarlos.
 */
export async function sincronizar(usuarioId: string): Promise<ResultadoSincronizacion> {
  if (!supabase) return { subidas: 0, descargadas: 0, fecha: new Date(), migracionesPendientes: [] }

  const userId = await usuarioSesionActiva(usuarioId)
  const pendientesEsquema = await migracionesPendientes()
  const v7 = !pendientesEsquema.includes('v0.7.sql')
  const borrados = await idsBorradosPendientes(usuarioId)
  const errores: string[] = []
  const agregar = (e: string | null) => e && errores.push(e)

  if (v7) {
    agregar(
      await sincronizarEntidad(CATEGORIAS, usuarioId, userId, borrados, (r) =>
        fusionarCatalogo(usuarioId, db.categorias, 'categoriaId', r),
      ),
    )
    agregar(
      await sincronizarEntidad(CUENTAS, usuarioId, userId, borrados, (r) =>
        fusionarCatalogo(usuarioId, db.cuentas, 'cuentaId', r),
      ),
    )
  } else {
    await descargarCatalogos(usuarioId)
    errores.push(...(await subirCatalogosLegado(usuarioId, userId)))
  }
  const erroresCatalogos = errores.length

  await repararReferenciasHuerfanas(usuarioId)

  let subidas = 0
  try {
    subidas = await subirTransaccionesPendientes(usuarioId)
  } catch (err) {
    // Si falló un catálogo, las transacciones que lo usan fallan por llave
    // foránea: se informa la causa raíz (el catálogo), no esa consecuencia.
    if (erroresCatalogos === 0) errores.push((err as Error).message)
  }

  errores.push(...(await procesarEliminaciones(usuarioId)))

  if (v7) {
    agregar(await sincronizarEntidad(PRESUPUESTOS, usuarioId, userId, borrados))
    agregar(await sincronizarEntidad(RECURRENTES, usuarioId, userId, borrados))
    agregar(await sincronizarEntidad(METAS, usuarioId, userId, borrados))
    agregar(await sincronizarEntidad(DEUDAS, usuarioId, userId, borrados))
  }

  let descargadas = 0
  try {
    descargadas = await descargarTransaccionesRecientes(usuarioId)
    await reconciliarBorradosTransacciones(usuarioId)
  } catch (err) {
    errores.push((err as Error).message)
  }

  if (errores.length > 0) throw new Error(errores.join(' · '))

  return { subidas, descargadas, fecha: new Date(), migracionesPendientes: pendientesEsquema }
}
