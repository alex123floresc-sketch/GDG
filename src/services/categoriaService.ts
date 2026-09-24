import { db } from '../db/database'
import type { NuevaCategoria } from '../types'

const CATEGORIAS_BASE: NuevaCategoria[] = [
  { nombre: 'Salario', tipo: 'ingreso', icono: '💼', color: '#22c55e' },
  { nombre: 'Freelance', tipo: 'ingreso', icono: '🧾', color: '#14b8a6' },
  { nombre: 'Inversiones', tipo: 'ingreso', icono: '📈', color: '#0ea5e9' },
  { nombre: 'Alimentación', tipo: 'gasto', icono: '🍽️', color: '#f97316' },
  { nombre: 'Transporte', tipo: 'gasto', icono: '🚌', color: '#eab308' },
  { nombre: 'Vivienda', tipo: 'gasto', icono: '🏠', color: '#a855f7' },
  { nombre: 'Salud', tipo: 'gasto', icono: '💊', color: '#ef4444' },
  { nombre: 'Entretenimiento', tipo: 'gasto', icono: '🎬', color: '#ec4899' },
  { nombre: 'Otros', tipo: 'ambos', icono: '📦', color: '#64748b' },
]

/**
 * Crea las categorías por defecto para un usuario si todavía no tiene
 * ninguna (p. ej. su primer inicio de sesión en este dispositivo).
 */
export async function asegurarCategoriasPorDefecto(
  usuarioId: string,
): Promise<void> {
  const existentes = await db.categorias
    .where('usuarioId')
    .equals(usuarioId)
    .count()

  if (existentes > 0) return

  await db.categorias.bulkAdd(
    CATEGORIAS_BASE.map((categoria) => ({
      ...categoria,
      id: crypto.randomUUID(),
      usuarioId,
    })),
  )
}
