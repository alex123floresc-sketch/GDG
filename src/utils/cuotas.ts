import type { CompraCuotas, Cuenta, Transaccion } from '../types'
import { estadoTarjeta } from './cuentas'

const redondear = (n: number) => Math.round(n * 100) / 100

/** Fecha de la cuota `k` (0 = primera): mismo día en los meses siguientes (recortado a fin de mes). */
export function fechaCuota(compra: CompraCuotas, k: number): Date {
  const base = compra.primeraCuota
  const dia = base.getDate()
  const ultimo = new Date(base.getFullYear(), base.getMonth() + k + 1, 0).getDate()
  return new Date(base.getFullYear(), base.getMonth() + k, Math.min(dia, ultimo), 12)
}

export interface EstadoCuotas {
  pagadas: number
  pendientes: number
  /** Lo pagado en cuotas hasta hoy. */
  pagado: number
  /** Lo que falta pagar (cuotas pendientes × cuota). */
  pendiente: number
  /** Parte del precio (sin intereses) que aún no se cobra: pendientes × total/n. */
  capitalPendiente: number
  proxima?: Date
  /** Intereses totales (cuota × n − precio); 0 si es sin intereses. */
  interes: number
  completada: boolean
  porcentaje: number
}

/** Una cuota se considera pagada cuando llegó su fecha. */
export function estadoCuotas(compra: CompraCuotas, hoy: Date = new Date()): EstadoCuotas {
  const finHoy = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate(), 23, 59, 59)
  let pagadas = 0
  while (pagadas < compra.numeroCuotas && fechaCuota(compra, pagadas) <= finHoy) pagadas++
  const pendientes = compra.numeroCuotas - pagadas
  return {
    pagadas,
    pendientes,
    pagado: redondear(pagadas * compra.montoCuota),
    pendiente: redondear(pendientes * compra.montoCuota),
    capitalPendiente: redondear((pendientes * compra.montoTotal) / compra.numeroCuotas),
    proxima: pendientes > 0 ? fechaCuota(compra, pagadas) : undefined,
    interes: Math.max(0, redondear(compra.montoCuota * compra.numeroCuotas - compra.montoTotal)),
    completada: pendientes === 0,
    porcentaje: compra.numeroCuotas > 0 ? pagadas / compra.numeroCuotas : 1,
  }
}

/**
 * Tasa de interés anual efectiva aproximada (TEA) a partir de la cuota:
 * resuelve la tasa mensual del préstamo francés por bisección.
 */
export function teaAproximada(compra: Pick<CompraCuotas, 'montoTotal' | 'montoCuota' | 'numeroCuotas'>): number | null {
  const { montoTotal: p, montoCuota: c, numeroCuotas: n } = compra
  if (p <= 0 || n <= 0 || c * n <= p + 0.005) return null
  const cuota = (i: number) => (p * i) / (1 - (1 + i) ** -n)
  let bajo = 0.000001
  let alto = 1
  for (let k = 0; k < 80; k++) {
    const medio = (bajo + alto) / 2
    if (cuota(medio) > c) alto = medio
    else bajo = medio
  }
  return (1 + (bajo + alto) / 2) ** 12 - 1
}

/**
 * Parte del precio de las compras en cuotas (modo `total`) de una tarjeta
 * que todavía no se factura a `fecha`: está en la deuda de la tarjeta pero
 * se cobrará en cuotas futuras.
 */
export function capitalNoFacturado(cuotas: CompraCuotas[], cuentaId: string, fecha: Date): number {
  let total = 0
  const limite = new Date(fecha.getFullYear(), fecha.getMonth(), fecha.getDate(), 23, 59, 59)
  for (const c of cuotas) {
    if (c.cuentaId !== cuentaId || c.modo !== 'total') continue
    for (let k = 0; k < c.numeroCuotas; k++) {
      if (fechaCuota(c, k) > limite) total += c.montoTotal / c.numeroCuotas
    }
  }
  return redondear(total)
}

/** Cuánto habría que pagar de una tarjeta en su próxima fecha de pago (descontando cuotas por facturar). */
export function pagoTarjetaEstimado(tarjeta: Cuenta, transacciones: Transaccion[], cuotas: CompraCuotas[], hoy: Date) {
  const e = estadoTarjeta(tarjeta, transacciones, hoy)
  if (!e.proximoPago) return { fecha: undefined, monto: 0 }
  const monto = Math.max(0, e.deuda - capitalNoFacturado(cuotas, tarjeta.id, e.proximoPago))
  return { fecha: e.proximoPago, monto: redondear(monto) }
}
