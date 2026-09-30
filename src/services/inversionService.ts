import { db } from '../db/database'
import type { Inversion, NuevaInversion, OperacionInversion } from '../types'
import { cantidadAlDia } from '../utils/inversiones'
import { marcaCambio, registrarBorrado } from './sincronizable'

/*
 * Inversiones en bolsa. Como las metas: no tocan las cuentas (comprar
 * acciones no es un "gasto"); solo llevan el registro del portafolio.
 */

function validar(datos: NuevaInversion): NuevaInversion {
  const nombre = datos.nombre.trim()
  if (!nombre) throw new Error('Ponle un nombre (p. ej. "Apple" o "S&P 500").')
  return {
    ...datos,
    nombre,
    simbolo: datos.simbolo?.trim().toUpperCase() || undefined,
    broker: datos.broker?.trim() || undefined,
  }
}

export async function crearInversion(
  datos: NuevaInversion,
  usuarioId: string,
  primeraCompra?: Omit<OperacionInversion, 'id' | 'tipo'>,
): Promise<Inversion> {
  const inversion: Inversion = {
    id: crypto.randomUUID(),
    usuarioId,
    ...validar(datos),
    operaciones: [],
    ...marcaCambio(),
  }
  if (primeraCompra) inversion.operaciones.push(validarOperacion(inversion, { ...primeraCompra, tipo: 'compra' }))
  await db.inversiones.add(inversion)
  return inversion
}

export async function actualizarInversion(id: string, datos: NuevaInversion): Promise<void> {
  await db.inversiones.update(id, { ...validar(datos), ...marcaCambio() })
}

function validarOperacion(inv: Inversion, op: Omit<OperacionInversion, 'id'> & { id?: string }): OperacionInversion {
  if (!Number.isFinite(op.precio) || op.precio <= 0) {
    throw new Error(op.tipo === 'dividendo' ? 'Ingresa el monto cobrado.' : 'Ingresa un precio mayor a 0.')
  }
  if (op.tipo !== 'dividendo' && (!Number.isFinite(op.cantidad) || op.cantidad <= 0)) {
    throw new Error('Ingresa una cantidad mayor a 0.')
  }
  if (op.comision !== undefined && (!Number.isFinite(op.comision) || op.comision < 0)) {
    throw new Error('La comisión no puede ser negativa.')
  }
  if (op.tipo === 'venta') {
    const disponible = cantidadAlDia(inv, op.fecha, op.id)
    if (op.cantidad > disponible + 1e-9) {
      throw new Error(`A esa fecha solo tenías ${disponible} para vender.`)
    }
  }
  return {
    id: op.id ?? crypto.randomUUID(),
    fecha: op.fecha,
    tipo: op.tipo,
    cantidad: op.tipo === 'dividendo' ? 0 : op.cantidad,
    precio: op.precio,
    comision: op.comision || undefined,
    nota: op.nota?.trim() || undefined,
  }
}

/** Agrega o reemplaza (mismo id) una compra, venta o dividendo. */
export async function guardarOperacion(
  inversionId: string,
  op: Omit<OperacionInversion, 'id'> & { id?: string },
): Promise<void> {
  const inv = await db.inversiones.get(inversionId)
  if (!inv) throw new Error('La inversión ya no existe.')
  const nueva = validarOperacion(inv, op)
  const operaciones = inv.operaciones.some((o) => o.id === nueva.id)
    ? inv.operaciones.map((o) => (o.id === nueva.id ? nueva : o))
    : [...inv.operaciones, nueva]
  // Cambiar una compra no debe dejar ventas "en el aire".
  const prueba = { ...inv, operaciones }
  for (const v of operaciones.filter((o) => o.tipo === 'venta')) {
    if (v.cantidad > cantidadAlDia(prueba, v.fecha, v.id) + 1e-9) {
      throw new Error('Con ese cambio venderías más de lo que tenías en alguna venta posterior.')
    }
  }
  // Una venta o compra nueva también actualiza el precio si no hay uno más reciente.
  const precio =
    nueva.tipo !== 'dividendo' && (!inv.fechaPrecio || nueva.fecha >= inv.fechaPrecio)
      ? { precioActual: nueva.precio, fechaPrecio: nueva.fecha }
      : {}
  await db.inversiones.update(inversionId, { operaciones, ...precio, ...marcaCambio() })
}

export async function eliminarOperacion(inversionId: string, operacionId: string): Promise<void> {
  const inv = await db.inversiones.get(inversionId)
  if (!inv) return
  const operaciones = inv.operaciones.filter((o) => o.id !== operacionId)
  const prueba = { ...inv, operaciones }
  for (const v of operaciones.filter((o) => o.tipo === 'venta')) {
    if (v.cantidad > cantidadAlDia(prueba, v.fecha, v.id) + 1e-9) {
      throw new Error('No se puede borrar: hay ventas posteriores que usan esa compra. Borra primero la venta.')
    }
  }
  await db.inversiones.update(inversionId, { operaciones, ...marcaCambio() })
}

/** Anota el precio de hoy (lo ves en tu app del broker). */
export async function actualizarPrecio(inversionId: string, precio: number): Promise<void> {
  if (!Number.isFinite(precio) || precio <= 0) throw new Error('Ingresa un precio mayor a 0.')
  await db.inversiones.update(inversionId, { precioActual: precio, fechaPrecio: new Date(), ...marcaCambio() })
}

export async function archivarInversion(inv: Inversion, archivada: boolean): Promise<void> {
  await db.inversiones.update(inv.id, { archivada: archivada || undefined, ...marcaCambio() })
}

export async function eliminarInversion(inv: Inversion): Promise<void> {
  await db.transaction('rw', db.inversiones, db.eliminacionesPendientes, async () => {
    await db.inversiones.delete(inv.id)
    await registrarBorrado('inversiones', inv.usuarioId, [inv.id])
  })
}
