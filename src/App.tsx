import type { Session } from '@supabase/supabase-js'
import { useEffect, useState } from 'react'
import Auth from './components/Auth'
import Avisos from './components/Avisos'
import Dashboard from './components/Dashboard'
import Header from './components/Header'
import { useSync } from './hooks/useSync'
import { asegurarCategoriasPorDefecto } from './services/categoriaService'
import { asegurarCuentasPorDefecto } from './services/cuentaService'
import { supabase } from './services/supabaseClient'
import { descargarCatalogos } from './services/syncService'
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

  // Al iniciar sesión: primero recupera de Supabase las categorías/cuentas
  // del usuario (si hay red) y solo si sigue sin tener ninguna crea las de
  // por defecto. Así no se duplican con ids nuevos en cada inicio de sesión.
  useEffect(() => {
    if (!usuarioId) return

    void (async () => {
      if (navigator.onLine) {
        await descargarCatalogos(usuarioId).catch(() => {})
      }
      await asegurarCategoriasPorDefecto(usuarioId)
      await asegurarCuentasPorDefecto(usuarioId)
    })()
  }, [usuarioId])

  const {
    enLinea,
    sincronizando,
    ultimaSincronizacion,
    error: errorSincronizacion,
    pendientes,
    migracionesPendientes,
    sincronizarAhora,
  } = useSync(usuarioId)

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
      <div className="pantalla-carga ui active inverted dimmer">
        <div className="ui text loader">Cargando...</div>
      </div>
    )
  }

  if (!sesion || !usuarioId) {
    return <Auth />
  }

  return (
    <Avisos>
      <Header
        email={sesion.user.email ?? ''}
        enLinea={enLinea}
        sincronizando={sincronizando}
        ultimaSincronizacion={ultimaSincronizacion}
        pendientes={pendientes}
        error={errorSincronizacion}
        onSincronizar={sincronizarAhora}
        onCerrarSesion={manejarCerrarSesion}
      />

      <main className="app-contenido">
        <div className="ui container">
          {errorSincronizacion && enLinea && (
            <div className="ui warning icon message aviso-sincronizacion">
              <i className="exclamation triangle icon" />
              <div className="content">
                <div className="header">
                  {pendientes > 0
                    ? `${pendientes} cambio${pendientes === 1 ? '' : 's'} sin sincronizar`
                    : 'No se pudo sincronizar'}
                </div>
                <p className="detalle-error">{errorSincronizacion}</p>
                <p>Tus datos están guardados en este dispositivo; se reintentará automáticamente.</p>
                <button
                  type="button"
                  className="ui mini basic button"
                  onClick={() => void navigator.clipboard?.writeText(errorSincronizacion)}
                >
                  <i className="copy outline icon" />
                  Copiar detalle del error
                </button>
              </div>
            </div>
          )}
          {migracionesPendientes.length > 0 && !errorSincronizacion && (
            <div className="ui info icon message aviso-sincronizacion">
              <i className="database icon" />
              <div className="content">
                <div className="header">Falta actualizar tu base de datos en Supabase</div>
                <p>
                  Tus transacciones, categorías y cuentas se sincronizan normalmente, pero lo más
                  nuevo (
                  {migracionesPendientes.includes('v0.7.sql')
                    ? 'metas, deudas, recurrentes, presupuestos, transferencias, dólares, etiquetas'
                    : 'etiquetas y gastos divididos'}
                  ) solo se guarda en este dispositivo hasta que ejecutes, en este orden, en el SQL
                  Editor de Supabase:{' '}
                  {migracionesPendientes.map((m, i) => (
                    <span key={m}>
                      {i > 0 && ', '}
                      <code>supabase/migraciones/{m}</code>
                    </span>
                  ))}
                  .
                </p>
              </div>
            </div>
          )}
          <Dashboard usuarioId={usuarioId} email={sesion.user.email ?? ''} sincronizarAhora={sincronizarAhora} />
        </div>
      </main>
    </Avisos>
  )
}

export default App
