import { useState } from 'react'
import type { Insight } from '../utils/insights'

interface ResumenInteligenteProps {
  insights: Insight[]
  onNavegar?: (destino: NonNullable<Insight['destino']>) => void
}

const VISIBLES = 4

/** Tarjeta con las observaciones automáticas más importantes. */
function ResumenInteligente({ insights, onNavegar }: ResumenInteligenteProps) {
  const [verTodos, setVerTodos] = useState(false)
  if (insights.length === 0) return null

  const mostrados = verTodos ? insights : insights.slice(0, VISIBLES)

  return (
    <div className="ui segment resumen-inteligente">
      <h3 className="ui header">
        <i className="lightbulb outline icon" />
        <div className="content">
          Resumen inteligente
          <div className="sub header">Lo que tus números dicen hoy</div>
        </div>
      </h3>
      <ul className="lista-insights">
        {mostrados.map((i) => {
          const contenido = (
            <>
              <span className={`icono-insight tono-${i.tono}`}>
                <i className={`${i.icono} icon`} />
              </span>
              <span className="texto">{i.texto}</span>
              {i.destino && onNavegar && <i className="chevron right icon flecha" />}
            </>
          )
          return (
            <li key={i.id}>
              {i.destino && onNavegar ? (
                <button type="button" className="insight clicable" onClick={() => onNavegar(i.destino!)}>
                  {contenido}
                </button>
              ) : (
                <div className="insight">{contenido}</div>
              )}
            </li>
          )
        })}
      </ul>
      {insights.length > VISIBLES && (
        <button type="button" className="enlace-sugerencia" onClick={() => setVerTodos((v) => !v)}>
          {verTodos ? 'Ver menos' : `Ver ${insights.length - VISIBLES} más`}
        </button>
      )}
    </div>
  )
}

export default ResumenInteligente
