import { db } from '../db/database'
import type { ReciboLocal, Transaccion } from '../types'
import { comprimirImagen } from '../utils/imagen'
import { supabase } from './supabaseClient'

/*
 * Fotos de recibos. Offline-first como todo lo demás: la foto se guarda
 * primero en la tabla local `recibos` (id = id de la transacción) y
 * `sincronizarRecibos` la sube al bucket privado 'recibos' de Supabase
 * Storage (`<user_id>/<id>.jpg`; las políticas solo dejan tocar la carpeta
 * propia). En otro dispositivo se descarga al abrirla.
 *
 * Borrar: no hay que avisar a nadie. Una foto cuyo movimiento ya no existe
 * (o ya no la usa) queda "huérfana"; pasados unos minutos se borra del
 * servidor y del dispositivo. Esa espera deja que "Deshacer" la recupere.
 */

export const BUCKET_RECIBOS = 'recibos'
const ESPERA_HUERFANO_MS = 3 * 60 * 1000

export function rutaRecibo(usuarioId: string, transaccionId: string): string {
  return `${usuarioId}/${transaccionId}.jpg`
}

/** Guarda la foto (comprimida) de un movimiento. Devuelve su ruta para `Transaccion.recibo`. */
export async function guardarRecibo(usuarioId: string, transaccionId: string, foto: Blob): Promise<string> {
  const imagen = await comprimirImagen(foto)
  await db.recibos.put({ id: transaccionId, usuarioId, imagen, subido: false })
  return rutaRecibo(usuarioId, transaccionId)
}

/**
 * La foto de un movimiento: la del dispositivo o, si no está, la descarga
 * (y la guarda para la próxima). null si no tiene o no se pudo obtener.
 */
export async function obtenerRecibo(t: Transaccion): Promise<Blob | null> {
  if (!t.recibo) return null
  const local = await db.recibos.get(t.id)
  if (local?.imagen) return local.imagen
  if (!supabase) return null
  const { data, error } = await supabase.storage.from(BUCKET_RECIBOS).download(t.recibo)
  if (error || !data) throw new Error('No se pudo descargar la foto. Revisa tu conexión.')
  await db.recibos.put({ id: t.id, usuarioId: t.usuarioId, imagen: data, subido: true })
  return data
}

/**
 * Sube las fotos pendientes y borra las huérfanas. Devuelve un mensaje de
 * error (o null); una foto que falla no detiene a las demás.
 */
export async function sincronizarRecibos(usuarioId: string, userId: string): Promise<string | null> {
  if (!supabase) return null
  const filas = await db.recibos.where('usuarioId').equals(usuarioId).toArray()
  if (filas.length === 0) return null

  const movimientos = await db.transacciones.bulkGet(filas.map((f) => f.id))
  const ahora = Date.now()
  let fallidas = 0
  let ultimoError = ''

  for (const [i, fila] of filas.entries()) {
    const t = movimientos[i]
    const ruta = rutaRecibo(userId, fila.id)
    const enUso = !!t && t.recibo === ruta

    if (!enUso) {
      if (!fila.huerfanoDesde) {
        await db.recibos.update(fila.id, { huerfanoDesde: ahora })
        continue
      }
      if (ahora - fila.huerfanoDesde < ESPERA_HUERFANO_MS) continue
      const { error } = await supabase.storage.from(BUCKET_RECIBOS).remove([ruta])
      if (error) {
        fallidas++
        ultimoError = error.message
        continue
      }
      await db.recibos.delete(fila.id)
      continue
    }

    // Volvió a usarse (p. ej. "Deshacer"): se sube de nuevo por si alcanzó a borrarse.
    const cambios: Partial<ReciboLocal> = {}
    if (fila.huerfanoDesde) {
      cambios.huerfanoDesde = undefined
      cambios.subido = false
    }
    if ((fila.subido && !fila.huerfanoDesde) || !fila.imagen) {
      if (Object.keys(cambios).length) await db.recibos.update(fila.id, cambios)
      continue
    }
    const { error } = await supabase.storage.from(BUCKET_RECIBOS).upload(ruta, fila.imagen, {
      upsert: true,
      contentType: fila.imagen.type || 'image/jpeg',
      cacheControl: '31536000',
    })
    if (error) {
      fallidas++
      ultimoError = error.message
      if (Object.keys(cambios).length) await db.recibos.update(fila.id, cambios)
      continue
    }
    await db.recibos.update(fila.id, { ...cambios, subido: true })
  }

  return fallidas > 0
    ? `No se ${fallidas === 1 ? 'pudo subir 1 foto de recibo' : `pudieron subir ${fallidas} fotos de recibos`} (${ultimoError})`
    : null
}

/** Cuántas fotos faltan subir (para el indicador de pendientes). */
export function contarRecibosPendientes(usuarioId: string): Promise<number> {
  return db.recibos
    .where('usuarioId')
    .equals(usuarioId)
    .filter((r) => !r.subido && !!r.imagen && !r.huerfanoDesde)
    .count()
}
