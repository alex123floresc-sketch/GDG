import { db } from '../db/database'
import type { NuevaTransaccion, Transaccion } from '../types'

export async function crearTransaccion(
  datos: NuevaTransaccion,
  usuarioId: string,
): Promise<Transaccion> {
  const transaccion: Transaccion = {
    id: crypto.randomUUID(),
    usuarioId,
    ...datos,
    sincronizado: false,
    fechaActualizacion: new Date(),
  }

  await db.transacciones.add(transaccion)

  return transaccion
}

/**
 * Modifica una transacción y la marca para volver a subirla. Los campos
 * opcionales que se envían como `undefined` se eliminan (p. ej. quitar el
 * concepto o volver a soles).
 */
export async function actualizarTransaccion(
  id: string,
  datos: Partial<NuevaTransaccion>,
): Promise<void> {
  const actual = await db.transacciones.get(id)
  if (!actual) throw new Error('La transacción ya no existe.')

  await db.transacciones.put({
    ...actual,
    ...datos,
    sincronizado: false,
    fechaActualizacion: new Date(),
  })
}

/**
 * Elimina una transacción (y la otra pata si es una transferencia) y deja
 * registrado el borrado para replicarlo en Supabase. Devuelve lo borrado,
 * para poder deshacerlo con `restaurarTransacciones`.
 */
export async function eliminarTransaccion(id: string): Promise<Transaccion[]> {
  return db.transaction('rw', db.transacciones, db.eliminacionesPendientes, async () => {
    const transaccion = await db.transacciones.get(id)
    if (!transaccion) return []

    const afectadas = transaccion.transferenciaId
      ? await db.transacciones.where('transferenciaId').equals(transaccion.transferenciaId).toArray()
      : [transaccion]

    await db.transacciones.bulkDelete(afectadas.map((t) => t.id))
    await db.eliminacionesPendientes.bulkAdd(
      afectadas.map((t) => ({
        usuarioId: t.usuarioId,
        tabla: 'transacciones' as const,
        registroId: t.id,
      })),
    )
    return afectadas
  })
}

/** Deshace un `eliminarTransaccion`: las vuelve a crear y cancela el borrado remoto. */
export async function restaurarTransacciones(transacciones: Transaccion[]): Promise<void> {
  if (transacciones.length === 0) return
  const ids = new Set(transacciones.map((t) => t.id))

  await db.transaction('rw', db.transacciones, db.eliminacionesPendientes, async () => {
    await db.eliminacionesPendientes
      .where('usuarioId')
      .equals(transacciones[0].usuarioId)
      .filter((e) => e.tabla === 'transacciones' && ids.has(e.registroId))
      .delete()
    await db.transacciones.bulkPut(
      transacciones.map((t) => ({ ...t, sincronizado: false, fechaActualizacion: new Date() })),
    )
  })
}

export interface DatosTransferencia {
  cuentaOrigenId: string
  cuentaDestinoId: string
  monto: number
  fecha: Date
  concepto?: string
}

/**
 * Registra un movimiento entre dos cuentas propias como dos transacciones
 * unidas por `transferenciaId`: un gasto en la cuenta de origen y un
 * ingreso en la de destino, ambos con origen `transferencia` (se excluyen
 * de los resúmenes de ingresos/gastos, pero sí mueven los saldos).
 */
export async function crearTransferencia(
  datos: DatosTransferencia,
  usuarioId: string,
): Promise<void> {
  if (datos.cuentaOrigenId === datos.cuentaDestinoId) {
    throw new Error('Elige dos cuentas distintas.')
  }

  const transferenciaId = crypto.randomUUID()
  const ahora = new Date()
  const base = {
    usuarioId,
    categoriaId: '',
    monto: datos.monto,
    fecha: datos.fecha,
    concepto: datos.concepto,
    origen: 'transferencia' as const,
    transferenciaId,
    sincronizado: false,
    fechaActualizacion: ahora,
  }

  await db.transacciones.bulkAdd([
    { ...base, id: crypto.randomUUID(), tipo: 'gasto', cuentaId: datos.cuentaOrigenId },
    { ...base, id: crypto.randomUUID(), tipo: 'ingreso', cuentaId: datos.cuentaDestinoId },
  ])
}

/** Modifica las dos patas de una transferencia a la vez. */
export async function actualizarTransferencia(
  transferenciaId: string,
  datos: DatosTransferencia,
): Promise<void> {
  if (datos.cuentaOrigenId === datos.cuentaDestinoId) {
    throw new Error('Elige dos cuentas distintas.')
  }

  const ahora = new Date()
  await db.transacciones
    .where('transferenciaId')
    .equals(transferenciaId)
    .modify((t) => {
      t.monto = datos.monto
      t.fecha = datos.fecha
      t.concepto = datos.concepto
      t.cuentaId = t.tipo === 'gasto' ? datos.cuentaOrigenId : datos.cuentaDestinoId
      t.sincronizado = false
      t.fechaActualizacion = ahora
    })
}

/**
 * Borra por completo la base de datos local. Se usa al cerrar sesión para
 * que, en un dispositivo compartido, el siguiente usuario que inicie
 * sesión no vea datos financieros de la sesión anterior.
 */
export async function limpiarDatosLocales(): Promise<void> {
  const tablas = [
    db.transacciones,
    db.categorias,
    db.cuentas,
    db.presupuestos,
    db.eliminacionesPendientes,
    db.metas,
    db.deudas,
    db.recurrentes,
    db.chanchitos,
  ]
  await db.transaction('rw', tablas, async () => {
    await Promise.all(tablas.map((t) => t.clear()))
  })
}
