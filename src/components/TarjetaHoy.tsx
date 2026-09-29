import { useState } from 'react'
import { formatearMoneda } from '../utils/formato'
import { NIVELES_SALUD, type GastoDiario, type PuntajeSalud } from '../utils/salud'

interface TarjetaHoyProps {
  gasto: GastoDiario
  puntaje: PuntajeSalud | null
  onVerSalud: () => void
}

/** Inicio: "Hoy puedes gastar…" con su desglose, y el puntaje de salud. */
function TarjetaHoy({ gasto, puntaje, onVerSalud }: TarjetaHoyProps) {
  const [abierta, setAbierta] = useState(false)
  const sinMargen = gasto.disponibleMes + gasto.gastadoHoy <= 0
  const nivel = puntaje ? NIVELES_SALUD[puntaje.nivel] : null

  return (
    <section className="ui segment tarjeta-hoy">
      <div className="fila-hoy">
        <div className="cifra-hoy">
          <span className="etiqueta">
            <i className="calendar day icon" />
            {sinMargen ? 'Margen del mes' : 'Hoy puedes gastar'}
          </span>
          {sinMargen ? (
            <strong className="texto-gasto">−{formatearMoneda(-(gasto.disponibleMes + gasto.gastadoHoy))}</strong>
          ) : (
            <strong className={gasto.hoyQuedan < 0 ? 'texto-gasto' : ''}>{formatearMoneda(gasto.hoyQuedan)}</strong>
          )}
          <span className="nota">
            {sinMargen
              ? 'Este mes ya gastaste o comprometiste más de lo que entra.'
              : gasto.gastadoHoy > 0
                ? `De ${formatearMoneda(gasto.porDia)} al día · ya gastaste ${formatearMoneda(gasto.gastadoHoy)} hoy`
                : `Te quedan ${formatearMoneda(gasto.disponibleMes)} para ${gasto.diasRestantes === 1 ? 'el último día' : `los ${gasto.diasRestantes} días que faltan`}`}
          </span>
        </div>
        {puntaje && nivel && (
          <button type="button" className={`chip-salud ${nivel.clase}`} onClick={onVerSalud} title="Ver tu salud financiera">
            <i className={`${nivel.icono} icon`} />
            <span>
              <strong>{puntaje.total}</strong>/100
            </span>
            <small>{nivel.etiqueta}</small>
          </button>
        )}
      </div>
      <button type="button" className="enlace-sugerencia" aria-expanded={abierta} onClick={() => setAbierta(!abierta)}>
        <i className={`${abierta ? 'chevron up' : 'chevron down'} icon`} />
        ¿Cómo se calcula?
      </button>
      {abierta && (
        <table className="ui very basic unstackable compact table desglose-hoy">
          <tbody>
            {gasto.partes.map((p) => (
              <tr key={p.etiqueta}>
                <td>{p.etiqueta}</td>
                <td className={`right aligned ${p.monto < 0 ? 'texto-gasto' : 'texto-ingreso'}`}>
                  {p.monto < 0 ? '−' : '+'}
                  {formatearMoneda(Math.abs(p.monto))}
                </td>
              </tr>
            ))}
            <tr className="total">
              <td>Margen del mes (entre {gasto.diasRestantes} días que quedan)</td>
              <td className="right aligned">{formatearMoneda(gasto.disponibleMes)}</td>
            </tr>
          </tbody>
        </table>
      )}
    </section>
  )
}

export default TarjetaHoy
