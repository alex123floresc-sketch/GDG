import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/database'
import type { Transaccion } from '../types'

/**
 * Transacciones del usuario indicado, de la más reciente a la más antigua.
 * Se actualiza automáticamente ante cualquier cambio en Dexie.
 */
export function useTransacciones(usuarioId: string): Transaccion[] {
  const transacciones = useLiveQuery(async () => {
    const filas = await db.transacciones
      .where('usuarioId')
      .equals(usuarioId)
      .toArray()

    return filas.sort((a, b) => b.fecha.getTime() - a.fecha.getTime())
  }, [usuarioId])

  return transacciones ?? []
}
