import { useEffect, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

interface ModalProps {
  abierto: boolean
  titulo: ReactNode
  icono?: string
  onCerrar: () => void
  children: ReactNode
  /** `tiny` | `small` (por defecto) | `large` */
  tamano?: 'tiny' | 'small' | 'large'
}

/**
 * Modal de Fomantic manejado con React (sin el JS de Fomantic, que exige
 * jQuery). Cierra con Escape o tocando fuera.
 */
function Modal({ abierto, titulo, icono, onCerrar, children, tamano = 'small' }: ModalProps) {
  useEffect(() => {
    if (!abierto) return

    const manejarTecla = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCerrar()
    }
    document.addEventListener('keydown', manejarTecla)
    document.body.classList.add('con-modal')
    return () => {
      document.removeEventListener('keydown', manejarTecla)
      document.body.classList.remove('con-modal')
    }
  }, [abierto, onCerrar])

  if (!abierto) return null

  // Portal a <body>: así queda por encima de la barra de navegación fija
  // y de cualquier contexto de apilamiento del contenido.
  return createPortal(
    <div
      className="ui page dimmer modals active visible fondo-modal"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onCerrar()
      }}
    >
      <div
        className={`ui ${tamano} modal active visible modal-app`}
        role="dialog"
        aria-modal="true"
      >
        <button type="button" className="cerrar-modal" aria-label="Cerrar" onClick={onCerrar}>
          <i className="close icon" />
        </button>
        <div className="header">
          {icono && <i className={`${icono} icon`} />}
          {titulo}
        </div>
        <div className="scrolling content">{children}</div>
      </div>
    </div>,
    document.body,
  )
}

export default Modal
