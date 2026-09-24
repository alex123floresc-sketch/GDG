import Dexie, { type Table } from 'dexie'
import type { Categoria, Cuenta, Presupuesto, Transaccion } from '../types'

/** Emojis de las categorías por defecto hasta v3 → icono de Semantic UI. */
const ICONOS_EMOJI_V3: Record<string, string> = {
  '💼': 'briefcase',
  '🧾': 'file invoice dollar',
  '📈': 'chart line',
  '🍽️': 'utensils',
  '🚌': 'bus',
  '🏠': 'home',
  '💊': 'medkit',
  '🎬': 'film',
  '📦': 'box',
}

export class GestorGastosDB extends Dexie {
  transacciones!: Table<Transaccion, string>
  categorias!: Table<Categoria, string>
  cuentas!: Table<Cuenta, string>
  presupuestos!: Table<Presupuesto, string>

  constructor() {
    super('GestorGastosDB')

    // 'sincronizado' es boolean y IndexedDB no admite booleans como clave de
    // índice, así que se consulta con .filter() en vez de indexarlo aquí.
    this.version(1).stores({
      transacciones: 'id, tipo, categoria, fecha, fechaActualizacion',
      categorias: 'id, nombre, tipo',
    })

    this.version(2).stores({
      transacciones: 'id, usuarioId, tipo, categoria, fecha, fechaActualizacion',
      categorias: 'id, nombre, tipo',
    })

    // v3: arquitectura multiusuario completa.
    // - 'categorias' y nueva tabla 'cuentas' pasan a ser por usuario (antes
    //   categorias era una taxonomía global sembrada una sola vez).
    // - 'transacciones' gana cuentaId, categoriaId (reemplaza a 'categoria'),
    //   concepto (reemplaza a 'nota'), nroOperacion y origen, para soportar
    //   la importación de reportes de Yape. Índice compuesto
    //   [usuarioId+nroOperacion] para la validación anti-duplicados.
    // - nueva tabla 'presupuestos'.
    this.version(3).stores({
      transacciones:
        'id, usuarioId, cuentaId, categoriaId, tipo, fecha, fechaActualizacion, [usuarioId+nroOperacion]',
      categorias: 'id, usuarioId, nombre, tipo',
      cuentas: 'id, usuarioId, nombre, tipo',
      presupuestos: 'id, usuarioId, categoriaId, mes, anio',
    })

    // v4: `Categoria.icono` pasa de emoji a nombre de icono de Semantic UI.
    // Mismo esquema; solo migra las categorías ya sembradas con emoji.
    this.version(4)
      .stores({})
      .upgrade((tx) =>
        tx
          .table<Categoria, string>('categorias')
          .toCollection()
          .modify((categoria) => {
            if (categoria.icono && categoria.icono in ICONOS_EMOJI_V3) {
              categoria.icono = ICONOS_EMOJI_V3[categoria.icono]
            }
          }),
      )
  }
}

export const db = new GestorGastosDB()
