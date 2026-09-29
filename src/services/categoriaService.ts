import type { Table } from 'dexie'
import { db } from '../db/database'
import type { Categoria, NuevaCategoria, Plantilla, Regla } from '../types'
import { registrarBorrado, uuidDeterminista } from './sincronizable'

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
  // Ids deterministas (usuario + nombre): dos siembras simultáneas generan
  // los mismos y no se duplican (ver asegurarCuentasPorDefecto).
  const base: Categoria[] = await Promise.all(
    CATEGORIAS_BASE.map(async (categoria) => ({
      ...categoria,
      id: await uuidDeterminista(`${usuarioId}|categoria|${categoria.nombre}`),
      usuarioId,
    })),
  )

  await db.transaction('rw', db.categorias, async () => {
    if ((await db.categorias.where('usuarioId').equals(usuarioId).count()) > 0) return
    await db.categorias.bulkPut(base)
  })
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

/**
 * Valida la categoría madre de una subcategoría: debe existir, ser de primer
 * nivel (un solo nivel de anidación), no ser ella misma y aceptar el tipo.
 */
async function validarPadre(datos: NuevaCategoria, id?: string): Promise<string | undefined> {
  if (!datos.padreId) return undefined
  if (datos.padreId === id) throw new Error('Una categoría no puede estar dentro de sí misma.')
  const padre = await db.categorias.get(datos.padreId)
  if (!padre) throw new Error('La categoría madre ya no existe.')
  if (padre.padreId) throw new Error(`"${padre.nombre}" ya es una subcategoría: elige una de primer nivel.`)
  if (padre.tipo !== 'ambos' && padre.tipo !== datos.tipo) {
    throw new Error(`"${padre.nombre}" es de ${padre.tipo === 'gasto' ? 'gastos' : 'ingresos'}: la subcategoría debe ser del mismo tipo.`)
  }
  if (id && (await db.categorias.filter((c) => c.padreId === id).count()) > 0) {
    throw new Error('Esta categoría tiene subcategorías: no puede ser subcategoría de otra.')
  }
  return padre.id
}

export async function crearCategoria(
  datos: NuevaCategoria,
  usuarioId: string,
): Promise<Categoria> {
  const categoria: Categoria = {
    ...datos,
    padreId: await validarPadre(datos),
    nombre: await validarNombre(usuarioId, datos.nombre),
    id: crypto.randomUUID(),
    usuarioId,
    sincronizado: false,
    fechaActualizacion: new Date(),
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
  const padreId = await validarPadre(datos, id)
  const actual = await db.categorias.get(id)
  if (!actual) throw new Error('La categoría ya no existe.')
  // put: si se quita la madre, `padreId` debe desaparecer.
  await db.categorias.put({
    ...actual,
    ...datos,
    padreId,
    nombre,
    sincronizado: false,
    fechaActualizacion: new Date(),
  })
}

/** Cuántas transacciones del usuario usan la categoría. */
export function contarUsos(categoriaId: string): Promise<number> {
  return db.transacciones.where('categoriaId').equals(categoriaId).count()
}

/**
 * Reglas/plantillas de una categoría que se elimina: pasan a `destino` o,
 * si no hay, se eliminan (también en Supabase).
 */
async function moverOEliminar<T extends Regla | Plantilla>(
  tabla: Table<T, string>,
  nombre: 'reglas' | 'plantillas',
  usuarioId: string,
  categoriaId: string,
  destino?: string,
): Promise<void> {
  const afectadas = await tabla
    .where('usuarioId')
    .equals(usuarioId)
    .filter((r) => r.categoriaId === categoriaId)
    .toArray()
  if (afectadas.length === 0) return
  if (destino) {
    await tabla.bulkPut(
      afectadas.map((r) => ({ ...r, categoriaId: destino, sincronizado: false, fechaActualizacion: new Date() })),
    )
  } else {
    await tabla.bulkDelete(afectadas.map((r) => r.id))
    await registrarBorrado(nombre, usuarioId, afectadas.map((r) => r.id))
  }
}

/**
 * Elimina una categoría. Si tiene transacciones o movimientos recurrentes,
 * deben reasignarse a otra (`reasignarA`): se marcan como no sincronizados
 * para que el cambio de `categoria_id` llegue también a Supabase. Sus
 * presupuestos se eliminan; sus reglas y plantillas pasan a `reasignarA` (o
 * se eliminan si no hay a dónde); sus subcategorías quedan de primer nivel.
 */
export async function eliminarCategoria(
  id: string,
  reasignarA?: string,
): Promise<void> {
  const tablas = [
    db.categorias,
    db.transacciones,
    db.presupuestos,
    db.recurrentes,
    db.reglas,
    db.plantillas,
    db.cuotas,
    db.eliminacionesPendientes,
  ]
  await db.transaction('rw', tablas, async () => {
    const categoria = await db.categorias.get(id)
    if (!categoria) return

    const usos = db.transacciones.where('categoriaId').equals(id)
    const recurrentes = db.recurrentes.filter((r) => r.categoriaId === id)
    const cuotas = db.cuotas.filter((c) => c.categoriaId === id)
    const cambio = { categoriaId: reasignarA, sincronizado: false, fechaActualizacion: new Date() }

    if ((await usos.count()) + (await recurrentes.count()) + (await cuotas.count()) > 0) {
      if (!reasignarA || reasignarA === id) {
        throw new Error('Elige a qué categoría pasan sus transacciones.')
      }
      await usos.modify(cambio)
      await recurrentes.modify(cambio)
      await cuotas.modify(cambio)
    }

    const destino = reasignarA && reasignarA !== id ? reasignarA : undefined
    await moverOEliminar(db.reglas, 'reglas', categoria.usuarioId, id, destino)
    await moverOEliminar(db.plantillas, 'plantillas', categoria.usuarioId, id, destino)

    await db.categorias
      .where('usuarioId')
      .equals(categoria.usuarioId)
      .filter((c) => c.padreId === id)
      .modify((c) => {
        delete c.padreId
        c.sincronizado = false
        c.fechaActualizacion = new Date()
      })

    const presupuestos = await db.presupuestos.where('categoriaId').equals(id).toArray()
    await db.presupuestos.bulkDelete(presupuestos.map((p) => p.id))
    await db.eliminacionesPendientes.bulkAdd(
      presupuestos.map((p) => ({
        usuarioId: categoria.usuarioId,
        tabla: 'presupuestos' as const,
        registroId: p.id,
      })),
    )

    await db.categorias.delete(id)
    // Se borra en Supabase en la próxima sincronización, después de subir
    // las transacciones reasignadas (si no, la llave foránea lo impediría).
    await db.eliminacionesPendientes.add({
      usuarioId: categoria.usuarioId,
      tabla: 'categorias',
      registroId: id,
    })
  })
}
