import { useState } from 'react'
import { guardarTema, leerTema, type Tema } from '../utils/preferencias'
import { aplicarTema } from '../utils/tema'

const TEMAS: { id: Tema; icono: string; etiqueta: string }[] = [
  { id: 'auto', icono: 'adjust', etiqueta: 'Tema automático (según el sistema)' },
  { id: 'claro', icono: 'sun', etiqueta: 'Tema claro' },
  { id: 'oscuro', icono: 'moon', etiqueta: 'Tema oscuro' },
]

interface HeaderProps {
  email: string
  enLinea: boolean
  sincronizando: boolean
  ultimaSincronizacion: Date | null
  /** Transacciones locales aún no subidas a Supabase. */
  pendientes: number
  error: string | null
  onSincronizar: () => Promise<void>
  onCerrarSesion: () => Promise<void> | void
}

function Header({
  email,
  enLinea,
  sincronizando,
  ultimaSincronizacion,
  pendientes,
  error,
  onSincronizar,
  onCerrarSesion,
}: HeaderProps) {
  const [cerrandoSesion, setCerrandoSesion] = useState(false)
  const [tema, setTema] = useState<Tema>(leerTema)
  const temaActual = TEMAS.find((t) => t.id === tema)!

  function cambiarTema() {
    const siguiente = TEMAS[(TEMAS.indexOf(temaActual) + 1) % TEMAS.length].id
    setTema(siguiente)
    guardarTema(siguiente)
    aplicarTema(siguiente)
  }

  const estado = sincronizando
    ? { etiqueta: 'Sincronizando', color: 'blue', icono: 'sync loading' }
    : !enLinea
      ? { etiqueta: 'Sin conexión', color: 'red', icono: 'plug' }
      : error
        ? { etiqueta: 'Error al sincronizar', color: 'red', icono: 'exclamation triangle' }
        : pendientes > 0
          ? { etiqueta: 'Pendiente', color: 'orange', icono: 'clock outline' }
          : { etiqueta: 'En línea', color: 'green', icono: 'cloud' }

  const titulo = [
    error,
    pendientes > 0 ? `${pendientes} cambio(s) sin subir` : null,
    ultimaSincronizacion
      ? `Última sincronización: ${ultimaSincronizacion.toLocaleTimeString('es-PE', {
          hour: '2-digit',
          minute: '2-digit',
        })}`
      : null,
  ]
    .filter(Boolean)
    .join('\n')

  async function manejarCerrarSesion() {
    setCerrandoSesion(true)
    try {
      await onCerrarSesion()
    } finally {
      setCerrandoSesion(false)
    }
  }

  return (
    <header className="app-header ui inverted borderless menu">
      <div className="ui container">
        <div className="marca header item">
          <img src="/favicon.svg" alt="" />
          Gestor de Gastos
        </div>

        <div className="right menu">
          <div className="item">
            <span className={`ui ${estado.color} label`} title={titulo || undefined}>
              <i className={`${estado.icono} icon`} />
              <span className="solo-escritorio">{estado.etiqueta}</span>
              {pendientes > 0 && <span className="detail">{pendientes}</span>}
            </span>
          </div>

          <button
            type="button"
            onClick={() => void onSincronizar()}
            disabled={!enLinea || sincronizando}
            className="link item"
            title={enLinea ? 'Sincronizar ahora' : 'Sin conexión'}
          >
            <i className={`sync alternate icon ${sincronizando ? 'loading' : ''}`} />
            <span className="solo-escritorio">Sincronizar ahora</span>
          </button>

          <button
            type="button"
            onClick={cambiarTema}
            className="link item"
            title={`${temaActual.etiqueta} · tocar para cambiar`}
            aria-label={temaActual.etiqueta}
          >
            <i className={`${temaActual.icono} icon`} />
          </button>

          <div className="email item" title={email}>
            <i className="user circle icon" />
            {email}
          </div>

          <button
            type="button"
            onClick={manejarCerrarSesion}
            disabled={cerrandoSesion}
            className="link item"
            title="Cerrar sesión"
          >
            <i
              className={`${cerrandoSesion ? 'spinner loading' : 'sign out alternate'} icon`}
            />
            <span className="solo-escritorio">Salir</span>
          </button>
        </div>
      </div>
    </header>
  )
}

export default Header
