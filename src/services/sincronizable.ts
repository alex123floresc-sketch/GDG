import { db } from '../db/database'
import type { TablaSincronizable } from '../types'

/**
 * Campos a poner en toda alta/edición de una entidad sincronizable: la
 * marca como pendiente de subir y fecha la edición (en un conflicto entre
 * dispositivos gana la más reciente; ver syncService).
 */
export function marcaCambio(): { sincronizado: false; fechaActualizacion: Date } {
  return { sincronizado: false, fechaActualizacion: new Date() }
}

/** Deja registrado un borrado para replicarlo en Supabase. */
export async function registrarBorrado(
  tabla: TablaSincronizable,
  usuarioId: string,
  ids: string[],
): Promise<void> {
  if (ids.length === 0) return
  await db.eliminacionesPendientes.bulkAdd(
    ids.map((registroId) => ({ usuarioId, tabla, registroId })),
  )
}

/**
 * UUID determinista a partir de un texto (SHA-256). Lo usan los
 * movimientos recurrentes: si dos dispositivos generan la misma
 * ocurrencia, obtienen el mismo id y no se duplica.
 */
export async function uuidDeterminista(texto: string): Promise<string> {
  const hash = new Uint8Array(
    await crypto.subtle.digest('SHA-256', new TextEncoder().encode(texto)),
  )
  hash[6] = (hash[6] & 0x0f) | 0x80 // versión 8 (definida por la app)
  hash[8] = (hash[8] & 0x3f) | 0x80 // variante RFC 4122
  const hex = [...hash.slice(0, 16)].map((b) => b.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`
}
