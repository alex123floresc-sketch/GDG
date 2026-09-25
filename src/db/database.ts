import Dexie, { type Table } from 'dexie'
import type {
  Categoria,
  Cuenta,
  EliminacionPendiente,
  Presupuesto,
  Transaccion,
} from '../types'

/** Emojis de las categorías por defecto hasta v3 → icono de Semantic UI. */
const ICONOS_EMOJI_V3: Record<string, string> = {
  '💼': 'briefcase',
  '🧾': 'file invoice dollar',
  '📈': 'chartline',
  '🍽️': 'utensils',
  '🚌': 'bus',
  '🏠': 'home',
  '💊': 'medkit',
  '🎬': 'film',
  '📦': 'box',
}

/**
 * Colores de las categorías por defecto hasta v4 → paleta categórica nueva
 * (validada para daltonismo, ver `categoriaService.COLORES_CATEGORIA`).
 */
const COLORES_V4: Record<string, string> = {
  '#22c55e': '#008300', // Salario
  '#14b8a6': '#4a3aa7', // Freelance
  '#0ea5e9': '#2a78d6', // Inversiones
  '#f97316': '#2a78d6', // Alimentación
  '#eab308': '#eb6834', // Transporte
  '#a855f7': '#1baf7a', // Vivienda
  '#ef4444': '#eda100', // Salud
  '#ec4899': '#e87ba4', // Entretenimiento
  '#64748b': '#898781', // Otros
}

export class GestorGastosDB extends Dexie {
  transacciones!: Table<Transaccion, string>
  categorias!: Table<Categoria, string>
  cuentas!: Table<Cuenta, string>
  presupuestos!: Table<Presupuesto, string>
  eliminacionesPendientes!: Table<EliminacionPendiente, number>

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

    // v5: nueva paleta de colores. Mismo esquema; solo recolorea las
    // categorías que conservan el color por defecto anterior (las que el
    // usuario ya personalizó no se tocan). También corrige el icono
    // 'chart line', que no existe en Fomantic (se llama 'chartline').
    this.version(5)
      .stores({})
      .upgrade((tx) =>
        tx
          .table<Categoria, string>('categorias')
          .toCollection()
          .modify((categoria) => {
            if (categoria.color && categoria.color in COLORES_V4) {
              categoria.color = COLORES_V4[categoria.color]
            }
            if (categoria.icono === 'chart line') categoria.icono = 'chartline'
          }),
      )

    // v6: categorías y cuentas se sincronizan con Supabase (tablas remotas
    // `categorias`/`cuentas`). Nueva tabla con los borrados locales que
    // faltan replicar en el servidor.
    this.version(6).stores({
      eliminacionesPendientes: '++id, usuarioId',
    })
  }
}

export const db = new GestorGastosDB()
