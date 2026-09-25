import type { Moneda } from '../types'
import { calcularParticipantes, type EstadoDivision } from '../utils/division'
import { formatearDolares, formatearMoneda } from '../utils/formato'

interface DividirGastoProps {
  estado: EstadoDivision
  onCambiar: (estado: EstadoDivision) => void
  total: number
  moneda: Moneda
  /** Personas con deudas previas (autocompletado). */
  sugerencias: string[]
}

/** Sección del formulario para dividir un gasto con otras personas. */
function DividirGasto({ estado, onCambiar, total, moneda, sugerencias }: DividirGastoProps) {
  const formato = moneda === 'USD' ? formatearDolares : formatearMoneda
  const participantes = calcularParticipantes(estado, Number.isFinite(total) ? total : 0)
  const totalOtros = participantes.reduce((s, p) => s + p.monto, 0)
  const miParte = Math.round(((Number.isFinite(total) ? total : 0) - totalOtros) * 100) / 100

  const actualizarPersona = (i: number, cambios: Partial<{ nombre: string; monto: string }>) =>
    onCambiar({
      ...estado,
      personas: estado.personas.map((p, j) => (j === i ? { ...p, ...cambios } : p)),
    })

  return (
    <div className="dividir-gasto">
      <label className="casilla">
        <input
          type="checkbox"
          checked={estado.activa}
          onChange={(e) => onCambiar({ ...estado, activa: e.target.checked })}
        />
        <i className="user friends icon" />
        Dividir este gasto con otras personas (pagué yo)
      </label>

      {estado.activa && (
        <div className="panel-division entrada-suave">
          <div className="ui mini buttons">
            <button
              type="button"
              className={`ui button ${estado.modo === 'iguales' ? 'primary' : 'basic'}`}
              onClick={() => onCambiar({ ...estado, modo: 'iguales' })}
            >
              Partes iguales
            </button>
            <button
              type="button"
              className={`ui button ${estado.modo === 'montos' ? 'primary' : 'basic'}`}
              onClick={() => onCambiar({ ...estado, modo: 'montos' })}
            >
              Montos distintos
            </button>
          </div>

          {estado.personas.map((p, i) => (
            <div key={i} className="fila-persona">
              <input
                type="text"
                value={p.nombre}
                placeholder={`Persona ${i + 1}`}
                maxLength={40}
                list="personas-previas"
                aria-label={`Nombre de la persona ${i + 1}`}
                onChange={(e) => actualizarPersona(i, { nombre: e.target.value })}
              />
              {estado.modo === 'montos' ? (
                <input
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="0.01"
                  value={p.monto}
                  placeholder="0.00"
                  aria-label={`Parte de ${p.nombre || `la persona ${i + 1}`}`}
                  onChange={(e) => actualizarPersona(i, { monto: e.target.value })}
                />
              ) : (
                <span className="parte">{formato(participantes[i]?.monto ?? 0)}</span>
              )}
              <button
                type="button"
                className="ui mini basic icon button"
                aria-label="Quitar persona"
                disabled={estado.personas.length === 1}
                onClick={() => onCambiar({ ...estado, personas: estado.personas.filter((_, j) => j !== i) })}
              >
                <i className="close icon" />
              </button>
            </div>
          ))}
          <datalist id="personas-previas">
            {sugerencias.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>

          <button
            type="button"
            className="enlace-sugerencia"
            onClick={() => onCambiar({ ...estado, personas: [...estado.personas, { nombre: '', monto: '' }] })}
          >
            + Agregar persona
          </button>

          <div className={`resumen-division ${miParte < 0 ? 'texto-gasto' : ''}`}>
            <span>
              Tu parte: <strong>{formato(Math.max(0, miParte))}</strong>
            </span>
            <span>
              Te deben: <strong>{formato(totalOtros)}</strong>
            </span>
          </div>
          {miParte < 0 && <p className="texto-gasto">Las partes de los demás suman más que el total.</p>}
          <p className="texto-suave nota-formulario">
            Solo tu parte cuenta como gasto. Lo que pagaste por los demás queda en la cuenta "Por
            cobrar" y en Planificar → Deudas hasta que te paguen.
          </p>
        </div>
      )}
    </div>
  )
}

export default DividirGasto
