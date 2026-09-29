import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect } from 'react'
import { db } from '../db/database'
import { generarRecurrentesPendientes } from '../services/recurrenteService'
import type { Chanchito, Deuda, Meta, Plantilla, Presupuesto, Recurrente, Regla } from '../types'

export function usePresupuestos(usuarioId: string): Presupuesto[] {
  return useLiveQuery(() => db.presupuestos.where('usuarioId').equals(usuarioId).toArray(), [usuarioId]) ?? []
}

export function useMetas(usuarioId: string): Meta[] {
  return useLiveQuery(() => db.metas.where('usuarioId').equals(usuarioId).toArray(), [usuarioId]) ?? []
}

export function useChanchitos(usuarioId: string): Chanchito[] {
  return useLiveQuery(() => db.chanchitos.where('usuarioId').equals(usuarioId).toArray(), [usuarioId]) ?? []
}

export function useDeudas(usuarioId: string): Deuda[] {
  return useLiveQuery(() => db.deudas.where('usuarioId').equals(usuarioId).toArray(), [usuarioId]) ?? []
}

/**
 * Movimientos recurrentes del usuario. Cada vez que cambian (o al abrir la
 * app) genera las transacciones cuya fecha ya llegó.
 */
export function useRecurrentes(usuarioId: string): Recurrente[] {
  const recurrentes =
    useLiveQuery(() => db.recurrentes.where('usuarioId').equals(usuarioId).toArray(), [usuarioId]) ?? []

  const hayVencidos = recurrentes.some((r) => r.activa && r.proximaFecha <= new Date())
  useEffect(() => {
    if (hayVencidos) void generarRecurrentesPendientes(usuarioId)
  }, [hayVencidos, usuarioId])

  return recurrentes
}

export function useReglas(usuarioId: string): Regla[] {
  return useLiveQuery(() => db.reglas.where('usuarioId').equals(usuarioId).toArray(), [usuarioId]) ?? []
}

/** Plantillas de registro rápido, en el orden elegido. */
export function usePlantillas(usuarioId: string): Plantilla[] {
  return (
    useLiveQuery(
      async () =>
        (await db.plantillas.where('usuarioId').equals(usuarioId).toArray()).sort(
          (a, b) => (a.orden ?? 0) - (b.orden ?? 0) || a.nombre.localeCompare(b.nombre, 'es'),
        ),
      [usuarioId],
    ) ?? []
  )
}
