import type { Table } from 'dexie'
import { db } from '../db/database'
import type {
  Categoria,
  Cuenta,
  OrigenTransaccion,
  ResultadoSincronizacion,
  TipoCategoria,
  TipoCuenta,
  Transaccion,
} from '../types'
import { supabase } from './supabaseClient'

const TABLA_TRANSACCIONES = 'transacciones'
const TABLA_CATEGORIAS = 'categorias'
const TABLA_CUENTAS = 'cuentas'
const LIMITE_DESCARGA = 200

/** Código de error de Postgres para violación de restricción única (23505). */
const CODIGO_ERROR_DUPLICADO = '23505'
/** Violación de llave foránea (p. ej. `cuenta_id` que no existe en `cuentas`). */
const CODIGO_ERROR_LLAVE_FORANEA = '23503'

interface FilaTransaccionRemota {
  id: string
  user_id: string
  cuenta_id: string | null
  categoria_id: string
  monto: number
  tipo: Transaccion['tipo']
  fecha: string
  concepto: string | null
  nro_operacion: string | null
  origen: string
  fecha_actualizacion: string
}

interface FilaCategoriaRemota {
  id: string
  user_id: string
  nombre: string
  tipo: TipoCategoria
  icono: string | null
  color: string | null
}

interface FilaCuentaRemota {
  id: string
  user_id: string
  nombre: string
  tipo: TipoCuenta
  saldo_inicial: number
}

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
      return 'Una tabla de Supabase no tiene todas las columnas que usa la app.'
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
// Traducción local (camelCase) <-> remoto (snake_case). Único lugar que lo
// hace. Las filas remotas se construyen campo por campo (lista blanca), así
// que los campos solo-locales como `sincronizado` nunca viajan.
// ---------------------------------------------------------------------------

function aFilaRemota(
  transaccion: Transaccion,
  userId: string,
): FilaTransaccionRemota {
  return {
    id: transaccion.id,
    user_id: userId,
    // Las descargadas sin cuenta llegan como '' (ver aTransaccionLocal).
    cuenta_id: transaccion.cuentaId || null,
    categoria_id: transaccion.categoriaId,
    monto: transaccion.monto,
    tipo: transaccion.tipo,
    fecha: transaccion.fecha.toISOString(),
    concepto: transaccion.concepto ?? null,
    nro_operacion: transaccion.nroOperacion ?? null,
    origen: transaccion.origen,
    fecha_actualizacion: transaccion.fechaActualizacion.toISOString(),
  }
}

function aOrigen(valor: string): OrigenTransaccion {
  return valor === 'yape' ? 'yape' : 'manual'
}

function aTransaccionLocal(fila: FilaTransaccionRemota): Transaccion {
  return {
    id: fila.id,
    usuarioId: fila.user_id,
    cuentaId: fila.cuenta_id ?? '',
    categoriaId: fila.categoria_id,
    monto: Number(fila.monto),
    tipo: fila.tipo,
    fecha: new Date(fila.fecha),
    concepto: fila.concepto ?? undefined,
    nroOperacion: fila.nro_operacion ?? undefined,
    origen: aOrigen(fila.origen),
    sincronizado: true,
    fechaActualizacion: new Date(fila.fecha_actualizacion),
  }
}

function aFilaCategoria(categoria: Categoria, userId: string): FilaCategoriaRemota {
  return {
    id: categoria.id,
    user_id: userId,
    nombre: categoria.nombre,
    tipo: categoria.tipo,
    icono: categoria.icono ?? null,
    color: categoria.color ?? null,
  }
}

function aCategoriaLocal(fila: FilaCategoriaRemota): Categoria {
  return {
    id: fila.id,
    usuarioId: fila.user_id,
    nombre: fila.nombre,
    tipo: fila.tipo,
    icono: fila.icono ?? undefined,
    color: fila.color ?? undefined,
  }
}

function aFilaCuenta(cuenta: Cuenta, userId: string): FilaCuentaRemota {
  return {
    id: cuenta.id,
    user_id: userId,
    nombre: cuenta.nombre,
    tipo: cuenta.tipo,
    saldo_inicial: cuenta.saldoInicial,
  }
}

function aCuentaLocal(fila: FilaCuentaRemota): Cuenta {
  return {
    id: fila.id,
    usuarioId: fila.user_id,
    nombre: fila.nombre,
    tipo: fila.tipo,
    saldoInicial: Number(fila.saldo_inicial) || 0,
  }
}

// ---------------------------------------------------------------------------
// Catálogos (categorías y cuentas)
// ---------------------------------------------------------------------------

/** Nombre comparable: sin mayúsculas, espacios extremos ni tildes. */
function normalizar(texto: string): string {
  return texto
    .trim()
    .toLocaleLowerCase('es')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
}

/**
 * Fusiona en Dexie las filas remotas de un catálogo (categorías o cuentas):
 * - las que no existen localmente se agregan (p. ej. al volver a iniciar
 *   sesión, o creadas en otro dispositivo);
 * - si localmente hay una con el mismo nombre y tipo pero otro id que aún
 *   no está en el servidor (típico de las sembradas por defecto en cada
 *   dispositivo), se adopta el id remoto y se re-apuntan las transacciones
 *   locales a él;
 * - las que ya existen con el mismo id se dejan como están localmente (se
 *   suben después con `subirCatalogos`).
 */
async function fusionarCatalogo<T extends Categoria | Cuenta>(
  usuarioId: string,
  tabla: Table<T, string>,
  campo: 'categoriaId' | 'cuentaId',
  remotos: T[],
): Promise<void> {
  if (remotos.length === 0) return

  const clave = (r: T) => `${normalizar(r.nombre)}|${r.tipo}`

  await db.transaction('rw', tabla, db.transacciones, async () => {
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
        await db.transacciones
          .where(campo)
          .equals(duplicado.id)
          .modify({ [campo]: remoto.id, sincronizado: false, fechaActualizacion: new Date() })
        await tabla.delete(duplicado.id)
        localesSoloAqui.delete(clave(remoto))
      }

      await tabla.put(remoto)
    }
  })
}

/**
 * Trae las categorías y cuentas remotas del usuario y las fusiona en Dexie
 * (ver `fusionarCatalogo`). Se llama al iniciar sesión, antes de sembrar
 * las categorías/cuentas por defecto, y en cada ciclo de sincronización.
 */
export async function descargarCatalogos(usuarioId: string): Promise<void> {
  if (!supabase) return

  const [categorias, cuentas] = await Promise.all([
    supabase
      .from(TABLA_CATEGORIAS)
      .select('id, user_id, nombre, tipo, icono, color')
      .eq('user_id', usuarioId),
    supabase
      .from(TABLA_CUENTAS)
      .select('id, user_id, nombre, tipo, saldo_inicial')
      .eq('user_id', usuarioId),
  ])

  if (categorias.error) {
    throw new Error(describirError('No se pudieron descargar las categorías', categorias.error))
  }
  if (cuentas.error) {
    throw new Error(describirError('No se pudieron descargar las cuentas', cuentas.error))
  }

  // Borrados locales aún no replicados: no se deben "resucitar".
  const borrados = new Set(
    (await db.eliminacionesPendientes.where('usuarioId').equals(usuarioId).toArray()).map(
      (e) => e.registroId,
    ),
  )

  await fusionarCatalogo(
    usuarioId,
    db.categorias,
    'categoriaId',
    ((categorias.data ?? []) as FilaCategoriaRemota[])
      .map(aCategoriaLocal)
      .filter((c) => !borrados.has(c.id)),
  )
  await fusionarCatalogo(
    usuarioId,
    db.cuentas,
    'cuentaId',
    ((cuentas.data ?? []) as FilaCuentaRemota[])
      .map(aCuentaLocal)
      .filter((c) => !borrados.has(c.id)),
  )
}

/**
 * Sube (upsert) todas las categorías y cuentas locales del usuario. Son
 * pocas filas, así que se envían completas en cada ciclo. Deben existir en
 * Supabase antes que las transacciones que las referencian (llaves
 * foráneas `categoria_id` / `cuenta_id`).
 */
async function subirCatalogos(usuarioId: string, userId: string): Promise<void> {
  if (!supabase) return

  const [categorias, cuentas] = await Promise.all([
    db.categorias.where('usuarioId').equals(usuarioId).toArray(),
    db.cuentas.where('usuarioId').equals(usuarioId).toArray(),
  ])

  if (categorias.length > 0) {
    const { error } = await supabase
      .from(TABLA_CATEGORIAS)
      .upsert(categorias.map((c) => aFilaCategoria(c, userId)))
    if (error) throw new Error(describirError('No se pudieron subir las categorías', error))
  }

  if (cuentas.length > 0) {
    const { error } = await supabase
      .from(TABLA_CUENTAS)
      .upsert(cuentas.map((c) => aFilaCuenta(c, userId)))
    if (error) throw new Error(describirError('No se pudieron subir las cuentas', error))
  }
}

/**
 * Una transacción pendiente cuya categoría/cuenta ya no existe localmente
 * nunca podría subirse (llave foránea). Se re-apunta a la categoría
 * "ambos"/"Otros" y a la primera cuenta, para que no quede pendiente para
 * siempre.
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

  await db.transacciones
    .where('usuarioId')
    .equals(usuarioId)
    .filter(
      (t) =>
        !t.sincronizado &&
        (!idsCategorias.has(t.categoriaId) ||
          (t.cuentaId !== '' && !idsCuentas.has(t.cuentaId))),
    )
    .modify((t) => {
      if (!idsCategorias.has(t.categoriaId)) t.categoriaId = categoriaRespaldo.id
      if (t.cuentaId !== '' && !idsCuentas.has(t.cuentaId)) t.cuentaId = cuentaRespaldo
    })
}

/** Replica en Supabase los borrados locales de categorías/cuentas. */
async function procesarEliminaciones(usuarioId: string): Promise<void> {
  if (!supabase) return

  const pendientes = await db.eliminacionesPendientes
    .where('usuarioId')
    .equals(usuarioId)
    .toArray()

  for (const e of pendientes) {
    const { error } = await supabase
      .from(e.tabla)
      .delete()
      .eq('id', e.registroId)
      .eq('user_id', usuarioId)

    if (!error) {
      await db.eliminacionesPendientes.delete(e.id!)
    } else if (error.code !== CODIGO_ERROR_LLAVE_FORANEA) {
      // Con llave foránea (aún la usa alguna transacción remota) se
      // reintenta en el siguiente ciclo; otros errores se reportan.
      throw new Error(describirError('No se pudo eliminar en Supabase', error))
    }
  }
}

// ---------------------------------------------------------------------------
// Transacciones
// ---------------------------------------------------------------------------

function esErrorDuplicado(error: ErrorSupabase): boolean {
  return error.code === CODIGO_ERROR_DUPLICADO
}

async function marcarComoSincronizadas(
  transacciones: Transaccion[],
): Promise<void> {
  if (transacciones.length === 0) return

  await db.transacciones.bulkUpdate(
    transacciones.map((transaccion) => ({
      key: transaccion.id,
      changes: { sincronizado: true },
    })),
  )
}

/**
 * Reintenta la subida fila por fila cuando el upsert por lotes falló por
 * una sola fila (restricción única (user_id, nro_operacion) o llave
 * foránea). Así esa fila no bloquea al resto de la cola: los duplicados se
 * descartan localmente (ya existe esa operación en el servidor) y se marcan
 * como sincronizados para no reintentarlos en cada ciclo.
 */
async function subirUnaPorUna(
  pendientes: Transaccion[],
  userId: string,
): Promise<number> {
  if (!supabase) return 0

  let subidas = 0
  const resueltas: Transaccion[] = []
  let ultimoError: ErrorSupabase | null = null

  for (const transaccion of pendientes) {
    const { error } = await supabase
      .from(TABLA_TRANSACCIONES)
      .upsert(aFilaRemota(transaccion, userId))

    if (!error) {
      resueltas.push(transaccion)
      subidas++
    } else if (esErrorDuplicado(error)) {
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
export async function subirTransaccionesPendientes(
  usuarioId: string,
): Promise<number> {
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

  const filas = pendientes.map((t) => aFilaRemota(t, userId))

  const { error } = await supabase.from(TABLA_TRANSACCIONES).upsert(filas)

  if (error) {
    if (esErrorDuplicado(error) || error.code === CODIGO_ERROR_LLAVE_FORANEA) {
      return subirUnaPorUna(pendientes, userId)
    }
    throw new Error(describirError('No se pudieron subir las transacciones', error))
  }

  await marcarComoSincronizadas(pendientes)

  return pendientes.length
}

/**
 * Descarga las transacciones más recientes del usuario indicado desde
 * Supabase y las guarda (upsert) en Dexie, marcándolas como sincronizadas.
 */
export async function descargarTransaccionesRecientes(
  usuarioId: string,
  limite: number = LIMITE_DESCARGA,
): Promise<number> {
  if (!supabase) return 0

  const { data, error } = await supabase
    .from(TABLA_TRANSACCIONES)
    .select('*')
    .eq('user_id', usuarioId)
    .order('fecha_actualizacion', { ascending: false })
    .limit(limite)

  if (error) {
    throw new Error(describirError('No se pudieron descargar las transacciones', error))
  }

  if (!data || data.length === 0) return 0

  const transacciones = (data as FilaTransaccionRemota[]).map(aTransaccionLocal)

  await db.transacciones.bulkPut(transacciones)

  return transacciones.length
}

/**
 * Ejecuta un ciclo completo de sincronización para el usuario indicado.
 * El orden importa por las llaves foráneas de `transacciones`:
 * 1. fusiona categorías/cuentas remotas en Dexie,
 * 2. sube categorías/cuentas locales,
 * 3. re-apunta transacciones pendientes con referencias rotas,
 * 4. sube las transacciones pendientes,
 * 5. replica los borrados de categorías/cuentas,
 * 6. descarga las transacciones remotas recientes.
 */
export async function sincronizar(
  usuarioId: string,
): Promise<ResultadoSincronizacion> {
  if (supabase) {
    const userId = await usuarioSesionActiva(usuarioId)
    await descargarCatalogos(usuarioId)
    await subirCatalogos(usuarioId, userId)
    await repararReferenciasHuerfanas(usuarioId)
  }

  const subidas = await subirTransaccionesPendientes(usuarioId)
  await procesarEliminaciones(usuarioId)
  const descargadas = await descargarTransaccionesRecientes(usuarioId)

  return {
    subidas,
    descargadas,
    fecha: new Date(),
  }
}
