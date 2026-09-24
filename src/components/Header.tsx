interface HeaderProps {
  enLinea: boolean
  sincronizando: boolean
  ultimaSincronizacion: Date | null
}

function Header({ enLinea, sincronizando, ultimaSincronizacion }: HeaderProps) {
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

  return (
    <header className="sticky top-0 z-10 border-b border-slate-800 bg-slate-950/80 backdrop-blur">
      <div className="mx-auto flex max-w-2xl items-center justify-between gap-4 px-4 py-3">
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

        <span
          className={`flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium ring-1 ring-inset ${estado.pastilla}`}
        >
          <span className={`h-2 w-2 rounded-full ${estado.punto}`} />
          {estado.etiqueta}
        </span>
      </div>
    </header>
  )
}

export default Header
