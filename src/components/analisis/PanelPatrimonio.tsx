import { useMemo, useState } from 'react'
import type { Cuenta, Deuda, Transaccion } from '../../types'
import { formatearMoneda, formatearPorcentaje } from '../../utils/formato'
import { evolucionPatrimonio } from '../../utils/patrimonio'
import GraficoLinea from '../graficos/GraficoLinea'

interface PanelPatrimonioProps {
  cuentas: Cuenta[]
  transacciones: Transaccion[]
  deudas: Deuda[]
}

const RANGOS = [6, 12, 24]

/** Evolución del patrimonio neto mes a mes. */
function PanelPatrimonio({ cuentas, transacciones, deudas }: PanelPatrimonioProps) {
  const [meses, setMeses] = useState(12)
  const puntos = useMemo(
    () => evolucionPatrimonio(cuentas, transacciones, deudas, meses),
    [cuentas, transacciones, deudas, meses],
  )

  const actual = puntos[puntos.length - 1]
  const inicial = puntos[0]
  const cambio = actual && inicial ? actual.patrimonio - inicial.patrimonio : 0
  const cambioRelativo = inicial && inicial.patrimonio !== 0 ? cambio / Math.abs(inicial.patrimonio) : null

  if (!actual) return null

  return (
    <>
      <div className="rejilla-kpi">
        <div className="kpi ui segment">
          <span className="etiqueta"><i className="balance scale icon" />Patrimonio neto hoy</span>
          <strong className={actual.patrimonio < 0 ? 'texto-gasto' : ''}>{formatearMoneda(actual.patrimonio)}</strong>
          <span className="nota">Cuentas + te deben − debes</span>
        </div>
        <div className="kpi ui segment">
          <span className="etiqueta"><i className={`${cambio >= 0 ? 'arrow up' : 'arrow down'} icon`} />Cambio en {meses} meses</span>
          <strong className={cambio >= 0 ? 'texto-ingreso' : 'texto-gasto'}>
            {cambio >= 0 ? '+' : '-'}
            {formatearMoneda(Math.abs(cambio))}
          </strong>
          <span className="nota">{cambioRelativo !== null ? `${cambio >= 0 ? '+' : '-'}${formatearPorcentaje(Math.abs(cambioRelativo))}` : '—'}</span>
        </div>
        <div className="kpi ui segment">
          <span className="etiqueta"><i className="hand holding usd icon" />Te deben</span>
          <strong>{formatearMoneda(actual.meDeben)}</strong>
          <span className="nota">Préstamos que hiciste</span>
        </div>
        <div className="kpi ui segment">
          <span className="etiqueta"><i className="handshake icon" />Debes</span>
          <strong className={actual.debo > 0 ? 'texto-gasto' : ''}>{formatearMoneda(actual.debo)}</strong>
          <span className="nota">A otras personas</span>
        </div>
      </div>

      <div className="ui segment">
        <div className="barra-filtros">
          <h3 className="ui header">
            <i className="chart area icon" />
            <div className="content">
              Patrimonio neto
              <div className="sub header">Al cierre de cada mes</div>
            </div>
          </h3>
          <div className="ui mini buttons">
            {RANGOS.map((m) => (
              <button key={m} type="button" className={`ui button ${meses === m ? 'primary' : 'basic'}`} onClick={() => setMeses(m)}>
                {m} meses
              </button>
            ))}
          </div>
        </div>
        <GraficoLinea
          puntos={puntos.map((p) => ({ etiqueta: p.etiqueta, etiquetaLarga: p.etiquetaLarga, valor: p.patrimonio }))}
          serie="Patrimonio neto"
          alto={240}
        />
      </div>

      <div className="ui segment">
        <h3 className="ui header">
          <i className="table icon" />
          <div className="content">Detalle por mes</div>
        </h3>
        <div className="tabla-desplazable">
          <table className="ui very basic unstackable compact table">
            <thead>
              <tr>
                <th>Mes</th>
                <th className="right aligned">Cuentas</th>
                <th className="right aligned">Te deben</th>
                <th className="right aligned">Debes</th>
                <th className="right aligned">Patrimonio</th>
              </tr>
            </thead>
            <tbody>
              {[...puntos].reverse().map((p) => (
                <tr key={p.etiquetaLarga}>
                  <td>{p.etiquetaLarga}</td>
                  <td className="right aligned">{formatearMoneda(p.cuentas)}</td>
                  <td className="right aligned">{formatearMoneda(p.meDeben)}</td>
                  <td className="right aligned">{formatearMoneda(p.debo)}</td>
                  <td className={`right aligned ${p.patrimonio < 0 ? 'texto-gasto' : ''}`}>
                    <strong>{formatearMoneda(p.patrimonio)}</strong>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="texto-suave nota-formulario">
          <i className="info circle icon" />
          Se calcula desde el saldo inicial de cada cuenta. Si no registraste el saldo real al empezar,
          ajústalo en Más → Cuentas.
        </p>
      </div>
    </>
  )
}

export default PanelPatrimonio
