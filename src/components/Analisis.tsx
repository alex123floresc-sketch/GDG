import { useMemo, useState, type ReactNode } from 'react'
import { exportarAnalisisExcel } from '../services/exportService'
import type { Categoria, Cuenta, Transaccion } from '../types'
import {
  aniosDisponibles,
  enPeriodo,
  resumenPorCategoria,
  resumenPorPeriodo,
  variacion,
  type Granularidad,
} from '../utils/analisis'
import { formatearMoneda, formatearPorcentaje } from '../utils/formato'
import GraficoBarras from './graficos/GraficoBarras'
import GraficoDona from './graficos/GraficoDona'
import GraficoLinea from './graficos/GraficoLinea'

interface AnalisisProps {
  transacciones: Transaccion[]
  categorias: Categoria[]
  cuentas: Cuenta[]
  /** Selector de cuenta compartido con el resto del Dashboard. */
  filtroCuenta: ReactNode
}

const TODO_EL_ANIO = 'anio'

function Analisis({ transacciones, categorias, cuentas, filtroCuenta }: AnalisisProps) {
  const anios = useMemo(() => aniosDisponibles(transacciones), [transacciones])
  const [anio, setAnio] = useState(() => new Date().getFullYear())
  const [granularidad, setGranularidad] = useState<Granularidad>('mes')
  const [periodoSel, setPeriodoSel] = useState<string>(TODO_EL_ANIO)
  const [exportando, setExportando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const delAnio = useMemo(
    () => transacciones.filter((t) => t.fecha.getFullYear() === anio),
    [transacciones, anio],
  )

  const periodos = useMemo(
    () => resumenPorPeriodo(delAnio, anio, granularidad),
    [delAnio, anio, granularidad],
  )

  const periodoActivo = periodos.find((p) => p.clave === periodoSel)

  // Todo lo que está debajo del gráfico de periodos responde a la selección.
  const enRango = useMemo(
    () =>
      periodoActivo
        ? delAnio.filter((t) => enPeriodo(t, periodoActivo.clave, granularidad))
        : delAnio,
    [delAnio, periodoActivo, granularidad],
  )

  const gastosPorCategoria = useMemo(
    () => resumenPorCategoria(enRango, categorias, 'gasto'),
    [enRango, categorias],
  )
  const ingresosPorCategoria = useMemo(
    () => resumenPorCategoria(enRango, categorias, 'ingreso'),
    [enRango, categorias],
  )

  const totales = useMemo(() => {
    const ingresos = enRango.filter((t) => t.tipo === 'ingreso').reduce((s, t) => s + t.monto, 0)
    const gastos = enRango.filter((t) => t.tipo === 'gasto').reduce((s, t) => s + t.monto, 0)
    return { ingresos, gastos, balance: ingresos - gastos }
  }, [enRango])

  const kpis = useMemo(() => {
    const conGasto = periodos.filter((p) => p.gastos > 0)
    const mayor = conGasto.reduce<(typeof periodos)[number] | null>(
      (m, p) => (!m || p.gastos > m.gastos ? p : m),
      null,
    )
    const totalGastos = periodos.reduce((s, p) => s + p.gastos, 0)

    let anterior: (typeof periodos)[number] | undefined
    if (periodoActivo) {
      const i = periodos.indexOf(periodoActivo)
      anterior = i > 0 ? periodos[i - 1] : undefined
    }

    return {
      promedio: conGasto.length > 0 ? totalGastos / conGasto.length : 0,
      mayor,
      tasaAhorro: totales.ingresos > 0 ? totales.balance / totales.ingresos : null,
      variacionGasto:
        periodoActivo && anterior ? variacion(periodoActivo.gastos, anterior.gastos) : null,
      anterior,
    }
  }, [periodos, periodoActivo, totales])

  // La línea termina en el último periodo con movimientos: prolongarla
  // plana hacia meses futuros sugeriría un balance que aún no existe.
  const balanceAcumulado = useMemo(
    () =>
      periodos.slice(0, periodos.findLastIndex((p) => p.cantidad > 0) + 1).map((p, i) => ({
        etiqueta: p.etiqueta,
        etiquetaLarga: p.etiquetaLarga,
        valor: periodos.slice(0, i + 1).reduce((s, q) => s + q.balance, 0),
      })),
    [periodos],
  )

  function cambiarGranularidad(g: Granularidad) {
    setGranularidad(g)
    setPeriodoSel(TODO_EL_ANIO)
  }

  async function exportar() {
    setExportando(true)
    setError(null)
    try {
      await exportarAnalisisExcel({ transacciones, categorias, cuentas, anio, granularidad })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo generar el archivo.')
    } finally {
      setExportando(false)
    }
  }

  const nombreRango = periodoActivo ? periodoActivo.etiquetaLarga : `Todo ${anio}`
  const unidad = granularidad === 'mes' ? 'mes' : 'trimestre'

  return (
    <div className="vista-analisis">
      <div className="barra-filtros">
        <h2 className="ui header">
          <i className="chart bar icon" />
          <div className="content">
            Análisis
            <div className="sub header">Tus finanzas por {unidad}</div>
          </div>
        </h2>
        <div className="acciones-exportar no-imprimir">
          <button
            type="button"
            className={`ui primary button ${exportando ? 'loading' : ''}`}
            onClick={exportar}
            disabled={exportando}
          >
            <i className="file excel outline icon" />
            Exportar Excel
          </button>
          <button type="button" className="ui basic button" onClick={() => window.print()}>
            <i className="print icon" />
            PDF
          </button>
        </div>
      </div>

      {/* Filtros: una fila, encima de todo lo que afectan. */}
      <div className="fila-filtros ui form no-imprimir">
        <select
          aria-label="Año"
          className="ui compact dropdown"
          value={anio}
          onChange={(e) => {
            setAnio(Number(e.target.value))
            setPeriodoSel(TODO_EL_ANIO)
          }}
        >
          {anios.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>

        <div className="ui small buttons">
          <button
            type="button"
            className={`ui button ${granularidad === 'mes' ? 'primary' : 'basic'}`}
            onClick={() => cambiarGranularidad('mes')}
          >
            <i className="calendar alternate outline icon" />
            Mensual
          </button>
          <button
            type="button"
            className={`ui button ${granularidad === 'trimestre' ? 'primary' : 'basic'}`}
            onClick={() => cambiarGranularidad('trimestre')}
          >
            <i className="calendar icon" />
            Trimestral
          </button>
        </div>

        <select
          aria-label="Periodo"
          className="ui compact dropdown"
          value={periodoSel}
          onChange={(e) => setPeriodoSel(e.target.value)}
        >
          <option value={TODO_EL_ANIO}>Todo el año</option>
          {periodos.map((p) => (
            <option key={p.clave} value={p.clave}>
              {p.etiquetaLarga}
            </option>
          ))}
        </select>

        {filtroCuenta}
      </div>

      {error && (
        <div className="ui error message">
          <p>{error}</p>
        </div>
      )}

      <h3 className="solo-imprimir">
        Análisis {granularidad === 'mes' ? 'mensual' : 'trimestral'} · {nombreRango}
      </h3>

      {/* KPIs del rango seleccionado */}
      <div className="rejilla-kpi">
        <div className="kpi ui segment">
          <span className="etiqueta"><i className="arrow down icon" />Ingresos</span>
          <strong className="texto-ingreso">{formatearMoneda(totales.ingresos)}</strong>
          <span className="nota">{nombreRango}</span>
        </div>
        <div className="kpi ui segment">
          <span className="etiqueta"><i className="arrow up icon" />Gastos</span>
          <strong className="texto-gasto">{formatearMoneda(totales.gastos)}</strong>
          {kpis.variacionGasto !== null && kpis.anterior ? (
            <span className={`nota ${kpis.variacionGasto > 0 ? 'texto-gasto' : 'texto-ingreso'}`}>
              <i className={`${kpis.variacionGasto > 0 ? 'caret up' : 'caret down'} icon`} />
              {formatearPorcentaje(Math.abs(kpis.variacionGasto))} vs {kpis.anterior.etiqueta}
            </span>
          ) : (
            <span className="nota">{nombreRango}</span>
          )}
        </div>
        <div className="kpi ui segment">
          <span className="etiqueta"><i className="balance scale icon" />Balance</span>
          <strong className={totales.balance < 0 ? 'texto-gasto' : ''}>
            {formatearMoneda(totales.balance)}
          </strong>
          <span className="nota">
            {kpis.tasaAhorro === null
              ? 'Sin ingresos'
              : `Ahorro: ${formatearPorcentaje(kpis.tasaAhorro)}`}
          </span>
        </div>
        <div className="kpi ui segment">
          <span className="etiqueta"><i className="chartline icon" />Gasto promedio</span>
          <strong>{formatearMoneda(kpis.promedio)}</strong>
          <span className="nota">
            {kpis.mayor ? `Mayor: ${kpis.mayor.etiquetaLarga}` : `por ${unidad} en ${anio}`}
          </span>
        </div>
      </div>

      <div className="ui segment">
        <h3 className="ui header">
          <i className="chart bar outline icon" />
          <div className="content">
            Ingresos vs. gastos por {unidad}
            <div className="sub header no-imprimir">
              Toca un {unidad} para ver su detalle por categoría
            </div>
          </div>
        </h3>
        <GraficoBarras
          periodos={periodos}
          resaltado={periodoActivo?.clave}
          onSeleccionar={(clave) => setPeriodoSel(clave === periodoSel ? TODO_EL_ANIO : clave)}
        />
      </div>

      <div className="ui stackable two column grid">
        <div className="column">
          <div className="ui segment altura-completa">
            <h3 className="ui header">
              <i className="chart pie icon" />
              <div className="content">
                Gastos por categoría
                <div className="sub header">{nombreRango}</div>
              </div>
            </h3>
            <GraficoDona datos={gastosPorCategoria} titulo="Gastos" />
          </div>
        </div>
        <div className="column">
          <div className="ui segment altura-completa">
            <h3 className="ui header">
              <i className="chart pie icon" />
              <div className="content">
                Ingresos por categoría
                <div className="sub header">{nombreRango}</div>
              </div>
            </h3>
            <GraficoDona datos={ingresosPorCategoria} titulo="Ingresos" />
          </div>
        </div>
      </div>

      <div className="ui segment">
        <h3 className="ui header">
          <i className="chart area icon" />
          <div className="content">
            Balance acumulado {anio}
            <div className="sub header">Cuánto llevas ahorrado a lo largo del año</div>
          </div>
        </h3>
        <GraficoLinea puntos={balanceAcumulado} serie="Balance acumulado" />
      </div>

      {/* Vista de tabla: los mismos datos de los gráficos, sin depender del color. */}
      <div className="ui segment">
        <h3 className="ui header">
          <i className="table icon" />
          <div className="content">Detalle por {unidad}</div>
        </h3>
        <div className="tabla-desplazable">
          <table className="ui very basic unstackable compact selectable table">
            <thead>
              <tr>
                <th>{granularidad === 'mes' ? 'Mes' : 'Trimestre'}</th>
                <th className="right aligned">Ingresos</th>
                <th className="right aligned">Gastos</th>
                <th className="right aligned">Balance</th>
                <th className="right aligned">Ahorro</th>
              </tr>
            </thead>
            <tbody>
              {periodos.map((p) => (
                <tr
                  key={p.clave}
                  className={p.clave === periodoSel ? 'active' : ''}
                  onClick={() => setPeriodoSel(p.clave === periodoSel ? TODO_EL_ANIO : p.clave)}
                >
                  <td>{p.etiquetaLarga}</td>
                  <td className="right aligned">{formatearMoneda(p.ingresos)}</td>
                  <td className="right aligned">{formatearMoneda(p.gastos)}</td>
                  <td className={`right aligned ${p.balance < 0 ? 'texto-gasto' : ''}`}>
                    {formatearMoneda(p.balance)}
                  </td>
                  <td className="right aligned">
                    {p.ingresos > 0 ? formatearPorcentaje(p.balance / p.ingresos) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <th>Total {anio}</th>
                <th className="right aligned">
                  {formatearMoneda(periodos.reduce((s, p) => s + p.ingresos, 0))}
                </th>
                <th className="right aligned">
                  {formatearMoneda(periodos.reduce((s, p) => s + p.gastos, 0))}
                </th>
                <th className="right aligned">
                  {formatearMoneda(periodos.reduce((s, p) => s + p.balance, 0))}
                </th>
                <th />
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  )
}

export default Analisis
