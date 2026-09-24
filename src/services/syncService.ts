import { db } from '../db/database'
import type { OrigenTransaccion, ResultadoSincronizacion, Transaccion } from '../types'
import { supabase } from './supabaseClient'

const TABLA_TRANSACCIONES = 'transacciones'
const LIMITE_DESCARGA = 200

/** Código de error de Postgres para violación de restricción única (23505). */
const CODIGO_ERROR_DUPLICADO = '23505'

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

interface ErrorSupabase {
  message: string
  code?: string
}

function aFilaRemota(transaccion: Transaccion) {
  return {
    id: transaccion.id,
    user_id: transaccion.usuarioId,
    cuenta_id: transaccion.cuentaId,
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
    monto: fila.monto,
    tipo: fila.tipo,
    fecha: new Date(fila.fecha),
    concepto: fila.concepto ?? undefined,
    nroOperacion: fila.nro_operacion ?? undefined,
    origen: aOrigen(fila.origen),
    sincronizado: true,
    fechaActualizacion: new Date(fila.fecha_actualizacion),
  }
}

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
 * Reintenta la subida fila por fila cuando el upsert por lotes chocó con la
 * restricción única (user_id, nro_operacion). Así una sola fila duplicada
 * no bloquea al resto de la cola: los duplicados se descartan localmente
 * (ya existe esa operación en el servidor) y se marcan como sincronizados
 * para no reintentarlos en cada ciclo.
 */
async function subirUnaPorUna(pendientes: Transaccion[]): Promise<number> {
  if (!supabase) return 0

  let subidas = 0
  const resueltas: Transaccion[] = []

  for (const transaccion of pendientes) {
    const { error } = await supabase
      .from(TABLA_TRANSACCIONES)
      .upsert(aFilaRemota(transaccion))

    if (!error) {
      resueltas.push(transaccion)
      subidas++
    } else if (esErrorDuplicado(error)) {
      resueltas.push(transaccion)
    }
    // Otros errores: se deja pendiente para reintentar en el próximo ciclo.
  }

  await marcarComoSincronizadas(resueltas)

  return subidas
}

/**
 * Sube a Supabase las transacciones locales pendientes (sincronizado === false)
 * del usuario indicado, asignando explícitamente su user_id, y las marca
 * como sincronizadas en Dexie si la subida tiene éxito.
 */
export async function subirTransaccionesPendientes(
  usuarioId: string,
): Promise<number> {
  if (!supabase) return 0

  // 'sincronizado' no está indexado (IndexedDB no admite booleans como
  // clave de índice), por lo que se filtra en memoria.
  const pendientes = await db.transacciones
    .where('usuarioId')
    .equals(usuarioId)
    .filter((transaccion) => !transaccion.sincronizado)
    .toArray()

  if (pendientes.length === 0) return 0

  const filas = pendientes.map(aFilaRemota)

  const { error } = await supabase.from(TABLA_TRANSACCIONES).upsert(filas)

  if (error) {
    if (esErrorDuplicado(error)) {
      return subirUnaPorUna(pendientes)
    }
    throw new Error(`Error al subir transacciones a Supabase: ${error.message}`)
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
    throw new Error(`Error al descargar transacciones de Supabase: ${error.message}`)
  }

  if (!data || data.length === 0) return 0

  const transacciones = (data as FilaTransaccionRemota[]).map(aTransaccionLocal)

  await db.transacciones.bulkPut(transacciones)

  return transacciones.length
}

/**
 * Ejecuta un ciclo completo de sincronización para el usuario indicado:
 * primero sube sus cambios locales pendientes y luego descarga sus
 * transacciones remotas recientes.
 */
export async function sincronizar(
  usuarioId: string,
): Promise<ResultadoSincronizacion> {
  const subidas = await subirTransaccionesPendientes(usuarioId)
  const descargadas = await descargarTransaccionesRecientes(usuarioId)

  return {
    subidas,
    descargadas,
    fecha: new Date(),
  }
}
