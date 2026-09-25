import { useState, type FormEvent } from 'react'
import { useAvisos } from '../../hooks/useAvisos'
import {
  actualizarRecurrente,
  alternarRecurrente,
  crearRecurrente,
  eliminarRecurrente,
} from '../../services/recurrenteService'
import type { Categoria, Cuenta, Frecuencia, Moneda, Recurrente, TipoTransaccion } from '../../types'
import { fechaDesdeInput, fechaParaInput, formatearDolares, formatearFecha, formatearMoneda } from '../../utils/formato'
import { leerTipoCambio } from '../../utils/preferencias'
import Modal from '../Modal'

interface PanelRecurrentesProps {
  usuarioId: string
  recurrentes: Recurrente[]
  categorias: Categoria[]
  cuentas: Cuenta[]
}

const FRECUENCIAS: { id: Frecuencia; etiqueta: string; porMes: number }[] = [
  { id: 'semanal', etiqueta: 'Semanal', porMes: 52 / 12 },
  { id: 'quincenal', etiqueta: 'Quincenal', porMes: 26 / 12 },
  { id: 'mensual', etiqueta: 'Mensual', porMes: 1 },
  { id: 'anual', etiqueta: 'Anual', porMes: 1 / 12 },
]

interface Borrador {
  id?: string
  tipo: TipoTransaccion
  concepto: string
  monto: string
  moneda: Moneda
  categoriaId: string
  cuentaId: string
  frecuencia: Frecuencia
  proximaFecha: string
}

function PanelRecurrentes({ usuarioId, recurrentes, categorias, cuentas }: PanelRecurrentesProps) {
  const { avisar } = useAvisos()
  const [borrador, setBorrador] = useState<Borrador | null>(null)
  const [eliminando, setEliminando] = useState<Recurrente | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)

  const categoriasPorId = new Map(categorias.map((c) => [c.id, c]))
  const cuentasPorId = new Map(cuentas.map((c) => [c.id, c]))
  const ordenados = [...recurrentes].sort(
    (a, b) => Number(b.activa) - Number(a.activa) || a.proximaFecha.getTime() - b.proximaFecha.getTime(),
  )

  // Equivalente mensual (en soles) de lo que entra y sale de forma fija.
  const mensual = (tipo: TipoTransaccion) =>
    recurrentes
      .filter((r) => r.activa && r.tipo === tipo)
      .reduce((s, r) => {
        const soles = r.moneda === 'USD' ? r.monto * leerTipoCambio() : r.monto
        return s + soles * FRECUENCIAS.find((f) => f.id === r.frecuencia)!.porMes
      }, 0)
  const gastoFijo = mensual('gasto')
  const ingresoFijo = mensual('ingreso')

  function abrir(r?: Recurrente) {
    setError(null)
    const categoriaPorDefecto = categorias.find((c) => c.tipo === 'gasto') ?? categorias[0]
    setBorrador(
      r
        ? {
            id: r.id,
            tipo: r.tipo,
            concepto: r.concepto,
            monto: String(r.monto),
            moneda: r.moneda ?? 'PEN',
            categoriaId: r.categoriaId,
            cuentaId: r.cuentaId,
            frecuencia: r.frecuencia,
            proximaFecha: fechaParaInput(r.proximaFecha),
          }
        : {
            tipo: 'gasto',
            concepto: '',
            monto: '',
            moneda: 'PEN',
            categoriaId: categoriaPorDefecto?.id ?? '',
            cuentaId: cuentas[0]?.id ?? '',
            frecuencia: 'mensual',
            proximaFecha: fechaParaInput(),
          },
    )
  }

  async function guardar(e: FormEvent) {
    e.preventDefault()
    if (!borrador) return
    setGuardando(true)
    setError(null)

    const datos = {
      tipo: borrador.tipo,
      concepto: borrador.concepto,
      monto: Number(borrador.monto),
      moneda: borrador.moneda === 'USD' ? ('USD' as const) : undefined,
      categoriaId: borrador.categoriaId,
      cuentaId: borrador.cuentaId,
      frecuencia: borrador.frecuencia,
      proximaFecha: fechaDesdeInput(borrador.proximaFecha, new Date(2000, 0, 1)),
      activa: borrador.id ? (recurrentes.find((r) => r.id === borrador.id)?.activa ?? true) : true,
    }

    try {
      if (borrador.id) await actualizarRecurrente(borrador.id, datos)
      else await crearRecurrente(datos, usuarioId)
      avisar(borrador.id ? 'Movimiento recurrente actualizado' : 'Movimiento recurrente creado')
      setBorrador(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar.')
    } finally {
      setGuardando(false)
    }
  }

  const categoriasDelTipo = borrador
    ? categorias.filter((c) => c.tipo === borrador.tipo || c.tipo === 'ambos')
    : []

  return (
    <>
      <div className="rejilla-kpi dos">
        <div className="kpi ui segment">
          <span className="etiqueta"><i className="arrow up icon" />Gastos fijos al mes</span>
          <strong className="texto-gasto">{formatearMoneda(gastoFijo)}</strong>
          <span className="nota">Suscripciones, alquiler, servicios…</span>
        </div>
        <div className="kpi ui segment">
          <span className="etiqueta"><i className="arrow down icon" />Ingresos fijos al mes</span>
          <strong className="texto-ingreso">{formatearMoneda(ingresoFijo)}</strong>
          <span className="nota">
            {ingresoFijo > 0 ? `Te quedan ${formatearMoneda(ingresoFijo - gastoFijo)} libres` : 'Sueldo, pensiones…'}
          </span>
        </div>
      </div>

      <div className="barra-filtros">
        <p className="texto-suave sin-margen">
          <i className="info circle icon" />
          Se registran solos en la fecha indicada (al abrir la app).
        </p>
        <button type="button" className="ui primary button" onClick={() => abrir()}>
          <i className="plus icon" />
          Nuevo recurrente
        </button>
      </div>

      {recurrentes.length === 0 ? (
        <div className="ui segment estado-vacio">
          <i className="redo alternate icon" />
          <p>
            <strong>Automatiza lo que se repite.</strong>
            <br />
            Tu sueldo, el alquiler o Netflix: créalos una vez y se registrarán solos.
          </p>
        </div>
      ) : (
        <div className="ui segment">
          <div className="lista-transacciones ui divided list">
            {ordenados.map((r) => {
              const categoria = categoriasPorId.get(r.categoriaId)
              return (
                <div key={r.id} className={`item ${r.activa ? '' : 'pausado'}`}>
                  <span className="icono-circulo" style={{ background: categoria?.color ?? '#898781' }}>
                    <i className={`${categoria?.icono ?? 'tag'} icon`} />
                  </span>
                  <div className="detalle">
                    <div className="header">{r.concepto}</div>
                    <div className="description">
                      {FRECUENCIAS.find((f) => f.id === r.frecuencia)?.etiqueta}
                      {' · '}
                      {r.activa ? `Próximo: ${formatearFecha(r.proximaFecha)}` : 'En pausa'}
                      {cuentasPorId.get(r.cuentaId) ? ` · ${cuentasPorId.get(r.cuentaId)!.nombre}` : ''}
                    </div>
                  </div>
                  <div className="monto">
                    <strong className={r.tipo === 'ingreso' ? 'texto-ingreso' : 'texto-gasto'}>
                      {r.tipo === 'ingreso' ? '+' : '-'}
                      {r.moneda === 'USD' ? formatearDolares(r.monto) : formatearMoneda(r.monto)}
                    </strong>
                    <div className="ui mini basic icon buttons">
                      <button
                        type="button"
                        className="ui button"
                        title={r.activa ? 'Pausar' : 'Reanudar'}
                        aria-label={r.activa ? 'Pausar' : 'Reanudar'}
                        onClick={() => {
                          void alternarRecurrente(r)
                          avisar(r.activa ? 'En pausa' : 'Reanudado', 'info')
                        }}
                      >
                        <i className={`${r.activa ? 'pause' : 'play'} icon`} />
                      </button>
                      <button type="button" className="ui button" aria-label="Editar" onClick={() => abrir(r)}>
                        <i className="pencil alternate icon" />
                      </button>
                      <button type="button" className="ui button" aria-label="Eliminar" onClick={() => setEliminando(r)}>
                        <i className="trash alternate outline icon" />
                      </button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      <Modal
        abierto={borrador !== null}
        titulo={borrador?.id ? 'Editar recurrente' : 'Nuevo movimiento recurrente'}
        icono="redo alternate"
        onCerrar={() => setBorrador(null)}
      >
        {borrador && (
          <form className={`ui form ${error ? 'error' : ''}`} onSubmit={guardar}>
            <div className="ui fluid two buttons field">
              {(['gasto', 'ingreso'] as TipoTransaccion[]).map((t) => (
                <button
                  key={t}
                  type="button"
                  aria-pressed={borrador.tipo === t}
                  className={`ui button ${borrador.tipo === t ? (t === 'gasto' ? 'red' : 'green') : 'basic'}`}
                  onClick={() => {
                    const categoria = categorias.find((c) => c.tipo === t) ?? categorias[0]
                    setBorrador({ ...borrador, tipo: t, categoriaId: categoria?.id ?? '' })
                  }}
                >
                  <i className={`arrow ${t === 'gasto' ? 'up' : 'down'} icon`} />
                  {t === 'gasto' ? 'Gasto' : 'Ingreso'}
                </button>
              ))}
            </div>
            <div className="two fields">
              <div className="field required">
                <label htmlFor="rec-concepto">Nombre</label>
                <input
                  id="rec-concepto"
                  value={borrador.concepto}
                  maxLength={80}
                  placeholder={borrador.tipo === 'gasto' ? 'Ej. Netflix, Alquiler' : 'Ej. Sueldo'}
                  onChange={(e) => setBorrador({ ...borrador, concepto: e.target.value })}
                  autoFocus
                  required
                />
              </div>
              <div className="field required">
                <label htmlFor="rec-monto">Monto</label>
                <div className="ui action input">
                  <input
                    id="rec-monto"
                    type="number"
                    inputMode="decimal"
                    min="0"
                    step="0.01"
                    value={borrador.monto}
                    onChange={(e) => setBorrador({ ...borrador, monto: e.target.value })}
                    required
                  />
                  <div className="ui buttons">
                    {(['PEN', 'USD'] as Moneda[]).map((m) => (
                      <button
                        key={m}
                        type="button"
                        className={`ui button ${borrador.moneda === m ? 'primary' : 'basic'}`}
                        onClick={() => setBorrador({ ...borrador, moneda: m })}
                      >
                        {m === 'PEN' ? 'S/' : 'US$'}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
            <div className="two fields">
              <div className="field required">
                <label htmlFor="rec-categoria">Categoría</label>
                <select
                  id="rec-categoria"
                  className="ui dropdown"
                  value={borrador.categoriaId}
                  onChange={(e) => setBorrador({ ...borrador, categoriaId: e.target.value })}
                >
                  {categoriasDelTipo.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nombre}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field required">
                <label htmlFor="rec-cuenta">Cuenta</label>
                <select
                  id="rec-cuenta"
                  className="ui dropdown"
                  value={borrador.cuentaId}
                  onChange={(e) => setBorrador({ ...borrador, cuentaId: e.target.value })}
                >
                  {cuentas.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nombre}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="field">
              <label>Frecuencia</label>
              <div className="ui fluid four buttons selector-frecuencia">
                {FRECUENCIAS.map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    aria-pressed={borrador.frecuencia === f.id}
                    className={`ui button ${borrador.frecuencia === f.id ? 'primary' : 'basic'}`}
                    onClick={() => setBorrador({ ...borrador, frecuencia: f.id })}
                  >
                    {f.etiqueta}
                  </button>
                ))}
              </div>
            </div>
            <div className="field required">
              <label htmlFor="rec-fecha">{borrador.id ? 'Próxima fecha' : 'Primera fecha'}</label>
              <input
                id="rec-fecha"
                type="date"
                value={borrador.proximaFecha}
                onChange={(e) => setBorrador({ ...borrador, proximaFecha: e.target.value })}
                required
              />
              <small className="texto-suave">
                Si es hoy o una fecha pasada, se registrará en cuanto guardes.
              </small>
            </div>
            {error && (
              <div className="ui error message">
                <p>{error}</p>
              </div>
            )}
            <div className="acciones-formulario">
              <button type="button" className="ui basic button" onClick={() => setBorrador(null)}>
                Cancelar
              </button>
              <button type="submit" className={`ui primary button ${guardando ? 'loading' : ''}`} disabled={guardando}>
                <i className="save icon" />
                Guardar
              </button>
            </div>
          </form>
        )}
      </Modal>

      <Modal
        abierto={eliminando !== null}
        titulo={`¿Eliminar "${eliminando?.concepto ?? ''}"?`}
        icono="trash alternate outline"
        tamano="tiny"
        onCerrar={() => setEliminando(null)}
      >
        <p>Dejará de registrarse. Los movimientos que ya generó se conservan.</p>
        <div className="acciones-formulario">
          <button type="button" className="ui basic button" onClick={() => setEliminando(null)}>
            Cancelar
          </button>
          <button
            type="button"
            className="ui red button"
            onClick={() => {
              if (eliminando) void eliminarRecurrente(eliminando)
              avisar('Recurrente eliminado', 'info')
              setEliminando(null)
            }}
          >
            <i className="trash icon" />
            Eliminar
          </button>
        </div>
      </Modal>
    </>
  )
}

export default PanelRecurrentes
