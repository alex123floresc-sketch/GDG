import type { Table } from 'dexie'
import { useLiveQuery } from 'dexie-react-hooks'
import { useCallback, useEffect, useRef, useState } from 'react'
import { db } from '../db/database'
import { sincronizar } from '../services/syncService'
import type { EstadoSincronizacion } from '../types'

/** Espera tras un cambio local antes de subir (agrupa registros seguidos). */
const RETARDO_SUBIDA_MS = 1500
/** Reintento periódico mientras queden pendientes (p. ej. tras un error). */
const INTERVALO_REINTENTO_MS = 60_000

/**
 * Escucha la conectividad de red y sincroniza Dexie <-> Supabase para el
 * usuario autenticado. Sincroniza:
 * - al iniciar sesión y al recuperar conexión (evento 'online'),
 * - cada vez que aparece una transacción local pendiente (p. ej. recién
 *   registrada), sin esperar a recargar la página,
 * - al volver a la pestaña, y cada minuto mientras queden pendientes.
 * Si `usuarioId` es null (nadie ha iniciado sesión), no hace nada.
 */
export function useSync(usuarioId: string | null): EstadoSincronizacion & {
  pendientes: number
  /** Supabase aún no tiene el esquema v0.7 (ver supabase/migraciones). */
  migracionPendiente: boolean
  sincronizarAhora: () => Promise<void>
} {
  const [enLinea, setEnLinea] = useState(navigator.onLine)
  const [sincronizando, setSincronizando] = useState(false)
  const [ultimaSincronizacion, setUltimaSincronizacion] =
    useState<Date | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [migracionPendiente, setMigracionPendiente] = useState(false)

  const sincronizandoRef = useRef(false)

  // Cambios locales por subir en todas las tablas (+ borrados pendientes).
  // 'sincronizado' no está indexado (boolean), se filtra en memoria.
  const pendientes =
    useLiveQuery(async () => {
      if (!usuarioId) return 0
      const tablas = [
        db.transacciones,
        db.categorias,
        db.cuentas,
        db.presupuestos,
        db.metas,
        db.deudas,
        db.recurrentes,
      ] as unknown as Table<{ usuarioId: string; sincronizado?: boolean }, string>[]
      const conteos = await Promise.all([
        ...tablas.map((t) =>
          t
            .where('usuarioId')
            .equals(usuarioId)
            .filter((fila) => fila.sincronizado !== true)
            .count(),
        ),
        db.eliminacionesPendientes.where('usuarioId').equals(usuarioId).count(),
      ])
      return conteos.reduce((a, b) => a + b, 0)
    }, [usuarioId]) ?? 0

  const sincronizarAhora = useCallback(async () => {
    if (!usuarioId || sincronizandoRef.current || !navigator.onLine) return

    sincronizandoRef.current = true
    setSincronizando(true)

    try {
      const resultado = await sincronizar(usuarioId)
      setMigracionPendiente(resultado.migracionPendiente)
      setUltimaSincronizacion(new Date())
      setError(null)
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Error desconocido al sincronizar',
      )
    } finally {
      sincronizandoRef.current = false
      setSincronizando(false)
    }
  }, [usuarioId])

  useEffect(() => {
    const manejarOnline = () => {
      setEnLinea(true)
      void sincronizarAhora()
    }

    const manejarOffline = () => {
      setEnLinea(false)
    }

    const manejarVisibilidad = () => {
      if (document.visibilityState === 'visible') void sincronizarAhora()
    }

    window.addEventListener('online', manejarOnline)
    window.addEventListener('offline', manejarOffline)
    document.addEventListener('visibilitychange', manejarVisibilidad)

    if (navigator.onLine) {
      void sincronizarAhora()
    }

    return () => {
      window.removeEventListener('online', manejarOnline)
      window.removeEventListener('offline', manejarOffline)
      document.removeEventListener('visibilitychange', manejarVisibilidad)
    }
  }, [sincronizarAhora])

  // Sube en cuanto hay algo pendiente (registro manual, reasignación de
  // categoría, etc.) y reintenta periódicamente si la subida falló.
  useEffect(() => {
    if (pendientes === 0 || !enLinea) return

    const temporizador = window.setTimeout(() => {
      void sincronizarAhora()
    }, RETARDO_SUBIDA_MS)
    const intervalo = window.setInterval(() => {
      void sincronizarAhora()
    }, INTERVALO_REINTENTO_MS)

    return () => {
      window.clearTimeout(temporizador)
      window.clearInterval(intervalo)
    }
  }, [pendientes, enLinea, sincronizarAhora])

  return {
    enLinea,
    sincronizando,
    ultimaSincronizacion,
    error,
    pendientes,
    migracionPendiente,
    sincronizarAhora,
  }
}
