import { useState, type FormEvent } from 'react'
import { useAvisos } from '../../hooks/useAvisos'
import { actualizarMeta, aportarAMeta, crearMeta, eliminarMeta } from '../../services/metaService'
import { COLORES_CATEGORIA } from '../../services/categoriaService'
import type { Meta } from '../../types'
import { fechaDesdeInput, fechaParaInput, formatearFecha, formatearMoneda, formatearPorcentaje } from '../../utils/formato'
import { estadoMeta } from '../../utils/planificacion'
import BarraProgreso from '../BarraProgreso'
import Modal from '../Modal'
import Ilustracion from '../Ilustracion'

interface PanelMetasProps {
  usuarioId: string
  metas: Meta[]
}

const ICONOS_META = [
  'bullseye', 'laptop', 'mobile alternate', 'car', 'plane', 'home', 'graduation cap',
  'gift', 'heartbeat', 'umbrella beach', 'ring', 'baby', 'paw', 'shield alternate', 'piggy bank', 'star',
]

interface BorradorMeta {
  id?: string
  nombre: string
  objetivo: string
  fechaLimite: string
  icono: string
  color: string
}

function PanelMetas({ usuarioId, metas }: PanelMetasProps) {
  const { avisar } = useAvisos()
  const [borrador, setBorrador] = useState<BorradorMeta | null>(null)
  const [aporte, setAporte] = useState<{ meta: Meta; monto: string; nota: string; retiro: boolean } | null>(null)
  const [eliminando, setEliminando] = useState<Meta | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)

  const ordenadas = [...metas].sort((a, b) => {
    const ea = estadoMeta(a)
    const eb = estadoMeta(b)
    return Number(ea.completada) - Number(eb.completada) || b.aportes.length - a.aportes.length
  })
  const totalAhorrado = metas.reduce((s, m) => s + estadoMeta(m).ahorrado, 0)

  function abrir(meta?: Meta) {
    setError(null)
    setBorrador(
      meta
        ? {
            id: meta.id,
            nombre: meta.nombre,
            objetivo: String(meta.montoObjetivo),
            fechaLimite: meta.fechaLimite ? fechaParaInput(meta.fechaLimite) : '',
            icono: meta.icono,
            color: meta.color,
          }
        : { nombre: '', objetivo: '', fechaLimite: '', icono: 'bullseye', color: COLORES_CATEGORIA[metas.length % 8] },
    )
  }

  async function ejecutar(accion: () => Promise<void>, alTerminar: () => void) {
    setGuardando(true)
    setError(null)
    try {
      await accion()
      alTerminar()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar.')
    } finally {
      setGuardando(false)
    }
  }

  function guardarMeta(e: FormEvent) {
    e.preventDefault()
    if (!borrador) return
    const datos = {
      nombre: borrador.nombre,
      montoObjetivo: Number(borrador.objetivo),
      fechaLimite: borrador.fechaLimite ? fechaDesdeInput(borrador.fechaLimite, new Date(2000, 0, 1, 12)) : undefined,
      icono: borrador.icono,
      color: borrador.color,
    }
    void ejecutar(
      () => (borrador.id ? actualizarMeta(borrador.id, datos) : crearMeta(datos, usuarioId).then(() => {})),
      () => {
        avisar(borrador.id ? 'Meta actualizada' : 'Meta creada')
        setBorrador(null)
      },
    )
  }

  function guardarAporte(e: FormEvent) {
    e.preventDefault()
    if (!aporte) return
    const monto = Number(aporte.monto) * (aporte.retiro ? -1 : 1)
    const antes = estadoMeta(aporte.meta)
    void ejecutar(
      () => aportarAMeta(aporte.meta.id, monto, aporte.nota),
      () => {
        const completa = !antes.completada && antes.ahorrado + monto >= aporte.meta.montoObjetivo
        avisar(completa ? `¡Completaste "${aporte.meta.nombre}"! 🎉` : aporte.retiro ? 'Retiro registrado' : 'Aporte registrado')
        setAporte(null)
      },
    )
  }

  return (
    <>
      <div className="barra-filtros">
        <div className="resumen-linea">
          Ahorrado en metas: <strong>{formatearMoneda(totalAhorrado)}</strong>
        </div>
        <button type="button" className="ui primary button" onClick={() => abrir()}>
          <i className="plus icon" />
          Nueva meta
        </button>
      </div>

      {metas.length === 0 ? (
        <div className="ui segment estado-vacio">
          <Ilustracion nombre="metas" />
          <p>
            <strong>¿Para qué estás ahorrando?</strong>
            <br />
            Crea una meta (una laptop, un viaje, un fondo de emergencia) y ve cuánto te falta y cuánto
            ahorrar cada mes.
          </p>
          <button type="button" className="ui primary button" onClick={() => abrir()}>
            <i className="plus icon" />
            Crear mi primera meta
          </button>
        </div>
      ) : (
        <div className="rejilla-metas">
          {ordenadas.map((meta) => {
            const e = estadoMeta(meta)
            return (
              <div key={meta.id} className={`ui segment tarjeta-meta ${e.completada ? 'completada' : ''}`}>
                <div className="cabecera">
                  <span className="icono-circulo" style={{ background: meta.color }}>
                    <i className={`${meta.icono} icon`} />
                  </span>
                  <div className="titulo">
                    <strong>{meta.nombre}</strong>
                    <span>
                      {meta.fechaLimite ? `Para el ${formatearFecha(meta.fechaLimite)}` : 'Sin fecha límite'}
                    </span>
                  </div>
                  <div className="ui mini basic icon buttons">
                    <button type="button" className="ui button" aria-label="Editar" onClick={() => abrir(meta)}>
                      <i className="pencil alternate icon" />
                    </button>
                    <button type="button" className="ui button" aria-label="Eliminar" onClick={() => setEliminando(meta)}>
                      <i className="trash alternate outline icon" />
                    </button>
                  </div>
                </div>

                <div className="cifras-meta">
                  <strong>{formatearMoneda(e.ahorrado)}</strong>
                  <span className="texto-suave">de {formatearMoneda(meta.montoObjetivo)}</span>
                  <span className="porcentaje">{formatearPorcentaje(e.porcentaje)}</span>
                </div>
                <BarraProgreso valor={e.porcentaje} color={meta.color} etiqueta={`${meta.nombre}: ${formatearPorcentaje(e.porcentaje)}`} grosor={10} />

                <div className="pie">
                  {e.completada ? (
                    <span className="texto-ingreso">
                      <i className="trophy icon" />
                      ¡Meta cumplida!
                    </span>
                  ) : e.vencida ? (
                    <span className="texto-gasto">
                      <i className="clock outline icon" />
                      Venció · faltan {formatearMoneda(e.restante)}
                    </span>
                  ) : e.ahorroMensualNecesario !== undefined ? (
                    <span>
                      Ahorra <strong>{formatearMoneda(e.ahorroMensualNecesario)}</strong> al mes
                      {e.mesesRestantes === 1 ? ' (último mes)' : ` por ${e.mesesRestantes} meses`}
                    </span>
                  ) : (
                    <span className="texto-suave">Faltan {formatearMoneda(e.restante)}</span>
                  )}
                </div>

                <div className="acciones-meta">
                  <button
                    type="button"
                    className="ui small primary button"
                    onClick={() => {
                      setError(null)
                      setAporte({ meta, monto: '', nota: '', retiro: false })
                    }}
                  >
                    <i className="plus icon" />
                    Aportar
                  </button>
                  {e.ahorrado > 0 && (
                    <button
                      type="button"
                      className="ui small basic button"
                      onClick={() => {
                        setError(null)
                        setAporte({ meta, monto: '', nota: '', retiro: true })
                      }}
                    >
                      <i className="minus icon" />
                      Retirar
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      <Modal
        abierto={borrador !== null}
        titulo={borrador?.id ? 'Editar meta' : 'Nueva meta de ahorro'}
        icono="bullseye"
        onCerrar={() => setBorrador(null)}
      >
        {borrador && (
          <form className={`ui form ${error ? 'error' : ''}`} onSubmit={guardarMeta}>
            <div className="field required">
              <label htmlFor="meta-nombre">¿Para qué ahorras?</label>
              <input
                id="meta-nombre"
                value={borrador.nombre}
                maxLength={60}
                placeholder="Ej. Laptop nueva, Fondo de emergencia"
                onChange={(e) => setBorrador({ ...borrador, nombre: e.target.value })}
                autoFocus
                required
              />
            </div>
            <div className="two fields">
              <div className="field required">
                <label htmlFor="meta-objetivo">Monto objetivo</label>
                <div className="ui left labeled input">
                  <span className="ui basic label">S/</span>
                  <input
                    id="meta-objetivo"
                    type="number"
                    inputMode="decimal"
                    min="0"
                    step="0.01"
                    value={borrador.objetivo}
                    onChange={(e) => setBorrador({ ...borrador, objetivo: e.target.value })}
                    required
                  />
                </div>
              </div>
              <div className="field">
                <label htmlFor="meta-fecha">Fecha límite (opcional)</label>
                <input
                  id="meta-fecha"
                  type="date"
                  value={borrador.fechaLimite}
                  onChange={(e) => setBorrador({ ...borrador, fechaLimite: e.target.value })}
                />
              </div>
            </div>
            <div className="field">
              <label>Color</label>
              <div className="selector-color">
                {COLORES_CATEGORIA.map((color) => (
                  <button
                    key={color}
                    type="button"
                    aria-label={color}
                    aria-pressed={borrador.color === color}
                    className={`muestra-color ${borrador.color === color ? 'activa' : ''}`}
                    style={{ background: color }}
                    onClick={() => setBorrador({ ...borrador, color })}
                  >
                    {borrador.color === color && <i className="check icon" />}
                  </button>
                ))}
              </div>
            </div>
            <div className="field">
              <label>Icono</label>
              <div className="selector-icono">
                {ICONOS_META.map((icono) => (
                  <button
                    key={icono}
                    type="button"
                    aria-pressed={borrador.icono === icono}
                    className={`opcion-icono ${borrador.icono === icono ? 'activa' : ''}`}
                    style={borrador.icono === icono ? { background: borrador.color } : undefined}
                    onClick={() => setBorrador({ ...borrador, icono })}
                  >
                    <i className={`${icono} icon`} />
                  </button>
                ))}
              </div>
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
        abierto={aporte !== null}
        titulo={aporte ? `${aporte.retiro ? 'Retirar de' : 'Aportar a'} "${aporte.meta.nombre}"` : ''}
        icono={aporte?.retiro ? 'minus circle' : 'plus circle'}
        tamano="tiny"
        onCerrar={() => setAporte(null)}
      >
        {aporte && (
          <form className={`ui form ${error ? 'error' : ''}`} onSubmit={guardarAporte}>
            <div className="field required">
              <label htmlFor="aporte-monto">Monto</label>
              <div className="ui left labeled input">
                <span className="ui basic label">S/</span>
                <input
                  id="aporte-monto"
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="0.01"
                  value={aporte.monto}
                  onChange={(e) => setAporte({ ...aporte, monto: e.target.value })}
                  autoFocus
                  required
                />
              </div>
              {!aporte.retiro && estadoMeta(aporte.meta).ahorroMensualNecesario !== undefined && (
                <button
                  type="button"
                  className="enlace-sugerencia"
                  onClick={() =>
                    setAporte({ ...aporte, monto: estadoMeta(aporte.meta).ahorroMensualNecesario!.toFixed(2) })
                  }
                >
                  Usar lo sugerido: {formatearMoneda(estadoMeta(aporte.meta).ahorroMensualNecesario!)}
                </button>
              )}
            </div>
            <div className="field">
              <label htmlFor="aporte-nota">Nota (opcional)</label>
              <input
                id="aporte-nota"
                value={aporte.nota}
                maxLength={80}
                onChange={(e) => setAporte({ ...aporte, nota: e.target.value })}
              />
            </div>
            {aporte.meta.aportes.length > 0 && (
              <div className="historial-aportes">
                <div className="texto-suave">Últimos movimientos</div>
                {[...aporte.meta.aportes].reverse().slice(0, 4).map((a) => (
                  <div key={a.id} className="fila-aporte">
                    <span>{formatearFecha(a.fecha)}{a.nota ? ` · ${a.nota}` : ''}</span>
                    <strong className={a.monto < 0 ? 'texto-gasto' : 'texto-ingreso'}>
                      {a.monto < 0 ? '-' : '+'}
                      {formatearMoneda(Math.abs(a.monto))}
                    </strong>
                  </div>
                ))}
              </div>
            )}
            {error && (
              <div className="ui error message">
                <p>{error}</p>
              </div>
            )}
            <div className="acciones-formulario">
              <button type="button" className="ui basic button" onClick={() => setAporte(null)}>
                Cancelar
              </button>
              <button type="submit" className={`ui primary button ${guardando ? 'loading' : ''}`} disabled={guardando}>
                <i className="check icon" />
                {aporte.retiro ? 'Retirar' : 'Aportar'}
              </button>
            </div>
          </form>
        )}
      </Modal>

      <Modal
        abierto={eliminando !== null}
        titulo={`¿Eliminar "${eliminando?.nombre ?? ''}"?`}
        icono="trash alternate outline"
        tamano="tiny"
        onCerrar={() => setEliminando(null)}
      >
        <p>Se borrará la meta y su historial de aportes.</p>
        <div className="acciones-formulario">
          <button type="button" className="ui basic button" onClick={() => setEliminando(null)}>
            Cancelar
          </button>
          <button
            type="button"
            className="ui red button"
            onClick={() => {
              if (eliminando) void eliminarMeta(eliminando)
              avisar('Meta eliminada', 'info')
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

export default PanelMetas
