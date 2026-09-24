import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/database'
import type { Categoria } from '../types'

export function useCategorias(usuarioId: string): Categoria[] {
  const categorias = useLiveQuery(
    () => db.categorias.where('usuarioId').equals(usuarioId).toArray(),
    [usuarioId],
  )

  return categorias ?? []
}
