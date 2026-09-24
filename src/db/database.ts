import Dexie, { type Table } from 'dexie'
import type { Categoria, Transaccion } from '../types'

const CATEGORIAS_INICIALES: Categoria[] = [
  { id: 'cat-salario', nombre: 'Salario', tipo: 'ingreso', icono: '💼', color: '#22c55e' },
  { id: 'cat-freelance', nombre: 'Freelance', tipo: 'ingreso', icono: '🧾', color: '#14b8a6' },
  { id: 'cat-inversiones', nombre: 'Inversiones', tipo: 'ingreso', icono: '📈', color: '#0ea5e9' },
  { id: 'cat-alimentacion', nombre: 'Alimentación', tipo: 'gasto', icono: '🍽️', color: '#f97316' },
  { id: 'cat-transporte', nombre: 'Transporte', tipo: 'gasto', icono: '🚌', color: '#eab308' },
  { id: 'cat-vivienda', nombre: 'Vivienda', tipo: 'gasto', icono: '🏠', color: '#a855f7' },
  { id: 'cat-salud', nombre: 'Salud', tipo: 'gasto', icono: '💊', color: '#ef4444' },
  { id: 'cat-entretenimiento', nombre: 'Entretenimiento', tipo: 'gasto', icono: '🎬', color: '#ec4899' },
  { id: 'cat-otros', nombre: 'Otros', tipo: 'ambos', icono: '📦', color: '#64748b' },
]

export class GestorGastosDB extends Dexie {
  transacciones!: Table<Transaccion, string>
  categorias!: Table<Categoria, string>

  constructor() {
    super('GestorGastosDB')

    // 'sincronizado' es boolean y IndexedDB no admite booleans como clave de
    // índice, así que se consulta con .filter() en vez de indexarlo aquí.
    this.version(1).stores({
      transacciones: 'id, tipo, categoria, fecha, fechaActualizacion',
      categorias: 'id, nombre, tipo',
    })

    // v2: indexa 'usuarioId' para poder aislar por dispositivo los datos de
    // cada usuario autenticado (ver transaccionService.limpiarDatosLocales).
    this.version(2).stores({
      transacciones: 'id, usuarioId, tipo, categoria, fecha, fechaActualizacion',
      categorias: 'id, nombre, tipo',
    })

    this.on('populate', () => {
      void this.categorias.bulkAdd(CATEGORIAS_INICIALES)
    })
  }
}

export const db = new GestorGastosDB()
