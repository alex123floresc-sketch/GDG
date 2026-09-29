import type { Logro, Racha } from '../utils/logros'

interface LogrosProps {
  logros: Logro[]
  racha: Racha
}

/** Más → Logros: racha de días registrando y medallas. */
function Logros({ logros, racha }: LogrosProps) {
  const conseguidos = logros.filter((l) => l.logrado).length

  return (
    <>
      <div className="barra-filtros">
        <h2 className="ui header">
          <i className="trophy icon" />
          <div className="content">
            Logros
            <div className="sub header">
              {conseguidos} de {logros.length} conseguidos
            </div>
          </div>
        </h2>
      </div>

      <section className="ui segment tarjeta-racha">
        <div className={`llama ${racha.actual > 0 ? 'activa' : ''}`} aria-hidden="true">
          <i className="fire icon" />
        </div>
        <div className="datos-racha">
          <strong>
            {racha.actual} día{racha.actual === 1 ? '' : 's'} seguido{racha.actual === 1 ? '' : 's'}
          </strong>
          <span className="texto-suave">
            {racha.actual === 0
              ? 'Registra un gasto o ingreso hoy para empezar una racha.'
              : racha.hoy
                ? '¡Ya registraste hoy! Vuelve mañana para seguir sumando.'
                : 'Registra algo hoy para no perder tu racha.'}
          </span>
          <span className="texto-suave">Tu mejor racha: {racha.mejor} día{racha.mejor === 1 ? '' : 's'}</span>
        </div>
      </section>

      <div className="rejilla-logros">
        {logros.map((l) => (
          <div key={l.id} className={`medalla ${l.logrado ? 'lograda' : ''}`}>
            <span className="icono-medalla">
              <i className={`${l.logrado ? l.icono : 'lock'} icon`} />
            </span>
            <strong>{l.nombre}</strong>
            <span className="texto-suave">{l.descripcion}</span>
            {l.logrado ? (
              <span className="estado-medalla">
                <i className="check icon" />
                Conseguido
              </span>
            ) : (
              l.progreso && (
                <span className="estado-medalla texto-suave">
                  {l.progreso.actual.toLocaleString('es-PE')} / {l.progreso.meta.toLocaleString('es-PE')}
                </span>
              )
            )}
          </div>
        ))}
      </div>
    </>
  )
}

export default Logros
