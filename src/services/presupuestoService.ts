import { db } from '../db/database'
import type { Presupuesto } from '../types'
import { marcaCambio, registrarBorrado } from './sincronizable'

/*
 * Un presupuesto por categoría: es un límite mensual que rige para todos
 * los meses. `mes`/`anio` guardan desde cuándo se fijó el monto actual.
 */

/** Crea o actualiza el presupuesto mensual de una categoría. */
export async function guardarPresupuesto(
  usuarioId: string,
  categoriaId: string,
  montoLimite: number,
): Promise<void> {
  if (!Number.isFinite(montoLimite) || montoLimite <= 0) {
    throw new Error('Ingresa un límite mayor a 0.')
  }

  const hoy = new Date()
  const existente = await db.presupuestos
    .where('categoriaId')
    .equals(categoriaId)
    .filter((p) => p.usuarioId === usuarioId)
    .first()

  const presupuesto: Presupuesto = {
    id: existente?.id ?? crypto.randomUUID(),
    usuarioId,
    categoriaId,
    montoLimite: Math.round(montoLimite * 100) / 100,
    mes: hoy.getMonth() + 1,
    anio: hoy.getFullYear(),
    ...marcaCambio(),
  }
  await db.presupuestos.put(presupuesto)
}

export async function eliminarPresupuesto(presupuesto: Presupuesto): Promise<void> {
  await db.transaction('rw', db.presupuestos, db.eliminacionesPendientes, async () => {
    await db.presupuestos.delete(presupuesto.id)
    await registrarBorrado('presupuestos', presupuesto.usuarioId, [presupuesto.id])
  })
}
