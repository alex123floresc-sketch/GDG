import { useCallback, useEffect, useRef, useState } from 'react'
import { sincronizar } from '../services/syncService'
import type { EstadoSincronizacion } from '../types'

/**
 * Escucha la conectividad de red y sincroniza Dexie <-> Supabase:
 * al recuperar conexión, sube las transacciones pendientes y descarga
 * las transacciones remotas recientes.
 */
export function useSync(): EstadoSincronizacion & {
  sincronizarAhora: () => Promise<void>
} {
  const [enLinea, setEnLinea] = useState(navigator.onLine)
  const [sincronizando, setSincronizando] = useState(false)
  const [ultimaSincronizacion, setUltimaSincronizacion] =
    useState<Date | null>(null)
  const [error, setError] = useState<string | null>(null)

  const sincronizandoRef = useRef(false)

  const sincronizarAhora = useCallback(async () => {
    if (sincronizandoRef.current || !navigator.onLine) return

    sincronizandoRef.current = true
    setSincronizando(true)
    setError(null)

    try {
      await sincronizar()
      setUltimaSincronizacion(new Date())
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Error desconocido al sincronizar',
      )
    } finally {
      sincronizandoRef.current = false
      setSincronizando(false)
    }
  }, [])

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
