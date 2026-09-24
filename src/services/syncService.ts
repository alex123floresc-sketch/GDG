import { db } from '../db/database'
import type { ResultadoSincronizacion, Transaccion } from '../types'
import { supabase } from './supabaseClient'

const TABLA_TRANSACCIONES = 'transacciones'
const LIMITE_DESCARGA = 200

interface FilaTransaccionRemota {
  id: string
  monto: number
  tipo: Transaccion['tipo']
  categoria: string
  fecha: string
  nota: string | null
  fecha_actualizacion: string
}

function aFilaRemota(transaccion: Transaccion) {
  return {
    id: transaccion.id,
    monto: transaccion.monto,
    tipo: transaccion.tipo,
    categoria: transaccion.categoria,
    fecha: transaccion.fecha.toISOString(),
    nota: transaccion.nota ?? null,
    fecha_actualizacion: transaccion.fechaActualizacion.toISOString(),
  }
}

function aTransaccionLocal(fila: FilaTransaccionRemota): Transaccion {
  return {
    id: fila.id,
    monto: fila.monto,
    tipo: fila.tipo,
    categoria: fila.categoria,
    fecha: new Date(fila.fecha),
    nota: fila.nota ?? undefined,
    sincronizado: true,
    fechaActualizacion: new Date(fila.fecha_actualizacion),
  }
}

/**
 * Sube a Supabase las transacciones locales pendientes (sincronizado === false)
 * y, si la subida tiene éxito, las marca como sincronizadas en Dexie.
 */
export async function subirTransaccionesPendientes(): Promise<number> {
  if (!supabase) return 0

  // 'sincronizado' no está indexado (IndexedDB no admite booleans como
  // clave de índice), por lo que se filtra en memoria.
  const pendientes = await db.transacciones
    .filter((transaccion) => !transaccion.sincronizado)
    .toArray()

  if (pendientes.length === 0) return 0

  const filas = pendientes.map(aFilaRemota)

  const { error } = await supabase.from(TABLA_TRANSACCIONES).upsert(filas)

  if (error) {
    throw new Error(`Error al subir transacciones a Supabase: ${error.message}`)
  }

  await db.transacciones.bulkUpdate(
    pendientes.map((transaccion) => ({
      key: transaccion.id,
      changes: { sincronizado: true },
    })),
  )

  return pendientes.length
}

/**
 * Descarga las transacciones más recientes desde Supabase y las
 * guarda (upsert) en Dexie, marcándolas como sincronizadas.
 */
export async function descargarTransaccionesRecientes(
  limite: number = LIMITE_DESCARGA,
): Promise<number> {
  if (!supabase) return 0

  const { data, error } = await supabase
    .from(TABLA_TRANSACCIONES)
    .select('*')
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
 * Ejecuta un ciclo completo de sincronización: primero sube los cambios
 * locales pendientes y luego descarga las transacciones remotas recientes.
 */
export async function sincronizar(): Promise<ResultadoSincronizacion> {
  const subidas = await subirTransaccionesPendientes()
  const descargadas = await descargarTransaccionesRecientes()

  return {
    subidas,
    descargadas,
    fecha: new Date(),
  }
}
