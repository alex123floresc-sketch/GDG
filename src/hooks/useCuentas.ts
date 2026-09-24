import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/database'
import type { Cuenta } from '../types'

export function useCuentas(usuarioId: string): Cuenta[] {
  const cuentas = useLiveQuery(
    () => db.cuentas.where('usuarioId').equals(usuarioId).toArray(),
    [usuarioId],
  )

  return cuentas ?? []
}
