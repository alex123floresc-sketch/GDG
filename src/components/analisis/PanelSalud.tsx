import { useMemo, useState } from 'react'
import { useAvisos } from '../../hooks/useAvisos'
import {
  cambiarClaseCategoria,
  FONDO_MESES_POR_DEFECTO,
  guardarAjustes,
  REPARTO_POR_DEFECTO,
} from '../../services/ajustesService'
import type { Ajustes, Categoria, Chanchito, ClaseGasto, CompraCuotas, Cuenta, Deuda, Meta, OrigenFondo, Presupuesto, Recurrente, Transaccion } from '../../types'
import { ordenJerarquico } from '../../utils/categorias'
import { formatearFecha, formatearMoneda, formatearPorcentaje } from '../../utils/formato'
import {
  calcularReparto,
  claseDeCategoria,
  esLiquida,
  estadoFondo,
  mesesCompletos,
  proyectarSaldo,
  puntajeSalud,
  NIVELES_SALUD,
} from '../../utils/salud'
import BarraProgreso from '../BarraProgreso'
import GraficoLinea from '../graficos/GraficoLinea'

interface PanelSaludProps {
  usuarioId: string
  ajustes: Ajustes
  transacciones: Transaccion[]
  categorias: Categoria[]
  cuentas: Cuenta[]
  presupuestos: Presupuesto[]
  metas: Meta[]
  chanchitos: Chanchito[]
  deudas: Deuda[]
  recurrentes: Recurrente[]
  cuotas: CompraCuotas[]
}

type PeriodoReparto = 'actual' | 'pasado' | 'tres'

const PERIODOS: { id: PeriodoReparto; etiqueta: string }[] = [
  { id: 'actual', etiqueta: 'Este mes' },
  { id: 'pasado', etiqueta: 'Mes pasado' },
  { id: 'tres', etiqueta: 'Últimos 3 meses' },
]

/** Colores de los tres tramos (paleta categórica de la app, en su orden). */
const COLOR_TRAMO = { necesidades: '#2a78d6', deseos: '#eb6834', ahorro: '#1baf7a' }

const DIA = 86_400_000

function PanelSalud(props: PanelSaludProps) {
  const { usuarioId, ajustes, transacciones, categorias, cuentas, metas, chanchitos } = props
  const { avisar } = useAvisos()
  const [hoy] = useState(() => new Date())
  const [periodo, setPeriodo] = useState<PeriodoReparto>('pasado')
  const [dias, setDias] = useState(60)
  const [conVariables, setConVariables] = useState(true)
  const [editandoReparto, setEditandoReparto] = useState(false)

  const reparto = ajustes.reparto ?? REPARTO_POR_DEFECTO
  const [borradorReparto, setBorradorReparto] = useState(reparto)

  const puntaje = useMemo(
    () => puntajeSalud({ ...props, hoy }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ajustes, transacciones, categorias, cuentas, metas, chanchitos, props.presupuestos, props.deudas, hoy],
  )

  const rango = useMemo((): [Date, Date] => {
    if (periodo === 'actual') return [new Date(hoy.getFullYear(), hoy.getMonth(), 1), new Date(hoy.getFullYear(), hoy.getMonth() + 1, 1)]
    if (periodo === 'pasado') return mesesCompletos(1, hoy)[0]
    const tres = mesesCompletos(3, hoy)
    return [tres[0][0], tres[2][1]]
  }, [periodo, hoy])
  const real = useMemo(() => calcularReparto(transacciones, categorias, rango[0], rango[1]), [transacciones, categorias, rango])

  const fondo = useMemo(
    () => estadoFondo({ ajustes, cuentas, transacciones, categorias, metas, chanchitos, hoy }),
    [ajustes, cuentas, transacciones, categorias, metas, chanchitos, hoy],
  )

  const proyeccion = useMemo(
    () =>
      proyectarSaldo({
        cuentas,
        transacciones,
        recurrentes: props.recurrentes,
        deudas: props.deudas,
        cuotas: props.cuotas,
        dias,
        conVariables,
        hoy,
      }),
    [cuentas, transacciones, props.recurrentes, props.deudas, props.cuotas, dias, conVariables, hoy],
  )

  const porId = useMemo(() => new Map(categorias.map((c) => [c.id, c])), [categorias])
  const categoriasGasto = ordenJerarquico(categorias.filter((c) => c.tipo !== 'ingreso'))

  const tramos = [
    { id: 'necesidades' as const, nombre: 'Necesidades', monto: real.necesidades, meta: reparto.necesidades },
    { id: 'deseos' as const, nombre: 'Deseos', monto: real.deseos, meta: reparto.deseos },
    { id: 'ahorro' as const, nombre: 'Ahorro', monto: Math.max(0, real.ahorro), meta: reparto.ahorro },
  ]
  const base = real.ingresos > 0 ? real.ingresos : real.gastos

  const puntosGrafico = proyeccion.puntos.map((p) => ({
    etiqueta: p.fecha.toLocaleDateString('es-PE', { day: 'numeric', month: 'short' }),
    etiquetaLarga: formatearFecha(p.fecha),
    valor: p.saldo,
  }))

  const valorOrigen = ajustes.fondoOrigen && ajustes.fondoOrigen !== 'liquido' ? `${ajustes.fondoOrigen}:${ajustes.fondoId ?? ''}` : 'liquido'

  async function cambiarOrigen(valor: string) {
    const [origen, id] = valor.split(':') as [OrigenFondo, string | undefined]
    await guardarAjustes(usuarioId, { fondoOrigen: origen, fondoId: origen === 'liquido' ? undefined : id })
  }

  async function guardarReparto() {
    const suma = borradorReparto.necesidades + borradorReparto.deseos + borradorReparto.ahorro
    if (Math.round(suma) !== 100) {
      avisar(`Los tres porcentajes deben sumar 100 (ahora suman ${suma}).`, 'error')
      return
    }
    await guardarAjustes(usuarioId, { reparto: borradorReparto })
    setEditandoReparto(false)
    avisar('Reparto guardado')
  }

  async function elegirClase(c: Categoria, clase: ClaseGasto) {
    await cambiarClaseCategoria(c, c.clase === clase ? undefined : clase)
  }

  const nivel = puntaje ? NIVELES_SALUD[puntaje.nivel] : null

  return (
    <>
      {/* ---------- Puntaje ---------- */}
      <section className="ui segment">
        <h3 className="ui header">
          <i className="heartbeat icon" />
          <div className="content">
            Tu salud financiera
            <div className="sub header">Un puntaje de 0 a 100 con tus últimos 3 meses completos</div>
          </div>
        </h3>
        {!puntaje || !nivel ? (
          <p className="texto-suave">Registra tus ingresos y gastos de al menos un mes completo para ver tu puntaje.</p>
        ) : (
          <div className="bloque-puntaje">
            <div className={`puntaje-grande ${nivel.clase}`}>
              <strong>{puntaje.total}</strong>
              <span>/100</span>
              <div className="etiqueta-nivel">
                <i className={`${nivel.icono} icon`} />
                {nivel.etiqueta}
              </div>
            </div>
            <div className="componentes-puntaje">
              {puntaje.componentes.map((c) => (
                <div key={c.id} className="componente-puntaje">
                  <div className="linea">
                    <span>
                      <i className={`${c.icono} icon`} />
                      {c.nombre}
                    </span>
                    <span className="texto-suave">
                      {c.puntos.toLocaleString('es-PE')} / {c.maximo}
                    </span>
                  </div>
                  <BarraProgreso valor={c.puntos / c.maximo} color="var(--color-marca)" etiqueta={`${c.nombre}: ${c.puntos} de ${c.maximo}`} grosor={6} />
                  <small className="texto-suave">{c.detalle}</small>
                  {c.consejo && (
                    <small className="consejo">
                      <i className="lightbulb outline icon" />
                      {c.consejo}
                    </small>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* ---------- 50/30/20 ---------- */}
      <section className="ui segment">
        <div className="titulo-bloque">
          <h3 className="ui header">
            <i className="chart pie icon" />
            <div className="content">
              Regla {reparto.necesidades}/{reparto.deseos}/{reparto.ahorro}
              <div className="sub header">Necesidades, deseos y ahorro sobre tus ingresos</div>
            </div>
          </h3>
          <select
            className="ui compact dropdown"
            aria-label="Periodo"
            value={periodo}
            onChange={(e) => setPeriodo(e.target.value as PeriodoReparto)}
          >
            {PERIODOS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.etiqueta}
              </option>
            ))}
          </select>
        </div>

        {base <= 0 ? (
          <p className="texto-suave">No hay movimientos en este periodo.</p>
        ) : (
          <>
            <div className="barra-reparto" role="img" aria-label="Reparto de tus ingresos">
              {tramos.map((t) =>
                t.monto > 0 ? (
                  <span
                    key={t.id}
                    style={{ width: `${Math.min(100, (t.monto / Math.max(base, real.gastos)) * 100)}%`, background: COLOR_TRAMO[t.id] }}
                    title={`${t.nombre}: ${formatearMoneda(t.monto)}`}
                  />
                ) : null,
              )}
            </div>
            <div className="grafico-leyenda">
              {tramos.map((t) => (
                <span key={t.id} className="item">
                  <span className="muestra caja" style={{ background: COLOR_TRAMO[t.id] }} />
                  {t.nombre}
                </span>
              ))}
            </div>
            <table className="ui very basic unstackable compact table tabla-reparto">
              <thead>
                <tr>
                  <th />
                  <th className="right aligned">Real</th>
                  <th className="right aligned">% de ingresos</th>
                  <th className="right aligned">Meta</th>
                </tr>
              </thead>
              <tbody>
                {tramos.map((t) => {
                  const pct = real.ingresos > 0 ? t.monto / real.ingresos : null
                  const fuera = pct !== null && (t.id === 'ahorro' ? pct < t.meta / 100 : pct > t.meta / 100)
                  return (
                    <tr key={t.id}>
                      <td>
                        <span className="muestra caja" style={{ background: COLOR_TRAMO[t.id] }} />
                        {t.nombre}
                      </td>
                      <td className="right aligned">{formatearMoneda(t.monto)}</td>
                      <td className={`right aligned ${fuera ? 'texto-alerta' : ''}`}>
                        {pct === null ? '—' : formatearPorcentaje(pct)}
                        {fuera && <i className="exclamation triangle icon" aria-label="Fuera de la meta" />}
                      </td>
                      <td className="right aligned texto-suave">
                        {t.id === 'ahorro' ? '≥' : '≤'} {t.meta} %
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            {real.ahorro < 0 && (
              <p className="texto-gasto">
                <i className="exclamation circle icon" />
                Gastaste {formatearMoneda(-real.ahorro)} más de lo que ingresó en este periodo.
              </p>
            )}
          </>
        )}

        {editandoReparto ? (
          <div className="ui form editar-reparto">
            <div className="three fields">
              {(['necesidades', 'deseos', 'ahorro'] as const).map((k) => (
                <div key={k} className="field">
                  <label htmlFor={`rep-${k}`}>{k.charAt(0).toUpperCase() + k.slice(1)} (%)</label>
                  <input
                    id={`rep-${k}`}
                    type="number"
                    min="0"
                    max="100"
                    value={borradorReparto[k]}
                    onChange={(e) => setBorradorReparto({ ...borradorReparto, [k]: Number(e.target.value) })}
                  />
                </div>
              ))}
            </div>
            <div className="acciones-formulario">
              <button type="button" className="ui basic button" onClick={() => setEditandoReparto(false)}>
                Cancelar
              </button>
              <button type="button" className="ui primary button" onClick={guardarReparto}>
                Guardar
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            className="enlace-sugerencia"
            onClick={() => {
              setBorradorReparto(reparto)
              setEditandoReparto(true)
            }}
          >
            <i className="sliders horizontal icon" />
            Cambiar porcentajes
          </button>
        )}

        <details className="clasificar-categorias" open={real.hayEstimadas}>
          <summary>
            <i className="tags icon" />
            ¿Qué es necesidad y qué es deseo?
            {real.hayEstimadas && <span className="texto-suave"> — algunas están estimadas, revísalas</span>}
          </summary>
          <div className="lista-clases">
            {categoriasGasto.map(([c, sub]) => {
              const { clase, estimada } = claseDeCategoria(c, porId)
              return (
                <div key={c.id} className={`fila-clase ${sub ? 'sub' : ''}`}>
                  <span className="nombre">
                    <i className={`${c.icono ?? 'tag'} icon`} style={{ color: c.color }} />
                    {c.nombre}
                    {estimada && <small className="texto-suave"> (estimado)</small>}
                  </span>
                  <div className="ui mini buttons">
                    {(['necesidad', 'deseo'] as ClaseGasto[]).map((k) => (
                      <button
                        key={k}
                        type="button"
                        aria-pressed={clase === k}
                        className={`ui button ${clase === k ? (estimada ? 'basic primary' : 'primary') : 'basic'}`}
                        onClick={() => void elegirClase(c, k)}
                      >
                        {k === 'necesidad' ? 'Necesidad' : 'Deseo'}
                      </button>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        </details>
      </section>

      {/* ---------- Fondo de emergencia ---------- */}
      <section className="ui segment">
        <h3 className="ui header">
          <i className="life ring icon" />
          <div className="content">
            Fondo de emergencia
            <div className="sub header">Para imprevistos: pérdida de trabajo, salud, reparaciones</div>
          </div>
        </h3>
        <div className="rejilla-kpi tres">
          <div className="kpi plano">
            <span className="etiqueta">Tienes</span>
            <strong>{formatearMoneda(fondo.disponible)}</strong>
            <span className="nota">{fondo.origen}</span>
          </div>
          <div className="kpi plano">
            <span className="etiqueta">Cubre</span>
            <strong>{fondo.mesesCubiertos === null ? '—' : `${fondo.mesesCubiertos.toFixed(1)} meses`}</strong>
            <span className="nota">
              {fondo.gastoMensual > 0
                ? `De ${fondo.baseGasto === 'necesidades' ? 'necesidades' : 'gastos'}: ${formatearMoneda(fondo.gastoMensual)} al mes`
                : 'Aún sin historial de gastos'}
            </span>
          </div>
          <div className="kpi plano">
            <span className="etiqueta">Meta</span>
            <strong>{formatearMoneda(fondo.objetivo)}</strong>
            <span className="nota">
              {fondo.objetivo > fondo.disponible
                ? `Te faltan ${formatearMoneda(fondo.objetivo - Math.max(0, fondo.disponible))}`
                : '¡Meta cumplida!'}
            </span>
          </div>
        </div>
        <BarraProgreso
          valor={fondo.porcentaje}
          color={fondo.porcentaje >= 1 ? 'var(--color-ingreso)' : 'var(--color-marca)'}
          etiqueta={`Fondo de emergencia: ${formatearPorcentaje(fondo.porcentaje)}`}
        />
        <div className="ui form fila-ajustes-fondo">
          <div className="field">
            <label htmlFor="fondo-meses">Meses a cubrir</label>
            <select
              id="fondo-meses"
              className="ui dropdown"
              value={ajustes.fondoMeses ?? FONDO_MESES_POR_DEFECTO}
              onChange={(e) => void guardarAjustes(usuarioId, { fondoMeses: Number(e.target.value) })}
            >
              {[3, 4, 6, 9, 12].map((m) => (
                <option key={m} value={m}>
                  {m} meses
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="fondo-origen">¿Dónde está tu fondo?</label>
            <select id="fondo-origen" className="ui dropdown" value={valorOrigen} onChange={(e) => void cambiarOrigen(e.target.value)}>
              <option value="liquido">Todo mi dinero disponible</option>
              <optgroup label="Una cuenta">
                {cuentas.filter(esLiquida).map((c) => (
                  <option key={c.id} value={`cuenta:${c.id}`}>
                    {c.nombre}
                  </option>
                ))}
              </optgroup>
              {metas.length > 0 && (
                <optgroup label="Una meta">
                  {metas.map((m) => (
                    <option key={m.id} value={`meta:${m.id}`}>
                      {m.nombre}
                    </option>
                  ))}
                </optgroup>
              )}
              {chanchitos.some((c) => !c.archivado) && (
                <optgroup label="Un chanchito">
                  {chanchitos
                    .filter((c) => !c.archivado)
                    .map((c) => (
                      <option key={c.id} value={`chanchito:${c.id}`}>
                        {c.nombre}
                      </option>
                    ))}
                </optgroup>
              )}
            </select>
          </div>
        </div>
      </section>

      {/* ---------- Proyección ---------- */}
      <section className="ui segment">
        <div className="titulo-bloque">
          <h3 className="ui header">
            <i className="chart area icon" />
            <div className="content">
              Proyección de tu saldo
              <div className="sub header">Efectivo, bancos y billeteras en los próximos días</div>
            </div>
          </h3>
          <div className="ui mini buttons">
            {[30, 60, 90].map((d) => (
              <button
                key={d}
                type="button"
                aria-pressed={dias === d}
                className={`ui button ${dias === d ? 'primary' : 'basic'}`}
                onClick={() => setDias(d)}
              >
                {d} días
              </button>
            ))}
          </div>
        </div>
        <div className="rejilla-kpi tres">
          <div className="kpi plano">
            <span className="etiqueta">Hoy</span>
            <strong>{formatearMoneda(proyeccion.puntos[0].saldo)}</strong>
          </div>
          <div className="kpi plano">
            <span className="etiqueta">Punto más bajo</span>
            <strong className={proyeccion.minimo.saldo < 0 ? 'texto-gasto' : ''}>{formatearMoneda(proyeccion.minimo.saldo)}</strong>
            <span className="nota">{formatearFecha(proyeccion.minimo.fecha)}</span>
          </div>
          <div className="kpi plano">
            <span className="etiqueta">En {dias} días</span>
            <strong className={proyeccion.final < 0 ? 'texto-gasto' : ''}>{formatearMoneda(proyeccion.final)}</strong>
          </div>
        </div>
        {proyeccion.minimo.saldo < 0 && (
          <div className="ui warning message">
            <i className="exclamation triangle icon" />
            Al ritmo actual te quedarías sin dinero disponible alrededor del{' '}
            {formatearFecha(proyeccion.puntos.find((p) => p.saldo < 0)!.fecha)}.
          </div>
        )}
        <GraficoLinea puntos={puntosGrafico} serie="Saldo proyectado" alto={220} />
        <label className="casilla-simple">
          <input type="checkbox" checked={conVariables} onChange={(e) => setConVariables(e.target.checked)} />
          Incluir tu gasto e ingreso variable promedio ({formatearMoneda(proyeccion.variableDiario)} por día)
        </label>
        {proyeccion.eventos.length > 0 && (
          <table className="ui very basic unstackable compact table">
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Qué</th>
                <th className="right aligned">Monto</th>
              </tr>
            </thead>
            <tbody>
              {proyeccion.eventos.slice(0, 12).map((e, i) => (
                <tr key={i}>
                  <td className="single line">
                    {formatearFecha(e.fecha)}
                    <small className="texto-suave"> · en {Math.max(0, Math.round((e.fecha.getTime() - hoy.getTime()) / DIA))} d</small>
                  </td>
                  <td>{e.concepto}</td>
                  <td className={`right aligned single line ${e.monto >= 0 ? 'texto-ingreso' : 'texto-gasto'}`}>
                    {e.monto >= 0 ? '+' : '−'}
                    {formatearMoneda(Math.abs(e.monto))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </>
  )
}

export default PanelSalud
