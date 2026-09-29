import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useMemo } from 'react'
import { db } from '../db/database'
import { generarCuotasPendientes } from '../services/cuotaService'
import { generarRecurrentesPendientes } from '../services/recurrenteService'
import type { Ajustes, Chanchito, CompraCuotas, Deseo, Deuda, Meta, Plantilla, Presupuesto, Recurrente, Regla } from '../types'
import { ajustesVacios } from '../services/ajustesService'
import { fechaCuota } from '../utils/cuotas'

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

/**
 * Compras en cuotas. Como los recurrentes, al abrir la app registra las
 * cuotas vencidas de las compras en modo "por cuota".
 */
export function useCuotas(usuarioId: string): CompraCuotas[] {
  const cuotas = useLiveQuery(() => db.cuotas.where('usuarioId').equals(usuarioId).toArray(), [usuarioId]) ?? []
  const hoy = new Date()
  const hayVencidas = cuotas.some(
    (c) => c.modo === 'por_cuota' && (c.cuotasGeneradas ?? 0) < c.numeroCuotas && fechaCuota(c, c.cuotasGeneradas ?? 0) <= hoy,
  )
  useEffect(() => {
    if (hayVencidas) void generarCuotasPendientes(usuarioId)
  }, [hayVencidas, usuarioId])
  return cuotas
}

export function useDeseos(usuarioId: string): Deseo[] {
  return useLiveQuery(() => db.deseos.where('usuarioId').equals(usuarioId).toArray(), [usuarioId]) ?? []
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

/** Ajustes sincronizados del usuario (con valores vacíos si aún no hay). */
export function useAjustes(usuarioId: string): Ajustes {
  const fila = useLiveQuery(() => db.ajustes.get(usuarioId), [usuarioId])
  return useMemo(() => fila ?? ajustesVacios(usuarioId), [fila, usuarioId])
}
