import type { Cuenta, TipoCuenta, Transaccion } from '../types'

export const TIPOS_CUENTA: { id: TipoCuenta; etiqueta: string; icono: string }[] = [
  { id: 'efectivo', etiqueta: 'Efectivo', icono: 'money bill alternate outline' },
  { id: 'banco', etiqueta: 'Banco', icono: 'university' },
  { id: 'billetera_digital', etiqueta: 'Billetera digital', icono: 'mobile alternate' },
  { id: 'tarjeta_credito', etiqueta: 'Tarjeta de crédito', icono: 'credit card' },
  { id: 'otro', etiqueta: 'Otra', icono: 'wallet' },
]

export const ICONO_CUENTA: Record<TipoCuenta, string> = Object.fromEntries(
  TIPOS_CUENTA.map((t) => [t.id, t.icono]),
) as Record<TipoCuenta, string>

export const ETIQUETA_CUENTA: Record<TipoCuenta, string> = Object.fromEntries(
  TIPOS_CUENTA.map((t) => [t.id, t.etiqueta]),
) as Record<TipoCuenta, string>

/**
 * Saldo actual de una cuenta: saldo inicial + ingresos − gastos (incluye
 * transferencias). En una tarjeta de crédito un saldo negativo es deuda.
 */
export function saldoCuenta(cuenta: Cuenta, transacciones: Transaccion[]): number {
  return transacciones.reduce(
    (saldo, t) =>
      t.cuentaId !== cuenta.id ? saldo : saldo + (t.tipo === 'ingreso' ? t.monto : -t.monto),
    cuenta.saldoInicial,
  )
}

/** Saldo de todas las cuentas en una sola pasada. */
export function saldosPorCuenta(
  cuentas: Cuenta[],
  transacciones: Transaccion[],
): Map<string, number> {
  const saldos = new Map(cuentas.map((c) => [c.id, c.saldoInicial]))
  for (const t of transacciones) {
    const actual = saldos.get(t.cuentaId)
    if (actual === undefined) continue
    saldos.set(t.cuentaId, actual + (t.tipo === 'ingreso' ? t.monto : -t.monto))
  }
  return saldos
}

/** Fecha con el día `dia` del mes de `base` (se ajusta a meses más cortos). */
function diaDelMes(base: Date, dia: number, desplazamientoMeses = 0): Date {
  const anio = base.getFullYear()
  const mes = base.getMonth() + desplazamientoMeses
  const ultimoDia = new Date(anio, mes + 1, 0).getDate()
  return new Date(anio, mes, Math.min(dia, ultimoDia))
}

export interface EstadoTarjeta {
  /** Lo que se debe hoy (≥ 0). */
  deuda: number
  /** Línea disponible (si hay límite). */
  disponible?: number
  /** 0–1 de la línea usada. */
  uso?: number
  /** Gastos desde el último corte. */
  consumoCiclo: number
  ultimoCorte?: Date
  proximoPago?: Date
  diasParaPago?: number
}

/**
 * Estado de una tarjeta de crédito a la fecha `hoy`: deuda (saldo
 * negativo), línea disponible, consumo del ciclo actual y cuándo vence el
 * próximo pago.
 */
export function estadoTarjeta(
  cuenta: Cuenta,
  transacciones: Transaccion[],
  hoy: Date = new Date(),
): EstadoTarjeta {
  const saldo = saldoCuenta(cuenta, transacciones)
  const deuda = Math.max(0, -saldo)
  const inicioHoy = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate())

  let ultimoCorte: Date | undefined
  if (cuenta.diaCorte) {
    const corteEsteMes = diaDelMes(inicioHoy, cuenta.diaCorte)
    ultimoCorte = corteEsteMes < inicioHoy ? corteEsteMes : diaDelMes(inicioHoy, cuenta.diaCorte, -1)
  }

  let proximoPago: Date | undefined
  if (cuenta.diaPago) {
    const pagoEsteMes = diaDelMes(inicioHoy, cuenta.diaPago)
    proximoPago = pagoEsteMes >= inicioHoy ? pagoEsteMes : diaDelMes(inicioHoy, cuenta.diaPago, 1)
  }

  const desde = ultimoCorte ? new Date(ultimoCorte.getTime() + 86_400_000) : undefined
  const consumoCiclo = transacciones
    .filter(
      (t) =>
        t.cuentaId === cuenta.id &&
        t.tipo === 'gasto' &&
        t.origen !== 'transferencia' &&
        (!desde || t.fecha >= desde),
    )
    .reduce((suma, t) => suma + t.monto, 0)

  return {
    deuda,
    disponible: cuenta.limiteCredito ? Math.max(0, cuenta.limiteCredito - deuda) : undefined,
    uso: cuenta.limiteCredito ? Math.min(1, deuda / cuenta.limiteCredito) : undefined,
    consumoCiclo,
    ultimoCorte,
    proximoPago,
    diasParaPago: proximoPago
      ? Math.round((proximoPago.getTime() - inicioHoy.getTime()) / 86_400_000)
      : undefined,
  }
}
