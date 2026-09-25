import { db } from '../db/database'
import type { Categoria, NuevaCategoria } from '../types'

/**
 * Paleta para categorías: los 8 tonos categóricos validados para daltonismo
 * (en este orden) + gris neutro. Es la que ofrece el selector de color al
 * crear/editar una categoría.
 */
export const COLORES_CATEGORIA = [
  '#2a78d6', // azul
  '#eb6834', // naranja
  '#1baf7a', // aqua
  '#eda100', // amarillo
  '#e87ba4', // magenta
  '#008300', // verde
  '#4a3aa7', // violeta
  '#e34948', // rojo
  '#898781', // gris
]

/** Iconos de Semantic UI ofrecidos al crear/editar una categoría. */
export const ICONOS_CATEGORIA = [
  'utensils', 'coffee', 'shopping cart', 'shopping bag', 'bus', 'car',
  'taxi', 'gas pump', 'plane', 'home', 'lightbulb', 'tint', 'wifi',
  'mobile alternate', 'medkit', 'heartbeat', 'dumbbell', 'graduation cap',
  'book', 'film', 'gamepad', 'music', 'tshirt', 'gift', 'paw', 'child',
  'baby', 'cut', 'wrench', 'tools', 'building', 'university', 'credit card',
  'money bill alternate', 'piggy bank', 'briefcase', 'file invoice dollar',
  'chartline', 'hand holding usd', 'handshake', 'store', 'laptop', 'globe',
  'beer', 'pizza slice', 'birthday cake', 'umbrella beach', 'box', 'tag',
]

// `icono` es el nombre de un icono de Semantic/Fomantic UI (`<i class="… icon">`).
const CATEGORIAS_BASE: NuevaCategoria[] = [
  { nombre: 'Salario', tipo: 'ingreso', icono: 'briefcase', color: '#008300' },
  { nombre: 'Freelance', tipo: 'ingreso', icono: 'file invoice dollar', color: '#4a3aa7' },
  { nombre: 'Inversiones', tipo: 'ingreso', icono: 'chartline', color: '#2a78d6' },
  { nombre: 'Alimentación', tipo: 'gasto', icono: 'utensils', color: '#2a78d6' },
  { nombre: 'Transporte', tipo: 'gasto', icono: 'bus', color: '#eb6834' },
  { nombre: 'Vivienda', tipo: 'gasto', icono: 'home', color: '#1baf7a' },
  { nombre: 'Salud', tipo: 'gasto', icono: 'medkit', color: '#eda100' },
  { nombre: 'Entretenimiento', tipo: 'gasto', icono: 'film', color: '#e87ba4' },
  { nombre: 'Otros', tipo: 'ambos', icono: 'box', color: '#898781' },
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

async function validarNombre(
  usuarioId: string,
  nombre: string,
  excluirId?: string,
): Promise<string> {
  const limpio = nombre.trim()
  if (!limpio) throw new Error('El nombre de la categoría es obligatorio.')

  const repetida = await db.categorias
    .where('usuarioId')
    .equals(usuarioId)
    .filter(
      (c) =>
        c.id !== excluirId &&
        c.nombre.localeCompare(limpio, 'es', { sensitivity: 'base' }) === 0,
    )
    .first()

  if (repetida) throw new Error(`Ya existe una categoría llamada "${repetida.nombre}".`)
  return limpio
}

export async function crearCategoria(
  datos: NuevaCategoria,
  usuarioId: string,
): Promise<Categoria> {
  const categoria: Categoria = {
    ...datos,
    nombre: await validarNombre(usuarioId, datos.nombre),
    id: crypto.randomUUID(),
    usuarioId,
  }

  await db.categorias.add(categoria)
  return categoria
}

export async function actualizarCategoria(
  id: string,
  datos: NuevaCategoria,
  usuarioId: string,
): Promise<void> {
  const nombre = await validarNombre(usuarioId, datos.nombre, id)
  await db.categorias.update(id, { ...datos, nombre })
}

/** Cuántas transacciones del usuario usan la categoría. */
export function contarUsos(categoriaId: string): Promise<number> {
  return db.transacciones.where('categoriaId').equals(categoriaId).count()
}

/**
 * Elimina una categoría. Si tiene transacciones, deben reasignarse a otra
 * (`reasignarA`): se marcan como no sincronizadas para que el cambio de
 * `categoria_id` llegue también a Supabase.
 */
export async function eliminarCategoria(
  id: string,
  reasignarA?: string,
): Promise<void> {
  await db.transaction('rw', db.categorias, db.transacciones, async () => {
    const usos = db.transacciones.where('categoriaId').equals(id)

    if ((await usos.count()) > 0) {
      if (!reasignarA || reasignarA === id) {
        throw new Error('Elige a qué categoría pasan sus transacciones.')
      }
      await usos.modify({
        categoriaId: reasignarA,
        sincronizado: false,
        fechaActualizacion: new Date(),
      })
    }

    await db.categorias.delete(id)
  })
}
