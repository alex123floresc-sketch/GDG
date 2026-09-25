import { useMemo, useState, type FormEvent } from 'react'
import { useAvisos } from '../../hooks/useAvisos'
import { eliminarPresupuesto, guardarPresupuesto } from '../../services/presupuestoService'
import type { Categoria, Presupuesto, Transaccion } from '../../types'
import { esMovimientoReal } from '../../utils/analisis'
import { formatearMoneda, formatearPorcentaje } from '../../utils/formato'
import { estadoPresupuestos, type NivelPresupuesto } from '../../utils/planificacion'
import BarraProgreso from '../BarraProgreso'
import Modal from '../Modal'

interface PanelPresupuestosProps {
  usuarioId: string
  presupuestos: Presupuesto[]
  categorias: Categoria[]
  transacciones: Transaccion[]
}

const COLOR_NIVEL: Record<NivelPresupuesto, string> = {
  ok: 'var(--color-marca)',
  alerta: 'var(--color-alerta)',
  excedido: 'var(--color-gasto)',
}

const formateadorMes = new Intl.DateTimeFormat('es-PE', { month: 'long', year: 'numeric' })

function PanelPresupuestos({ usuarioId, presupuestos, categorias, transacciones }: PanelPresupuestosProps) {
  const { avisar } = useAvisos()
  const [mesVisto, setMesVisto] = useState(() => {
    const hoy = new Date()
    return { anio: hoy.getFullYear(), mes: hoy.getMonth() }
  })
  const [editando, setEditando] = useState<{ categoriaId: string; monto: string } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)

  const estados = useMemo(
    () => estadoPresupuestos(presupuestos, categorias, transacciones, mesVisto.anio, mesVisto.mes),
    [presupuestos, categorias, transacciones, mesVisto],
  )

  const totalLimite = estados.reduce((s, e) => s + e.presupuesto.montoLimite, 0)
  const totalGastado = estados.reduce((s, e) => s + e.gastado, 0)

  // Promedio mensual de gasto por categoría en los 3 meses anteriores: se
  // sugiere como límite al crear un presupuesto.
  const promedios = useMemo(() => {
    const desde = new Date(mesVisto.anio, mesVisto.mes - 3, 1)
    const hasta = new Date(mesVisto.anio, mesVisto.mes, 1)
    const suma = new Map<string, number>()
    for (const t of transacciones) {
      if (t.tipo !== 'gasto' || !esMovimientoReal(t) || t.fecha < desde || t.fecha >= hasta) continue
      suma.set(t.categoriaId, (suma.get(t.categoriaId) ?? 0) + t.monto)
    }
    return new Map([...suma].map(([id, total]) => [id, total / 3]))
  }, [transacciones, mesVisto])

  const conPresupuesto = new Set(presupuestos.map((p) => p.categoriaId))
  const categoriasGasto = categorias.filter((c) => c.tipo !== 'ingreso')
  const sinPresupuesto = categoriasGasto
    .filter((c) => !conPresupuesto.has(c.id))
    .sort((a, b) => (promedios.get(b.id) ?? 0) - (promedios.get(a.id) ?? 0))

  function moverMes(delta: number) {
    setMesVisto(({ anio, mes }) => {
      const d = new Date(anio, mes + delta, 1)
      return { anio: d.getFullYear(), mes: d.getMonth() }
    })
  }

  function abrir(categoriaId?: string) {
    setError(null)
    const id = categoriaId ?? sinPresupuesto[0]?.id ?? ''
    const actual = presupuestos.find((p) => p.categoriaId === id)
    const sugerido = promedios.get(id)
    setEditando({
      categoriaId: id,
      monto: actual ? String(actual.montoLimite) : sugerido ? String(Math.ceil(sugerido / 10) * 10) : '',
    })
  }

  async function guardar(e: FormEvent) {
    e.preventDefault()
    if (!editando) return
    setGuardando(true)
    setError(null)
    try {
      await guardarPresupuesto(usuarioId, editando.categoriaId, Number(editando.monto))
      avisar('Presupuesto guardado')
      setEditando(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar.')
    } finally {
      setGuardando(false)
    }
  }

  const presupuestoEditado = editando ? presupuestos.find((p) => p.categoriaId === editando.categoriaId) : undefined
  const nombreMes = formateadorMes.format(new Date(mesVisto.anio, mesVisto.mes, 1))

  return (
    <>
      <div className="barra-filtros">
        <div className="navegador-mes">
          <button type="button" className="ui basic icon button" aria-label="Mes anterior" onClick={() => moverMes(-1)}>
            <i className="chevron left icon" />
          </button>
          <strong>{nombreMes.charAt(0).toUpperCase() + nombreMes.slice(1)}</strong>
          <button type="button" className="ui basic icon button" aria-label="Mes siguiente" onClick={() => moverMes(1)}>
            <i className="chevron right icon" />
          </button>
        </div>
        <button type="button" className="ui primary button" onClick={() => abrir()} disabled={sinPresupuesto.length === 0}>
          <i className="plus icon" />
          Nuevo presupuesto
        </button>
      </div>

      {estados.length === 0 ? (
        <div className="ui segment estado-vacio">
          <i className="chart pie icon" />
          <p>
            <strong>Aún no tienes presupuestos.</strong>
            <br />
            Ponle un límite mensual a tus categorías de gasto y te avisaremos cuando te acerques.
          </p>
          {sinPresupuesto.length > 0 && (
            <div className="sugerencias">
              {sinPresupuesto.slice(0, 4).map((c) => (
                <button key={c.id} type="button" className="ui basic small button" onClick={() => abrir(c.id)}>
                  <i className={`${c.icono ?? 'tag'} icon`} />
                  {c.nombre}
                </button>
              ))}
            </div>
          )}
        </div>
      ) : (
        <>
          <div className="ui segment resumen-presupuestos">
            <div className="fila">
              <span>Gastado en categorías con presupuesto</span>
              <strong>
                {formatearMoneda(totalGastado)} <span className="texto-suave">de {formatearMoneda(totalLimite)}</span>
              </strong>
            </div>
            <BarraProgreso
              valor={totalLimite ? totalGastado / totalLimite : 0}
              color={COLOR_NIVEL[totalGastado > totalLimite ? 'excedido' : totalGastado > totalLimite * 0.8 ? 'alerta' : 'ok']}
              etiqueta="Total del presupuesto usado"
              grosor={10}
            />
          </div>

          <div className="lista-planes">
            {estados.map((e) => {
              const pasa = e.proyeccion !== undefined && e.proyeccion > e.presupuesto.montoLimite && e.nivel !== 'excedido'
              return (
                <div key={e.presupuesto.id} className={`ui segment tarjeta-plan nivel-${e.nivel}`}>
                  <div className="cabecera">
                    <span className="icono-circulo" style={{ background: e.categoria?.color ?? '#898781' }}>
                      <i className={`${e.categoria?.icono ?? 'tag'} icon`} />
                    </span>
                    <div className="titulo">
                      <strong>{e.categoria?.nombre ?? 'Categoría eliminada'}</strong>
                      <span>
                        {formatearMoneda(e.gastado)} de {formatearMoneda(e.presupuesto.montoLimite)}
                      </span>
                    </div>
                    <span className={`porcentaje nivel-${e.nivel}`}>{formatearPorcentaje(e.porcentaje)}</span>
                    <div className="ui mini basic icon buttons">
                      <button type="button" className="ui button" aria-label="Editar" onClick={() => abrir(e.presupuesto.categoriaId)}>
                        <i className="pencil alternate icon" />
                      </button>
                      <button
                        type="button"
                        className="ui button"
                        aria-label="Eliminar"
                        onClick={() => {
                          void eliminarPresupuesto(e.presupuesto)
                          avisar('Presupuesto eliminado', 'info')
                        }}
                      >
                        <i className="trash alternate outline icon" />
                      </button>
                    </div>
                  </div>
                  <BarraProgreso valor={e.porcentaje} color={COLOR_NIVEL[e.nivel]} etiqueta={`${e.categoria?.nombre}: ${formatearPorcentaje(e.porcentaje)}`} />
                  <div className="pie">
                    {e.nivel === 'excedido' ? (
                      <span className="texto-gasto">
                        <i className="exclamation circle icon" />
                        Te pasaste por {formatearMoneda(-e.restante)}
                      </span>
                    ) : (
                      <span className={e.nivel === 'alerta' ? 'texto-alerta' : ''}>
                        {e.nivel === 'alerta' && <i className="exclamation triangle icon" />}
                        Te quedan {formatearMoneda(e.restante)}
                      </span>
                    )}
                    {e.proyeccion !== undefined && (
                      <span className={pasa ? 'texto-alerta' : 'texto-suave'}>
                        Al ritmo actual: {formatearMoneda(e.proyeccion)}
                      </span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </>
      )}

      <Modal
        abierto={editando !== null}
        titulo={presupuestoEditado ? 'Editar presupuesto' : 'Nuevo presupuesto'}
        icono="chart pie"
        tamano="tiny"
        onCerrar={() => setEditando(null)}
      >
        {editando && (
          <form className={`ui form ${error ? 'error' : ''}`} onSubmit={guardar}>
            <div className="field">
              <label htmlFor="pre-categoria">Categoría</label>
              <select
                id="pre-categoria"
                className="ui dropdown"
                value={editando.categoriaId}
                disabled={Boolean(presupuestoEditado)}
                onChange={(ev) => {
                  const sugerido = promedios.get(ev.target.value)
                  setEditando({
                    categoriaId: ev.target.value,
                    monto: sugerido ? String(Math.ceil(sugerido / 10) * 10) : editando.monto,
                  })
                }}
              >
                {(presupuestoEditado ? categoriasGasto : sinPresupuesto).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nombre}
                  </option>
                ))}
              </select>
            </div>
            <div className="field required">
              <label htmlFor="pre-monto">Límite mensual</label>
              <div className="ui left labeled input">
                <span className="ui basic label">S/</span>
                <input
                  id="pre-monto"
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="0.01"
                  value={editando.monto}
                  onChange={(ev) => setEditando({ ...editando, monto: ev.target.value })}
                  autoFocus
                  required
                />
              </div>
              {promedios.get(editando.categoriaId) !== undefined && (
                <small className="texto-suave">
                  Promedio de los últimos 3 meses: {formatearMoneda(promedios.get(editando.categoriaId)!)}
                </small>
              )}
            </div>
            {error && (
              <div className="ui error message">
                <p>{error}</p>
              </div>
            )}
            <div className="acciones-formulario">
              <button type="button" className="ui basic button" onClick={() => setEditando(null)}>
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
    </>
  )
}

export default PanelPresupuestos
