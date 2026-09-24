import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/database'
import type { Transaccion } from '../types'

/**
 * Transacciones ordenadas de la más reciente a la más antigua.
 * Se actualiza automáticamente ante cualquier cambio en Dexie.
 */
export function useTransacciones(): Transaccion[] {
  const transacciones = useLiveQuery(
    () => db.transacciones.orderBy('fecha').reverse().toArray(),
    [],
  )

  return transacciones ?? []
}
