import { db } from '../db/database'
import type { CompraCuotas, NuevaCompraCuotas, Transaccion } from '../types'
import { fechaCuota } from '../utils/cuotas'
import { marcaCambio, registrarBorrado, uuidDeterminista } from './sincronizable'

function validar(datos: NuevaCompraCuotas): NuevaCompraCuotas {
  const descripcion = datos.descripcion.trim()
  if (!descripcion) throw new Error('Describe la compra (ej. Celular, Refrigeradora).')
  if (!Number.isFinite(datos.montoTotal) || datos.montoTotal <= 0) throw new Error('El precio debe ser mayor a 0.')
  const n = Math.round(datos.numeroCuotas)
  if (!Number.isFinite(n) || n < 2 || n > 72) throw new Error('El número de cuotas debe estar entre 2 y 72.')
  if (!Number.isFinite(datos.montoCuota) || datos.montoCuota <= 0) throw new Error('La cuota debe ser mayor a 0.')
  if (datos.montoCuota * n < datos.montoTotal - 0.05 * n) {
    throw new Error('Las cuotas suman menos que el precio: revisa la cuota o el número de cuotas.')
  }
  if (!datos.cuentaId) throw new Error('Elige la tarjeta o cuenta.')
  if (!datos.categoriaId) throw new Error('Elige una categoría.')
  return {
    ...datos,
    descripcion,
    numeroCuotas: n,
    montoTotal: Math.round(datos.montoTotal * 100) / 100,
    montoCuota: Math.round(datos.montoCuota * 100) / 100,
  }
}

const conceptoTotal = (c: NuevaCompraCuotas) => `${c.descripcion} (en ${c.numeroCuotas} cuotas)`

/**
 * Registra una compra en cuotas. En modo `total` crea además el gasto por
 * el precio completo el día de la compra; en `por_cuota` los gastos se
 * crean al llegar cada cuota (`generarCuotasPendientes`).
 */
export async function crearCompraCuotas(datos: NuevaCompraCuotas, usuarioId: string): Promise<CompraCuotas> {
  const limpio = validar(datos)
  const compra: CompraCuotas = { ...limpio, id: crypto.randomUUID(), usuarioId, ...marcaCambio() }

  await db.transaction('rw', db.cuotas, db.transacciones, async () => {
    if (limpio.modo === 'total') {
      const t: Transaccion = {
        id: crypto.randomUUID(),
        usuarioId,
        tipo: 'gasto',
        monto: limpio.montoTotal,
        cuentaId: limpio.cuentaId,
        categoriaId: limpio.categoriaId,
        fecha: limpio.fechaCompra,
        concepto: conceptoTotal(limpio),
        origen: 'manual',
        ...marcaCambio(),
      }
      await db.transacciones.add(t)
      compra.transaccionId = t.id
    } else {
      compra.cuotasGeneradas = 0
    }
    await db.cuotas.add(compra)
  })
  if (limpio.modo === 'por_cuota') await generarCuotasPendientes(usuarioId)
  return compra
}

/** Edita la compra; en modo `total` también corrige su gasto. El modo no cambia. */
export async function actualizarCompraCuotas(id: string, datos: NuevaCompraCuotas): Promise<void> {
  await db.transaction('rw', db.cuotas, db.transacciones, async () => {
    const actual = await db.cuotas.get(id)
    if (!actual) throw new Error('La compra ya no existe.')
    const limpio = validar({ ...datos, modo: actual.modo })
    await db.cuotas.put({ ...actual, ...limpio, ...marcaCambio() })
    if (actual.modo === 'total' && actual.transaccionId) {
      await db.transacciones.update(actual.transaccionId, {
        monto: limpio.montoTotal,
        cuentaId: limpio.cuentaId,
        categoriaId: limpio.categoriaId,
        fecha: limpio.fechaCompra,
        concepto: conceptoTotal(limpio),
        ...marcaCambio(),
      })
    }
  })
}

/**
 * Elimina la compra. Con `conMovimientos` borra también sus gastos (el
 * total o las cuotas ya registradas); si no, quedan como movimientos normales.
 */
export async function eliminarCompraCuotas(compra: CompraCuotas, conMovimientos: boolean): Promise<void> {
  await db.transaction('rw', db.cuotas, db.transacciones, db.eliminacionesPendientes, async () => {
    await db.cuotas.delete(compra.id)
    await registrarBorrado('cuotas', compra.usuarioId, [compra.id])
    if (!conMovimientos) return
    const ids =
      compra.modo === 'total'
        ? compra.transaccionId
          ? [compra.transaccionId]
          : []
        : (await db.transacciones.where('usuarioId').equals(compra.usuarioId).filter((t) => t.recurrenteId === compra.id).toArray()).map(
            (t) => t.id,
          )
    const existentes = (await db.transacciones.bulkGet(ids)).filter((t): t is Transaccion => t !== undefined)
    await db.transacciones.bulkDelete(existentes.map((t) => t.id))
    await registrarBorrado('transacciones', compra.usuarioId, existentes.map((t) => t.id))
  })
}

/**
 * Compras `por_cuota`: registra como gasto cada cuota cuya fecha ya llegó y
 * aún no se registró. Ids deterministas (compra + n° de cuota): si dos
 * dispositivos las generan, no se duplican. Devuelve cuántas creó.
 */
export async function generarCuotasPendientes(usuarioId: string, hoy = new Date()): Promise<number> {
  const finHoy = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate(), 23, 59, 59)
  const compras = await db.cuotas
    .where('usuarioId')
    .equals(usuarioId)
    .filter((c) => c.modo === 'por_cuota' && (c.cuotasGeneradas ?? 0) < c.numeroCuotas && fechaCuota(c, c.cuotasGeneradas ?? 0) <= finHoy)
    .toArray()

  let creadas = 0
  for (const compra of compras) {
    const nuevas: Transaccion[] = []
    let k = compra.cuotasGeneradas ?? 0
    for (; k < compra.numeroCuotas && fechaCuota(compra, k) <= finHoy; k++) {
      nuevas.push({
        id: await uuidDeterminista(`${compra.id}|cuota|${k}`),
        usuarioId,
        tipo: 'gasto',
        monto: compra.montoCuota,
        cuentaId: compra.cuentaId,
        categoriaId: compra.categoriaId,
        fecha: fechaCuota(compra, k),
        concepto: `${compra.descripcion} — cuota ${k + 1}/${compra.numeroCuotas}`,
        origen: 'recurrente',
        recurrenteId: compra.id,
        ...marcaCambio(),
      })
    }
    await db.transaction('rw', db.cuotas, db.transacciones, async () => {
      const existentes = new Set(
        (await db.transacciones.bulkGet(nuevas.map((t) => t.id))).filter((t) => t !== undefined).map((t) => t!.id),
      )
      const faltantes = nuevas.filter((t) => !existentes.has(t.id))
      await db.transacciones.bulkAdd(faltantes)
      creadas += faltantes.length
      const actual = await db.cuotas.get(compra.id)
      if (actual && (actual.cuotasGeneradas ?? 0) < k) {
        await db.cuotas.update(compra.id, { cuotasGeneradas: k, ...marcaCambio() })
      }
    })
  }
  return creadas
}
