import type { Session } from '@supabase/supabase-js'
import { useEffect, useState } from 'react'
import Auth from './components/Auth'
import Dashboard from './components/Dashboard'
import Header from './components/Header'
import { useSync } from './hooks/useSync'
import { asegurarCategoriasPorDefecto } from './services/categoriaService'
import { asegurarCuentasPorDefecto } from './services/cuentaService'
import { supabase } from './services/supabaseClient'
import { limpiarDatosLocales } from './services/transaccionService'

function App() {
  const [sesion, setSesion] = useState<Session | null>(null)
  const [cargandoSesion, setCargandoSesion] = useState(true)

  useEffect(() => {
    if (!supabase) {
      setCargandoSesion(false)
      return
    }

    supabase.auth.getSession().then(({ data }) => {
      setSesion(data.session)
      setCargandoSesion(false)
    })

    const { data: suscripcion } = supabase.auth.onAuthStateChange(
      (_evento, nuevaSesion) => {
        setSesion(nuevaSesion)
      },
    )

    return () => {
      suscripcion.subscription.unsubscribe()
    }
  }, [])

  const usuarioId = sesion?.user.id ?? null

  // Primer inicio de sesión de este usuario en este dispositivo: crea sus
  // categorías y cuentas por defecto si todavía no tiene ninguna.
  useEffect(() => {
    if (!usuarioId) return

    void asegurarCategoriasPorDefecto(usuarioId)
    void asegurarCuentasPorDefecto(usuarioId)
  }, [usuarioId])

  const { enLinea, sincronizando, ultimaSincronizacion, sincronizarAhora } =
    useSync(usuarioId)

  async function manejarCerrarSesion() {
    // Mejor esfuerzo: intenta subir lo pendiente antes de salir para no
    // perder cambios que aún no llegaron a Supabase.
    if (navigator.onLine) {
      await sincronizarAhora().catch(() => {})
    }

    try {
      // scope: 'local' evita depender de red para cerrar sesión (esta es
      // una app offline-first: debe poder desloguearse sin conexión).
      await supabase?.auth.signOut({ scope: 'local' })
    } finally {
      // Evita que, en un dispositivo compartido, el siguiente usuario que
      // inicie sesión vea datos financieros de esta sesión, aun si el
      // signOut remoto falló.
      await limpiarDatosLocales()
    }
  }

  if (cargandoSesion) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 text-sm text-slate-400">
        Cargando...
      </div>
    )
  }

  if (!sesion || !usuarioId) {
    return <Auth />
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <Header
        email={sesion.user.email ?? ''}
        enLinea={enLinea}
        sincronizando={sincronizando}
        ultimaSincronizacion={ultimaSincronizacion}
        onCerrarSesion={manejarCerrarSesion}
      />

      <main className="mx-auto flex max-w-2xl flex-col gap-4 px-4 py-6">
        <Dashboard usuarioId={usuarioId} sincronizarAhora={sincronizarAhora} />
      </main>
    </div>
  )
}

export default App
