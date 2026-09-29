import { db } from '../db/database'
import type { Ajustes, Categoria, ClaseGasto } from '../types'
import { marcaCambio } from './sincronizable'

export const REPARTO_POR_DEFECTO = { necesidades: 50, deseos: 30, ahorro: 20 }
export const FONDO_MESES_POR_DEFECTO = 6

/** Ajustes vacíos (valores por defecto) de un usuario. */
export function ajustesVacios(usuarioId: string): Ajustes {
  return { id: usuarioId, usuarioId }
}

/**
 * Guarda cambios en los ajustes del usuario (una fila por usuario, con id =
 * usuarioId). `undefined` en un campo lo quita.
 */
export async function guardarAjustes(usuarioId: string, cambios: Partial<Omit<Ajustes, 'id' | 'usuarioId'>>): Promise<void> {
  await db.transaction('rw', db.ajustes, async () => {
    const actual = (await db.ajustes.get(usuarioId)) ?? ajustesVacios(usuarioId)
    await db.ajustes.put({ ...actual, ...cambios, id: usuarioId, usuarioId, ...marcaCambio() })
  })
}

/** Marca una categoría de gasto como necesidad o deseo (regla 50/30/20). */
export async function cambiarClaseCategoria(categoria: Categoria, clase: ClaseGasto | undefined): Promise<void> {
  const actual = await db.categorias.get(categoria.id)
  if (!actual) return
  const { clase: _anterior, ...resto } = actual
  await db.categorias.put({ ...resto, ...(clase ? { clase } : {}), ...marcaCambio() })
}
