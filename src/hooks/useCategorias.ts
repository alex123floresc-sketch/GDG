import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/database'
import type { Categoria } from '../types'

export function useCategorias(): Categoria[] {
  const categorias = useLiveQuery(() => db.categorias.toArray(), [])

  return categorias ?? []
}
