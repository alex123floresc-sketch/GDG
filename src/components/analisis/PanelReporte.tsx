import { useEffect, useMemo, useState } from 'react'
import type { Categoria, Cuenta, Meta, Presupuesto, Transaccion } from '../../types'
import { esMovimientoReal, resumenPorCategoria } from '../../utils/analisis'
import { compararPeriodos, rangoMes } from '../../utils/comparacion'
import { resumenPorEtiqueta } from '../../utils/etiquetas'
import { formatearFecha, formatearMoneda, formatearPorcentaje } from '../../utils/formato'
import { estadoPresupuestos } from '../../utils/planificacion'
import GraficoDona from '../graficos/GraficoDona'

interface PanelReporteProps {
  email: string
  transacciones: Transaccion[]
  categorias: Categoria[]
  cuentas: Cuenta[]
  presupuestos: Presupuesto[]
  metas: Meta[]
}

const aInputMes = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`

/**
 * Imprime solo el reporte (el navegador ofrece "Guardar como PDF"),
 * siempre en tema claro para que se lea en papel.
 */
function imprimirReporte() {
  const raiz = document.documentElement
  const temaAnterior = raiz.dataset.theme
  raiz.dataset.theme = 'light'
  document.body.classList.add('imprimiendo-reporte')
  const quitar = () => {
    document.body.classList.remove('imprimiendo-reporte')
    if (temaAnterior) raiz.dataset.theme = temaAnterior
    window.removeEventListener('afterprint', quitar)
  }
  window.addEventListener('afterprint', quitar)
  window.print()
}

/** Reporte de un mes (por defecto, el anterior), descargable en PDF. */
function PanelReporte({ email, transacciones, categorias, cuentas, presupuestos, metas }: PanelReporteProps) {
  const [hoy] = useState(() => new Date())
  const [mesElegido, setMesElegido] = useState(() => aInputMes(new Date(hoy.getFullYear(), hoy.getMonth() - 1, 1)))
  const { anio, mes, rango, rangoAnterior } = useMemo(() => {
    const [a, m] = mesElegido.split('-').map(Number)
    return { anio: a, mes: m, rango: rangoMes(a, m - 1), rangoAnterior: rangoMes(a, m - 2) }
  }, [mesElegido])

  useEffect(() => () => document.body.classList.remove('imprimiendo-reporte'), [])

  const datos = useMemo(() => {
    const delMes = transacciones.filter((t) => t.fecha >= rango.desde && t.fecha < rango.hasta)
    const reales = delMes.filter(esMovimientoReal)
    const comparacion = compararPeriodos(transacciones, categorias, rangoAnterior, rango)
    const gastosCat = resumenPorCategoria(reales, categorias, 'gasto')
    const mayores = reales
      .filter((t) => t.tipo === 'gasto')
      .sort((a, b) => b.monto - a.monto)
      .slice(0, 5)
    const presupuestosMes = estadoPresupuestos(presupuestos, categorias, transacciones, anio, mes - 1, rango.hasta)
    const aportes = metas
      .map((m) => ({
        meta: m,
        total: m.aportes.filter((a) => a.fecha >= rango.desde && a.fecha < rango.hasta).reduce((s, a) => s + a.monto, 0),
      }))
      .filter((x) => x.total !== 0)
    const diasConGasto = new Set(reales.filter((t) => t.tipo === 'gasto').map((t) => t.fecha.getDate())).size
    return {
      cantidad: delMes.length,
      comparacion,
      gastosCat,
      mayores,
      presupuestosMes,
      aportes,
      etiquetas: resumenPorEtiqueta(delMes).slice(0, 5),
      diasConGasto,
    }
  }, [transacciones, categorias, presupuestos, metas, anio, mes, rango, rangoAnterior])

  const t = datos.comparacion.totales
  const tasaAhorro = t.ingresosB > 0 ? t.ahorroB / t.ingresosB : null
  const categoriasPorId = new Map(categorias.map((c) => [c.id, c]))
  const cuentasPorId = new Map(cuentas.map((c) => [c.id, c.nombre]))
  const cumplidos = datos.presupuestosMes.filter((p) => p.nivel !== 'excedido')
  const excedidos = datos.presupuestosMes.filter((p) => p.nivel === 'excedido')
  const delta = (b: number, a: number, subirEsBueno: boolean) => {
    const d = b - a
    if (Math.abs(d) < 0.005 || a === 0) return null
    const bueno = subirEsBueno ? d > 0 : d < 0
    return (
      <span className={bueno ? 'texto-ingreso' : 'texto-gasto'}>
        <i className={`caret ${d > 0 ? 'up' : 'down'} icon`} />
        {formatearPorcentaje(Math.abs(d / a))} vs. {rangoAnterior.etiqueta.split(' ')[0].toLowerCase()}
      </span>
    )
  }

  return (
    <>
      <div className="barra-filtros no-imprimir">
        <div className="ui form">
          <input type="month" aria-label="Mes del reporte" value={mesElegido} max={aInputMes(hoy)} onChange={(e) => e.target.value && setMesElegido(e.target.value)} />
        </div>
        <button type="button" className="ui primary button" onClick={imprimirReporte} disabled={datos.cantidad === 0}>
          <i className="file pdf outline icon" />
          Descargar PDF
        </button>
      </div>

      <article className="reporte-imprimible ui segment">
        <header className="cabecera-reporte">
          <div>
            <span className="marca-reporte">Gestor de Gastos</span>
            <h2>Reporte de {rango.etiqueta}</h2>
          </div>
          <div className="texto-suave meta-reporte">
            {email}
            <br />
            Generado el {formatearFecha(hoy)}
          </div>
        </header>

        {datos.cantidad === 0 ? (
          <p className="texto-suave">No hay movimientos en {rango.etiqueta}.</p>
        ) : (
          <>
            <p className="frase-reporte">
              {t.ahorroB >= 0 ? (
                <>
                  En {rango.etiqueta.split(' ')[0].toLowerCase()} ahorraste <strong>{formatearMoneda(t.ahorroB)}</strong>
                  {tasaAhorro !== null && <> ({formatearPorcentaje(tasaAhorro)} de tus ingresos)</>}.
                </>
              ) : (
                <>
                  En {rango.etiqueta.split(' ')[0].toLowerCase()} gastaste <strong>{formatearMoneda(-t.ahorroB)}</strong> más de lo que
                  ingresó.
                </>
              )}{' '}
              Registraste {datos.cantidad} movimientos y gastaste en {datos.diasConGasto} días distintos.
            </p>

            <div className="kpis-reporte">
              <div>
                <span>Ingresos</span>
                <strong className="texto-ingreso">{formatearMoneda(t.ingresosB)}</strong>
                {delta(t.ingresosB, t.ingresosA, true)}
              </div>
              <div>
                <span>Gastos</span>
                <strong className="texto-gasto">{formatearMoneda(t.gastosB)}</strong>
                {delta(t.gastosB, t.gastosA, false)}
              </div>
              <div>
                <span>{t.ahorroB >= 0 ? 'Ahorro' : 'Déficit'}</span>
                <strong>{formatearMoneda(Math.abs(t.ahorroB))}</strong>
                {tasaAhorro !== null && <span className="texto-suave">{formatearPorcentaje(tasaAhorro)} de los ingresos</span>}
              </div>
            </div>

            <section className="seccion-reporte">
              <h3>¿En qué se fue el dinero?</h3>
              <GraficoDona datos={datos.gastosCat} titulo="Gastos" maxPorciones={6} />
            </section>

            <section className="seccion-reporte">
              <h3>Cambios frente a {rangoAnterior.etiqueta}</h3>
              <table className="ui very basic compact unstackable table">
                <thead>
                  <tr>
                    <th>Categoría</th>
                    <th className="right aligned">{rangoAnterior.etiqueta.split(' ')[0]}</th>
                    <th className="right aligned">{rango.etiqueta.split(' ')[0]}</th>
                    <th className="right aligned">Diferencia</th>
                  </tr>
                </thead>
                <tbody>
                  {datos.comparacion.gastos.slice(0, 8).map((f) => (
                    <tr key={f.categoriaId}>
                      <td>{f.nombre}</td>
                      <td className="right aligned">{formatearMoneda(f.a)}</td>
                      <td className="right aligned">{formatearMoneda(f.b)}</td>
                      <td className={`right aligned ${f.diferencia > 0.005 ? 'texto-gasto' : f.diferencia < -0.005 ? 'texto-ingreso' : ''}`}>
                        {f.diferencia > 0 ? '+' : f.diferencia < 0 ? '-' : ''}
                        {formatearMoneda(Math.abs(f.diferencia))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>

            {datos.presupuestosMes.length > 0 && (
              <section className="seccion-reporte">
                <h3>Presupuestos</h3>
                <p>
                  Cumpliste {cumplidos.length} de {datos.presupuestosMes.length}.
                  {excedidos.length > 0 &&
                    ` Te pasaste en ${excedidos.map((e) => `${e.categoria?.nombre ?? '—'} (+${formatearMoneda(-e.restante)})`).join(', ')}.`}
                </p>
              </section>
            )}

            <section className="seccion-reporte">
              <h3>Mayores gastos</h3>
              <table className="ui very basic compact unstackable table">
                <tbody>
                  {datos.mayores.map((g) => (
                    <tr key={g.id}>
                      <td>{formatearFecha(g.fecha)}</td>
                      <td>{g.concepto || categoriasPorId.get(g.categoriaId)?.nombre || '—'}</td>
                      <td className="texto-suave">{cuentasPorId.get(g.cuentaId) ?? ''}</td>
                      <td className="right aligned texto-gasto">{formatearMoneda(g.monto)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>

            {(datos.etiquetas.length > 0 || datos.aportes.length > 0) && (
              <section className="seccion-reporte dos-columnas">
                {datos.etiquetas.length > 0 && (
                  <div>
                    <h3>Por etiqueta</h3>
                    {datos.etiquetas.map((e) => (
                      <div key={e.etiqueta} className="fila-aporte">
                        <span>#{e.etiqueta}</span>
                        <strong>{formatearMoneda(e.gastos)}</strong>
                      </div>
                    ))}
                  </div>
                )}
                {datos.aportes.length > 0 && (
                  <div>
                    <h3>Metas de ahorro</h3>
                    {datos.aportes.map(({ meta, total }) => (
                      <div key={meta.id} className="fila-aporte">
                        <span>{meta.nombre}</span>
                        <strong className={total < 0 ? 'texto-gasto' : 'texto-ingreso'}>
                          {total < 0 ? '-' : '+'}
                          {formatearMoneda(Math.abs(total))}
                        </strong>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            )}
          </>
        )}
      </article>
    </>
  )
}

export default PanelReporte
