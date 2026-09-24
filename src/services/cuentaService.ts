import { db } from '../db/database'
import type { NuevaCuenta } from '../types'

const CUENTAS_BASE: NuevaCuenta[] = [
  { nombre: 'Efectivo', tipo: 'efectivo', saldoInicial: 0 },
  { nombre: 'Yape', tipo: 'billetera_digital', saldoInicial: 0 },
  { nombre: 'Banco', tipo: 'banco', saldoInicial: 0 },
]

/**
 * Crea las cuentas por defecto para un usuario si todavía no tiene ninguna
 * (p. ej. su primer inicio de sesión en este dispositivo).
 */
export async function asegurarCuentasPorDefecto(usuarioId: string): Promise<void> {
  const existentes = await db.cuentas.where('usuarioId').equals(usuarioId).count()

  if (existentes > 0) return

  await db.cuentas.bulkAdd(
    CUENTAS_BASE.map((cuenta) => ({
      ...cuenta,
      id: crypto.randomUUID(),
      usuarioId,
    })),
  )
}
