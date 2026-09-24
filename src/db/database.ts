import Dexie, { type Table } from 'dexie'
import type { Categoria, Cuenta, Presupuesto, Transaccion } from '../types'

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
  }
}

export const db = new GestorGastosDB()
