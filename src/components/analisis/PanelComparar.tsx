import { useMemo, useState } from 'react'
import type { Categoria, Transaccion } from '../../types'
import {
  compararPeriodos,
  rangoMes,
  rangosPorDefecto,
  type FilaComparacion,
  type ModoComparacion,
  type Rango,
} from '../../utils/comparacion'
import { formatearMoneda, formatearPorcentaje } from '../../utils/formato'

interface PanelCompararProps {
  transacciones: Transaccion[]
  categorias: Categoria[]
}

/** 'YYYY-MM' de un <input type="month"> → rango del mes. */
function rangoDeInput(valor: string): Rango {
  const [a, m] = valor.split('-').map(Number)
  return rangoMes(a, m - 1)
}

const aInputMes = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`

/** Diferencia con flecha: en gastos subir es malo; en ingresos, bueno. */
function Diferencia({ fila, tipo }: { fila: FilaComparacion; tipo: 'gasto' | 'ingreso' }) {
  if (Math.abs(fila.diferencia) < 0.005) return <span className="texto-suave">=</span>
  const sube = fila.diferencia > 0
  const bueno = tipo === 'gasto' ? !sube : sube
  return (
    <span className={bueno ? 'texto-ingreso' : 'texto-gasto'}>
      <i className={`caret ${sube ? 'up' : 'down'} icon`} />
      {formatearMoneda(Math.abs(fila.diferencia))}
      {fila.cambio !== null && <small> ({formatearPorcentaje(Math.abs(fila.cambio))})</small>}
    </span>
  )
}

/** Compara dos periodos lado a lado por categoría. */
function PanelComparar({ transacciones, categorias }: PanelCompararProps) {
  const [hoy] = useState(() => new Date())
  const [modo, setModo] = useState<ModoComparacion>('mes')
  const [mesA, setMesA] = useState(() => aInputMes(new Date(hoy.getFullYear(), hoy.getMonth() - 1, 1)))
  const [mesB, setMesB] = useState(() => aInputMes(hoy))
  const [tipo, setTipo] = useState<'gasto' | 'ingreso'>('gasto')

  const { anterior, actual, parcial } = useMemo(() => {
    if (modo === 'personalizado') {
      return { anterior: rangoDeInput(mesA), actual: rangoDeInput(mesB), parcial: false }
    }
    const r = rangosPorDefecto(modo, hoy)
    return { anterior: r.anterior, actual: r.actual, parcial: r.parcial }
  }, [modo, mesA, mesB, hoy])

  const resultado = useMemo(
    () => compararPeriodos(transacciones, categorias, anterior, actual),
    [transacciones, categorias, anterior, actual],
  )
  const filas = tipo === 'gasto' ? resultado.gastos : resultado.ingresos
  const maximo = Math.max(1, ...filas.flatMap((f) => [f.a, f.b]))
  const t = resultado.totales

  const kpi = (etiqueta: string, a: number, b: number, subirEsBueno: boolean) => {
    const dif = b - a
    const bueno = subirEsBueno ? dif >= 0 : dif <= 0
    return (
      <div className="kpi ui segment">
        <span className="etiqueta">{etiqueta}</span>
        <strong>{formatearMoneda(b)}</strong>
        <span className="nota">
          antes {formatearMoneda(a)}
          {Math.abs(dif) >= 0.005 && (
            <span className={bueno ? 'texto-ingreso' : 'texto-gasto'}>
              {' '}
              <i className={`caret ${dif > 0 ? 'up' : 'down'} icon`} />
              {formatearMoneda(Math.abs(dif))}
            </span>
          )}
        </span>
      </div>
    )
  }

  return (
    <>
      <div className="fila-filtros ui form">
        <div className="ui small buttons">
          <button type="button" className={`ui button ${modo === 'mes' ? 'primary' : 'basic'}`} onClick={() => setModo('mes')}>
            Este mes vs. anterior
          </button>
          <button type="button" className={`ui button ${modo === 'anio' ? 'primary' : 'basic'}`} onClick={() => setModo('anio')}>
            Este año vs. anterior
          </button>
          <button
            type="button"
            className={`ui button ${modo === 'personalizado' ? 'primary' : 'basic'}`}
            onClick={() => setModo('personalizado')}
          >
            Elegir meses
          </button>
        </div>
        {modo === 'personalizado' && (
          <>
            <input type="month" aria-label="Primer mes" value={mesA} onChange={(e) => e.target.value && setMesA(e.target.value)} />
            <span className="texto-suave">vs.</span>
            <input type="month" aria-label="Segundo mes" value={mesB} onChange={(e) => e.target.value && setMesB(e.target.value)} />
          </>
        )}
      </div>

      <p className="texto-suave nota-formulario">
        <strong>{anterior.etiqueta}</strong> vs. <strong>{actual.etiqueta}</strong>
        {parcial && ' · hasta el mismo día, para que la comparación sea justa'}
      </p>

      <div className="rejilla-kpi tres">
        {kpi('Ingresos', t.ingresosA, t.ingresosB, true)}
        {kpi('Gastos', t.gastosA, t.gastosB, false)}
        {kpi('Ahorro', t.ahorroA, t.ahorroB, true)}
      </div>

      <div className="ui segment">
        <div className="barra-filtros">
          <div className="grafico-leyenda sin-margen">
            <span className="item"><span className="muestra caja" style={{ background: 'var(--grafico-eje)' }} />{anterior.etiqueta}</span>
            <span className="item"><span className="muestra caja" style={{ background: 'var(--color-marca)' }} />{actual.etiqueta}</span>
          </div>
          <div className="ui mini buttons">
            <button type="button" className={`ui button ${tipo === 'gasto' ? 'primary' : 'basic'}`} onClick={() => setTipo('gasto')}>
              Gastos
            </button>
            <button type="button" className={`ui button ${tipo === 'ingreso' ? 'primary' : 'basic'}`} onClick={() => setTipo('ingreso')}>
              Ingresos
            </button>
          </div>
        </div>

        {filas.length === 0 ? (
          <p className="texto-suave">No hay {tipo === 'gasto' ? 'gastos' : 'ingresos'} en estos periodos.</p>
        ) : (
          <div className="lista-comparacion">
            {filas.map((f) => (
              <div key={f.categoriaId} className="fila-comparacion">
                <div className="cabecera">
                  <span className="icono-circulo mini" style={{ background: f.color }}>
                    <i className={`${f.icono} icon`} />
                  </span>
                  <span className="nombre">{f.nombre}</span>
                  <Diferencia fila={f} tipo={tipo} />
                </div>
                <div className="barras" aria-label={`${f.nombre}: ${formatearMoneda(f.a)} → ${formatearMoneda(f.b)}`}>
                  <div className="barra">
                    <span className="relleno anterior" style={{ width: `${(f.a / maximo) * 100}%` }} />
                    <span className="valor">{formatearMoneda(f.a)}</span>
                  </div>
                  <div className="barra">
                    <span className="relleno actual" style={{ width: `${(f.b / maximo) * 100}%` }} />
                    <span className="valor">{formatearMoneda(f.b)}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  )
}

export default PanelComparar
