import { useState } from 'react'

interface HeaderProps {
  email: string
  enLinea: boolean
  sincronizando: boolean
  ultimaSincronizacion: Date | null
  onCerrarSesion: () => Promise<void> | void
}

function Header({
  email,
  enLinea,
  sincronizando,
  ultimaSincronizacion,
  onCerrarSesion,
}: HeaderProps) {
  const [cerrandoSesion, setCerrandoSesion] = useState(false)

  const estado = sincronizando
    ? {
        etiqueta: 'Sincronizando',
        punto: 'bg-sky-400 animate-pulse',
        pastilla: 'bg-sky-500/10 text-sky-300 ring-sky-500/30',
      }
    : enLinea
      ? {
          etiqueta: 'En línea',
          punto: 'bg-emerald-400',
          pastilla: 'bg-emerald-500/10 text-emerald-300 ring-emerald-500/30',
        }
      : {
          etiqueta: 'Modo Offline',
          punto: 'bg-red-400',
          pastilla: 'bg-red-500/10 text-red-300 ring-red-500/30',
        }

  async function manejarCerrarSesion() {
    setCerrandoSesion(true)
    try {
      await onCerrarSesion()
    } finally {
      setCerrandoSesion(false)
    }
  }

  return (
    <header className="sticky top-0 z-10 border-b border-slate-800 bg-slate-950/80 backdrop-blur">
      <div className="mx-auto flex max-w-2xl flex-wrap items-center justify-between gap-3 px-4 py-3">
        <div>
          <h1 className="text-lg font-semibold text-slate-100">
            Gestor de Gastos
          </h1>
          {ultimaSincronizacion && (
            <p className="text-xs text-slate-500">
              Última sincronización:{' '}
              {ultimaSincronizacion.toLocaleTimeString('es-PE', {
                hour: '2-digit',
                minute: '2-digit',
              })}
            </p>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <span
            className={`flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium ring-1 ring-inset ${estado.pastilla}`}
          >
            <span className={`h-2 w-2 rounded-full ${estado.punto}`} />
            {estado.etiqueta}
          </span>

          <span className="max-w-[160px] truncate text-xs text-slate-400" title={email}>
            {email}
          </span>

          <button
            type="button"
            onClick={manejarCerrarSesion}
            disabled={cerrandoSesion}
            className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-300 transition hover:border-red-500/50 hover:text-red-300 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {cerrandoSesion ? 'Saliendo...' : 'Cerrar sesión'}
          </button>
        </div>
      </div>
    </header>
  )
}

export default Header
