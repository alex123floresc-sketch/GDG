import { useMemo, useState, type FormEvent } from 'react'
import { useAvisos } from '../../hooks/useAvisos'
import { guardarAjustes } from '../../services/ajustesService'
import {
  actualizarDeseo,
  cambiarEstadoDeseo,
  comprarDeseo,
  crearDeseo,
  DIAS_ESPERA,
  eliminarDeseo,
  metaDesdeDeseo,
} from '../../services/deseoService'
import type { Ajustes, Categoria, Cuenta, Deseo, Meta, Transaccion } from '../../types'
import { ordenJerarquico } from '../../utils/categorias'
import { fechaDesdeInput, fechaParaInput, formatearFecha, formatearMoneda } from '../../utils/formato'
import { HORAS_SEMANA_POR_DEFECTO, textoHoras, valorHora } from '../../utils/horas'
import { estadoMeta } from '../../utils/planificacion'
import BarraProgreso from '../BarraProgreso'
import Modal from '../Modal'

interface PanelDeseosProps {
  usuarioId: string
  deseos: Deseo[]
  metas: Meta[]
  ajustes: Ajustes
  /** Solo las operativas. */
  cuentas: Cuenta[]
  categorias: Categoria[]
  transacciones: Transaccion[]
}

interface Borrador {
  id?: string
  nombre: string
  precio: string
  prioridad: 1 | 2 | 3
  enlace: string
  nota: string
  esperar: boolean
  esperarHasta: string
}

const PRIORIDADES: { id: 1 | 2 | 3; etiqueta: string }[] = [
  { id: 1, etiqueta: 'Lo quiero mucho' },
  { id: 2, etiqueta: 'Me gustaría' },
  { id: 3, etiqueta: 'Puede esperar' },
]

const DIA = 86_400_000

function PanelDeseos({ usuarioId, deseos, metas, ajustes, cuentas, categorias, transacciones }: PanelDeseosProps) {
  const { avisar } = useAvisos()
  const [hoy] = useState(() => new Date())
  const [borrador, setBorrador] = useState<Borrador | null>(null)
  const [comprando, setComprando] = useState<Deseo | null>(null)
  const [compra, setCompra] = useState({ monto: '', cuentaId: '', categoriaId: '' })
  const [eliminando, setEliminando] = useState<Deseo | null>(null)
  const [verCerrados, setVerCerrados] = useState(false)
  const [editandoHoras, setEditandoHoras] = useState(false)
  const [horas, setHoras] = useState({ ingreso: '', semana: '' })
  const [error, setError] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)

  const hora = useMemo(() => valorHora(ajustes, transacciones, hoy), [ajustes, transacciones, hoy])
  const metasPorId = new Map(metas.map((m) => [m.id, m]))

  const pendientes = deseos
    .filter((d) => d.estado === 'pendiente')
    .sort((a, b) => a.prioridad - b.prioridad || a.fechaCreacion.getTime() - b.fechaCreacion.getTime())
  const cerrados = deseos
    .filter((d) => d.estado !== 'pendiente')
    .sort((a, b) => (b.fechaEstado?.getTime() ?? 0) - (a.fechaEstado?.getTime() ?? 0))
  const totalPendiente = pendientes.reduce((s, d) => s + d.precio, 0)
  const resistido = deseos.filter((d) => d.estado === 'descartado').reduce((s, d) => s + d.precio, 0)

  function abrir(d?: Deseo) {
    setError(null)
    const en30 = new Date(hoy.getTime() + DIAS_ESPERA * DIA)
    setBorrador(
      d
        ? {
            id: d.id,
            nombre: d.nombre,
            precio: String(d.precio),
            prioridad: d.prioridad,
            enlace: d.enlace ?? '',
            nota: d.nota ?? '',
            esperar: Boolean(d.esperarHasta),
            esperarHasta: fechaParaInput(d.esperarHasta ?? en30),
          }
        : { nombre: '', precio: '', prioridad: 2, enlace: '', nota: '', esperar: true, esperarHasta: fechaParaInput(en30) },
    )
  }

  async function guardar(e: FormEvent) {
    e.preventDefault()
    if (!borrador) return
    setGuardando(true)
    setError(null)
    const datos = {
      nombre: borrador.nombre,
      precio: Number(borrador.precio),
      prioridad: borrador.prioridad,
      enlace: borrador.enlace,
      nota: borrador.nota,
      esperarHasta: borrador.esperar ? fechaDesdeInput(borrador.esperarHasta, new Date(2000, 0, 1)) : undefined,
    }
    try {
      if (borrador.id) await actualizarDeseo(borrador.id, datos)
      else await crearDeseo(datos, usuarioId)
      avisar(borrador.id ? 'Deseo actualizado' : 'Agregado a tu lista de deseos')
      setBorrador(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar.')
    } finally {
      setGuardando(false)
    }
  }

  function abrirCompra(d: Deseo) {
    setError(null)
    setCompra({
      monto: String(d.precio),
      cuentaId: cuentas[0]?.id ?? '',
      categoriaId: categorias.find((c) => c.tipo !== 'ingreso')?.id ?? '',
    })
    setComprando(d)
  }

  async function confirmarCompra() {
    if (!comprando) return
    try {
      await comprarDeseo(comprando, { monto: Number(compra.monto), cuentaId: compra.cuentaId, categoriaId: compra.categoriaId }, usuarioId)
      avisar(`¡Disfruta tu ${comprando.nombre}! Gasto registrado`)
      setComprando(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo registrar.')
    }
  }

  async function guardarHoras() {
    const ingreso = horas.ingreso.trim() === '' ? undefined : Number(horas.ingreso)
    const semana = horas.semana.trim() === '' ? undefined : Number(horas.semana)
    if ((ingreso !== undefined && !(ingreso > 0)) || (semana !== undefined && !(semana > 0 && semana <= 100))) {
      avisar('Revisa los valores: deben ser números mayores a 0.', 'error')
      return
    }
    await guardarAjustes(usuarioId, { ingresoMensual: ingreso, horasSemana: semana })
    setEditandoHoras(false)
    avisar('Guardado')
  }

  function tarjetaDeseo(d: Deseo) {
    const diasEspera = d.esperarHasta ? Math.ceil((d.esperarHasta.getTime() - hoy.getTime()) / DIA) : 0
    const meta = d.metaId ? metasPorId.get(d.metaId) : undefined
    const estadoM = meta ? estadoMeta(meta, hoy) : undefined
    return (
      <div key={d.id} className={`ui segment tarjeta-deseo prioridad-${d.prioridad} ${d.estado !== 'pendiente' ? 'cerrado' : ''}`}>
        <div className="cabecera">
          <div className="detalle">
            <strong>{d.nombre}</strong>
            <span className="texto-suave">
              {PRIORIDADES.find((p) => p.id === d.prioridad)?.etiqueta} · agregado el {formatearFecha(d.fechaCreacion)}
              {d.enlace && (
                <>
                  {' · '}
                  <a href={d.enlace} target="_blank" rel="noopener noreferrer">
                    Ver <i className="external alternate icon" />
                  </a>
                </>
              )}
            </span>
          </div>
          <div className="precio">
            <strong>{formatearMoneda(d.precio)}</strong>
            {hora && <small className="texto-suave">≈ {textoHoras(d.precio, hora.valor)} de trabajo</small>}
          </div>
        </div>
        {d.nota && <p className="nota-deseo">{d.nota}</p>}
        {d.estado === 'pendiente' ? (
          <>
            {diasEspera > 0 && (
              <p className="espera-deseo">
                <i className="hourglass half icon" />
                Regla de los 30 días: si en {diasEspera} día{diasEspera === 1 ? '' : 's'} lo sigues queriendo, cómpralo.
              </p>
            )}
            {meta && estadoM && (
              <div className="meta-deseo">
                <span className="texto-suave">
                  Ahorrando en la meta: {formatearMoneda(estadoM.ahorrado)} de {formatearMoneda(meta.montoObjetivo)}
                </span>
                <BarraProgreso valor={estadoM.porcentaje} color={meta.color} etiqueta={`Meta ${meta.nombre}`} grosor={6} />
              </div>
            )}
            <div className="acciones-deseo">
              <button type="button" className="ui mini primary button" onClick={() => abrirCompra(d)}>
                <i className="shopping bag icon" />
                Lo compré
              </button>
              <button
                type="button"
                className="ui mini basic button"
                onClick={() => {
                  void cambiarEstadoDeseo(d, 'descartado')
                  avisar(`Te ahorraste ${formatearMoneda(d.precio)}. ¡Bien!`)
                }}
              >
                <i className="hand paper icon" />
                Ya no lo quiero
              </button>
              {!d.metaId && (
                <button
                  type="button"
                  className="ui mini basic button"
                  onClick={() => {
                    void metaDesdeDeseo(d, usuarioId)
                    avisar('Meta creada: aporta desde Planificar → Metas')
                  }}
                >
                  <i className="bullseye icon" />
                  Ahorrar para esto
                </button>
              )}
              <div className="ui mini basic icon buttons">
                <button type="button" className="ui button" aria-label="Editar" onClick={() => abrir(d)}>
                  <i className="pencil alternate icon" />
                </button>
                <button type="button" className="ui button" aria-label="Eliminar" onClick={() => setEliminando(d)}>
                  <i className="trash alternate outline icon" />
                </button>
              </div>
            </div>
          </>
        ) : (
          <div className="acciones-deseo">
            <span className={d.estado === 'comprado' ? 'texto-suave' : 'texto-ingreso'}>
              <i className={`${d.estado === 'comprado' ? 'shopping bag' : 'hand paper'} icon`} />
              {d.estado === 'comprado' ? 'Comprado' : 'Descartado'} el {formatearFecha(d.fechaEstado ?? d.fechaCreacion)}
            </span>
            <button type="button" className="ui mini basic button" onClick={() => void cambiarEstadoDeseo(d, 'pendiente')}>
              Volver a la lista
            </button>
            <button type="button" className="ui mini basic icon button" aria-label="Eliminar" onClick={() => setEliminando(d)}>
              <i className="trash alternate outline icon" />
            </button>
          </div>
        )}
      </div>
    )
  }

  return (
    <>
      <div className="rejilla-kpi tres">
        <div className="kpi ui segment">
          <span className="etiqueta"><i className="gift icon" />En tu lista</span>
          <strong>{formatearMoneda(totalPendiente)}</strong>
          <span className="nota">{pendientes.length} deseo{pendientes.length === 1 ? '' : 's'}</span>
        </div>
        <div className="kpi ui segment">
          <span className="etiqueta"><i className="hand paper icon" />Te resististe</span>
          <strong className="texto-ingreso">{formatearMoneda(resistido)}</strong>
          <span className="nota">Lo que no gastaste por descartar deseos</span>
        </div>
        <div className="kpi ui segment">
          <span className="etiqueta"><i className="clock outline icon" />Tu hora de trabajo</span>
          <strong>{hora ? formatearMoneda(hora.valor) : '—'}</strong>
          <button
            type="button"
            className="enlace-sugerencia"
            onClick={() => {
              setHoras({ ingreso: ajustes.ingresoMensual ? String(ajustes.ingresoMensual) : '', semana: ajustes.horasSemana ? String(ajustes.horasSemana) : '' })
              setEditandoHoras(true)
            }}
          >
            {hora?.estimado ? 'Estimado · ajustar' : hora ? 'Cambiar' : 'Configurar'}
          </button>
        </div>
      </div>

      <div className="barra-filtros">
        <p className="texto-suave sin-margen">
          <i className="info circle icon" />
          Anota lo que quieres comprar y espera antes de hacerlo: evitarás compras por impulso.
        </p>
        <button type="button" className="ui primary button" onClick={() => abrir()}>
          <i className="plus icon" />
          Nuevo deseo
        </button>
      </div>

      {pendientes.length === 0 && (
        <div className="ui segment estado-vacio">
          <i className="huge gift icon texto-suave" />
          <p>
            <strong>Tu lista de deseos está vacía.</strong>
            <br />
            ¿Unas zapatillas, un viaje, una consola? Anótalo aquí y decide con calma.
          </p>
        </div>
      )}
      {pendientes.map(tarjetaDeseo)}

      {cerrados.length > 0 && (
        <button type="button" className="enlace-sugerencia" onClick={() => setVerCerrados(!verCerrados)}>
          <i className={`${verCerrados ? 'chevron up' : 'chevron down'} icon`} />
          {verCerrados ? 'Ocultar' : 'Ver'} comprados y descartados ({cerrados.length})
        </button>
      )}
      {verCerrados && cerrados.map(tarjetaDeseo)}

      <Modal abierto={borrador !== null} titulo={borrador?.id ? 'Editar deseo' : 'Nuevo deseo'} icono="gift" onCerrar={() => setBorrador(null)}>
        {borrador && (
          <form className={`ui form ${error ? 'error' : ''}`} onSubmit={guardar}>
            <div className="two fields">
              <div className="field required">
                <label htmlFor="de-nombre">¿Qué quieres?</label>
                <input
                  id="de-nombre"
                  value={borrador.nombre}
                  maxLength={80}
                  placeholder="Ej. Audífonos, Viaje a Cusco"
                  onChange={(e) => setBorrador({ ...borrador, nombre: e.target.value })}
                  autoFocus
                  required
                />
              </div>
              <div className="field required">
                <label htmlFor="de-precio">Precio aproximado (S/)</label>
                <input
                  id="de-precio"
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="0.01"
                  value={borrador.precio}
                  onChange={(e) => setBorrador({ ...borrador, precio: e.target.value })}
                  required
                />
                {hora && Number(borrador.precio) > 0 && (
                  <small className="texto-suave">≈ {textoHoras(Number(borrador.precio), hora.valor)} de tu trabajo</small>
                )}
              </div>
            </div>
            <div className="field">
              <label>¿Cuánto lo quieres?</label>
              <div className="ui fluid three buttons">
                {PRIORIDADES.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    aria-pressed={borrador.prioridad === p.id}
                    className={`ui button ${borrador.prioridad === p.id ? 'primary' : 'basic'}`}
                    onClick={() => setBorrador({ ...borrador, prioridad: p.id })}
                  >
                    {p.etiqueta}
                  </button>
                ))}
              </div>
            </div>
            <div className="field">
              <label htmlFor="de-enlace">Enlace (opcional)</label>
              <input
                id="de-enlace"
                type="url"
                inputMode="url"
                value={borrador.enlace}
                placeholder="https://…"
                onChange={(e) => setBorrador({ ...borrador, enlace: e.target.value })}
              />
            </div>
            <div className="field">
              <label htmlFor="de-nota">Nota (opcional)</label>
              <input
                id="de-nota"
                value={borrador.nota}
                maxLength={200}
                placeholder="Color, talla, dónde está más barato…"
                onChange={(e) => setBorrador({ ...borrador, nota: e.target.value })}
              />
            </div>
            <label className="casilla-simple">
              <input type="checkbox" checked={borrador.esperar} onChange={(e) => setBorrador({ ...borrador, esperar: e.target.checked })} />
              Esperar antes de comprarlo (regla de los 30 días)
            </label>
            {borrador.esperar && (
              <div className="field">
                <label htmlFor="de-espera">Hasta</label>
                <input
                  id="de-espera"
                  type="date"
                  value={borrador.esperarHasta}
                  onChange={(e) => setBorrador({ ...borrador, esperarHasta: e.target.value })}
                />
              </div>
            )}
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

      <Modal abierto={comprando !== null} titulo={`Compraste "${comprando?.nombre ?? ''}"`} icono="shopping bag" onCerrar={() => setComprando(null)}>
        <div className={`ui form ${error ? 'error' : ''}`}>
          <p className="texto-suave">Se registrará el gasto de hoy.</p>
          <div className="three fields">
            <div className="field required">
              <label htmlFor="dc-monto">Pagaste (S/)</label>
              <input
                id="dc-monto"
                type="number"
                inputMode="decimal"
                min="0"
                step="0.01"
                value={compra.monto}
                onChange={(e) => setCompra({ ...compra, monto: e.target.value })}
              />
            </div>
            <div className="field required">
              <label htmlFor="dc-cuenta">Cuenta</label>
              <select id="dc-cuenta" className="ui dropdown" value={compra.cuentaId} onChange={(e) => setCompra({ ...compra, cuentaId: e.target.value })}>
                {cuentas.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nombre}
                  </option>
                ))}
              </select>
            </div>
            <div className="field required">
              <label htmlFor="dc-cat">Categoría</label>
              <select id="dc-cat" className="ui dropdown" value={compra.categoriaId} onChange={(e) => setCompra({ ...compra, categoriaId: e.target.value })}>
                {ordenJerarquico(categorias.filter((c) => c.tipo !== 'ingreso')).map(([c, sub]) => (
                  <option key={c.id} value={c.id}>
                    {sub ? `  › ${c.nombre}` : c.nombre}
                  </option>
                ))}
              </select>
            </div>
          </div>
          {error && (
            <div className="ui error message">
              <p>{error}</p>
            </div>
          )}
          <div className="acciones-formulario">
            <button
              type="button"
              className="ui basic button"
              onClick={() => {
                if (comprando) void cambiarEstadoDeseo(comprando, 'comprado')
                setComprando(null)
              }}
            >
              Solo marcar como comprado
            </button>
            <button type="button" className="ui primary button" onClick={() => void confirmarCompra()}>
              <i className="save icon" />
              Registrar gasto
            </button>
          </div>
        </div>
      </Modal>

      <Modal abierto={editandoHoras} titulo="¿Cuánto vale tu hora de trabajo?" icono="clock outline" tamano="tiny" onCerrar={() => setEditandoHoras(false)}>
        <div className="ui form">
          <p className="texto-suave">
            Así verás cada gasto en horas de trabajo (al registrar y en tu lista de deseos). Si no pones tu ingreso,
            usamos el promedio de tus ingresos registrados.
          </p>
          <div className="two fields">
            <div className="field">
              <label htmlFor="hr-ingreso">Ingreso mensual (S/)</label>
              <input
                id="hr-ingreso"
                type="number"
                inputMode="decimal"
                min="0"
                placeholder={hora?.estimado ? hora.ingresoMensual.toFixed(0) : ''}
                value={horas.ingreso}
                onChange={(e) => setHoras({ ...horas, ingreso: e.target.value })}
              />
            </div>
            <div className="field">
              <label htmlFor="hr-semana">Horas por semana</label>
              <input
                id="hr-semana"
                type="number"
                inputMode="numeric"
                min="1"
                max="100"
                placeholder={String(HORAS_SEMANA_POR_DEFECTO)}
                value={horas.semana}
                onChange={(e) => setHoras({ ...horas, semana: e.target.value })}
              />
            </div>
          </div>
          <div className="acciones-formulario">
            <button type="button" className="ui basic button" onClick={() => setEditandoHoras(false)}>
              Cancelar
            </button>
            <button type="button" className="ui primary button" onClick={() => void guardarHoras()}>
              Guardar
            </button>
          </div>
        </div>
      </Modal>

      <Modal abierto={eliminando !== null} titulo={`¿Eliminar "${eliminando?.nombre ?? ''}"?`} icono="trash alternate outline" tamano="tiny" onCerrar={() => setEliminando(null)}>
        <p>Se quitará de tu lista. Si creaste una meta para él, la meta se conserva.</p>
        <div className="acciones-formulario">
          <button type="button" className="ui basic button" onClick={() => setEliminando(null)}>
            Cancelar
          </button>
          <button
            type="button"
            className="ui red button"
            onClick={() => {
              if (eliminando) void eliminarDeseo(eliminando)
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

export default PanelDeseos
