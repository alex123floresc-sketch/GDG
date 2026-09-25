import { useState, type KeyboardEvent } from 'react'
import { normalizarEtiqueta } from '../utils/etiquetas'

interface CampoEtiquetasProps {
  etiquetas: string[]
  onCambiar: (etiquetas: string[]) => void
  /** Etiquetas ya usadas (sugerencias), de la más a la menos frecuente. */
  sugerencias: string[]
  id?: string
}

const MAX_ETIQUETAS = 5

/** Etiquetas como chips: Enter, coma o espacio agregan; ⌫ en vacío quita la última. */
function CampoEtiquetas({ etiquetas, onCambiar, sugerencias, id }: CampoEtiquetasProps) {
  const [texto, setTexto] = useState('')

  function agregar(valor: string) {
    const etiqueta = normalizarEtiqueta(valor)
    setTexto('')
    if (!etiqueta || etiquetas.includes(etiqueta) || etiquetas.length >= MAX_ETIQUETAS) return
    onCambiar([...etiquetas, etiqueta])
  }

  function manejarTecla(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' || e.key === ',' || e.key === ' ') {
      if (texto.trim()) {
        e.preventDefault()
        agregar(texto)
      } else if (e.key === 'Enter') {
        e.preventDefault()
      }
    } else if (e.key === 'Backspace' && !texto && etiquetas.length > 0) {
      onCambiar(etiquetas.slice(0, -1))
    }
  }

  const filtro = normalizarEtiqueta(texto)
  const disponibles = sugerencias
    .filter((s) => !etiquetas.includes(s) && (!filtro || s.includes(filtro)))
    .slice(0, 6)

  return (
    <div className="campo-etiquetas">
      <div className="caja-etiquetas">
        {etiquetas.map((e) => (
          <span key={e} className="chip-etiqueta">
            #{e}
            <button type="button" aria-label={`Quitar ${e}`} onClick={() => onCambiar(etiquetas.filter((x) => x !== e))}>
              <i className="close icon" />
            </button>
          </span>
        ))}
        {etiquetas.length < MAX_ETIQUETAS && (
          <input
            id={id}
            type="text"
            value={texto}
            placeholder={etiquetas.length ? '' : 'Ej. viaje-cusco, cumpleaños'}
            onChange={(e) => setTexto(e.target.value)}
            onKeyDown={manejarTecla}
            onBlur={() => texto.trim() && agregar(texto)}
            autoComplete="off"
            enterKeyHint="done"
          />
        )}
      </div>
      {disponibles.length > 0 && (
        <div className="sugerencias-etiquetas">
          {disponibles.map((s) => (
            <button key={s} type="button" className="ui mini basic button" onClick={() => agregar(s)}>
              #{s}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export default CampoEtiquetas
