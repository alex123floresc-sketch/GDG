import { useCallback, useEffect, useRef, useState } from 'react'
import { sincronizar } from '../services/syncService'
import type { EstadoSincronizacion } from '../types'

/**
 * Escucha la conectividad de red y sincroniza Dexie <-> Supabase para el
 * usuario autenticado: al recuperar conexión (o al iniciar sesión), sube
 * las transacciones pendientes y descarga las recientes de ese usuario.
 * Si `usuarioId` es null (nadie ha iniciado sesión), no hace nada.
 */
export function useSync(usuarioId: string | null): EstadoSincronizacion & {
  sincronizarAhora: () => Promise<void>
} {
  const [enLinea, setEnLinea] = useState(navigator.onLine)
  const [sincronizando, setSincronizando] = useState(false)
  const [ultimaSincronizacion, setUltimaSincronizacion] =
    useState<Date | null>(null)
  const [error, setError] = useState<string | null>(null)

  const sincronizandoRef = useRef(false)

  const sincronizarAhora = useCallback(async () => {
    if (!usuarioId || sincronizandoRef.current || !navigator.onLine) return

    sincronizandoRef.current = true
    setSincronizando(true)
    setError(null)

    try {
      await sincronizar(usuarioId)
      setUltimaSincronizacion(new Date())
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

    window.addEventListener('online', manejarOnline)
    window.addEventListener('offline', manejarOffline)

    if (navigator.onLine) {
      void sincronizarAhora()
    }

    return () => {
      window.removeEventListener('online', manejarOnline)
      window.removeEventListener('offline', manejarOffline)
    }
  }, [sincronizarAhora])

  return {
    enLinea,
    sincronizando,
    ultimaSincronizacion,
    error,
    sincronizarAhora,
  }
}
