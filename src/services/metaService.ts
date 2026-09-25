import { db } from '../db/database'
import type { Meta, NuevaMeta } from '../types'
import { marcaCambio, registrarBorrado } from './sincronizable'

function validar(datos: NuevaMeta): NuevaMeta {
  const nombre = datos.nombre.trim()
  if (!nombre) throw new Error('Ponle un nombre a la meta.')
  if (!Number.isFinite(datos.montoObjetivo) || datos.montoObjetivo <= 0) {
    throw new Error('El monto objetivo debe ser mayor a 0.')
  }
  return { ...datos, nombre, montoObjetivo: Math.round(datos.montoObjetivo * 100) / 100 }
}

export async function crearMeta(datos: NuevaMeta, usuarioId: string): Promise<Meta> {
  const meta: Meta = {
    ...validar(datos),
    id: crypto.randomUUID(),
    usuarioId,
    aportes: [],
    ...marcaCambio(),
  }
  await db.metas.add(meta)
  return meta
}

export async function actualizarMeta(id: string, datos: NuevaMeta): Promise<void> {
  const actual = await db.metas.get(id)
  if (!actual) throw new Error('La meta ya no existe.')
  await db.metas.put({ ...actual, ...validar(datos), ...marcaCambio() })
}

/** Registra un aporte (monto > 0) o un retiro (monto < 0). */
export async function aportarAMeta(id: string, monto: number, nota?: string): Promise<void> {
  if (!Number.isFinite(monto) || monto === 0) throw new Error('Ingresa un monto válido.')

  const meta = await db.metas.get(id)
  if (!meta) throw new Error('La meta ya no existe.')

  const ahorrado = meta.aportes.reduce((s, a) => s + a.monto, 0)
  if (ahorrado + monto < 0) throw new Error('No puedes retirar más de lo ahorrado.')

  await db.metas.put({
    ...meta,
    aportes: [
      ...meta.aportes,
      { id: crypto.randomUUID(), fecha: new Date(), monto: Math.round(monto * 100) / 100, nota: nota?.trim() || undefined },
    ],
    ...marcaCambio(),
  })
}

export async function eliminarMeta(meta: Meta): Promise<void> {
  await db.transaction('rw', db.metas, db.eliminacionesPendientes, async () => {
    await db.metas.delete(meta.id)
    await registrarBorrado('metas', meta.usuarioId, [meta.id])
  })
}
