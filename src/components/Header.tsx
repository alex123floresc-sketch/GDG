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
    ? { etiqueta: 'Sincronizando', color: 'blue', icono: 'sync loading' }
    : enLinea
      ? { etiqueta: 'En línea', color: 'green', icono: 'cloud' }
      : { etiqueta: 'Sin conexión', color: 'red', icono: 'plug' }

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
            <span
              className={`ui ${estado.color} label`}
              title={
                ultimaSincronizacion
                  ? `Última sincronización: ${ultimaSincronizacion.toLocaleTimeString(
                      'es-PE',
                      { hour: '2-digit', minute: '2-digit' },
                    )}`
                  : undefined
              }
            >
              <i className={`${estado.icono} icon`} />
              {estado.etiqueta}
            </span>
          </div>

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
