import { useMemo } from 'react'
import type { Transaccion } from '../types'
import { formatearMoneda } from '../utils/formato'

interface ResumenFinancieroProps {
  transacciones: Transaccion[]
}

function ResumenFinanciero({ transacciones }: ResumenFinancieroProps) {
  const { totalIngresos, totalGastos, balance } = useMemo(() => {
    const totalIngresos = transacciones
      .filter((t) => t.tipo === 'ingreso')
      .reduce((suma, t) => suma + t.monto, 0)

    const totalGastos = transacciones
      .filter((t) => t.tipo === 'gasto')
      .reduce((suma, t) => suma + t.monto, 0)

    return {
      totalIngresos,
      totalGastos,
      balance: totalIngresos - totalGastos,
    }
  }, [transacciones])

  const tarjetas = [
    {
      etiqueta: 'Ingresos',
      valor: totalIngresos,
      icono: 'arrow down',
      fondo: 'var(--color-ingreso)',
      claseValor: 'texto-ingreso',
    },
    {
      etiqueta: 'Gastos',
      valor: totalGastos,
      icono: 'arrow up',
      fondo: 'var(--color-gasto)',
      claseValor: 'texto-gasto',
    },
    {
      etiqueta: 'Balance',
      valor: balance,
      icono: 'balance scale',
      fondo: 'var(--color-marca)',
      claseValor: balance < 0 ? 'texto-gasto' : '',
    },
  ]

  return (
    <div className="ui stackable three column grid">
      {tarjetas.map((t) => (
        <div key={t.etiqueta} className="column">
          <div className="tarjeta-resumen ui segment">
            <span className="icono-circulo" style={{ background: t.fondo }}>
              <i className={`${t.icono} icon`} />
            </span>
            <div className="ui small statistic">
              <div className={`value ${t.claseValor}`}>
                {formatearMoneda(t.valor)}
              </div>
              <div className="label">{t.etiqueta}</div>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

export default ResumenFinanciero
