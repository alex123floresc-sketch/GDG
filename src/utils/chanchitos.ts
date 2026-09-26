import type { Aporte, Chanchito, Cuenta, Transaccion } from '../types'
import { saldoCuenta } from './cuentas'

/** Lo que hay en el chanchito ahora. */
export function saldoChanchito(chanchito: Chanchito, cuentas: Cuenta[], transacciones: Transaccion[]): number {
  if (chanchito.tipo === 'fisico') {
    return Math.round(chanchito.movimientos.reduce((s, m) => s + m.monto, 0) * 100) / 100
  }
  const cuenta = cuentas.find((c) => c.id === chanchito.cuentaId)
  return cuenta ? Math.round(saldoCuenta(cuenta, transacciones) * 100) / 100 : 0
}

/**
 * Historial del chanchito, del más reciente al más antiguo, en un solo
 * formato: en los físicos son sus movimientos; en los apartados, las
 * transferencias de su cuenta (+ entra al chanchito, − sale).
 */
export function historialChanchito(chanchito: Chanchito, transacciones: Transaccion[]): Aporte[] {
  const lista: Aporte[] =
    chanchito.tipo === 'fisico'
      ? chanchito.movimientos
      : transacciones
          .filter((t) => t.cuentaId === chanchito.cuentaId)
          .map((t) => ({
            id: t.id,
            fecha: t.fecha,
            monto: t.tipo === 'ingreso' ? t.monto : -t.monto,
            nota: t.concepto,
          }))
  return [...lista].sort((a, b) => b.fecha.getTime() - a.fecha.getTime())
}
