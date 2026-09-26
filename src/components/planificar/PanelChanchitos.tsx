import { useState, type FormEvent } from 'react'
import { useAvisos } from '../../hooks/useAvisos'
import { COLORES_CATEGORIA } from '../../services/categoriaService'
import {
  actualizarChanchito,
  archivarChanchito,
  crearChanchito,
  echarAlChanchito,
  eliminarChanchito,
  sacarDelChanchito,
  type DestinoSalida,
} from '../../services/chanchitoService'
import type { Categoria, Chanchito, Cuenta, Meta, RetoAhorro, TipoChanchito, TipoReto, Transaccion } from '../../types'
import { historialChanchito, saldoChanchito } from '../../utils/chanchitos'
import { cuentasOperativas, saldosPorCuenta } from '../../utils/cuentas'
import { fechaDesdeInput, fechaParaInput, formatearFecha, formatearMoneda } from '../../utils/formato'
import { estadoReto, NOMBRE_RETO, TIPOS_RETO } from '../../utils/retos'
import BarraProgreso from '../BarraProgreso'
import Ilustracion from '../Ilustracion'
import Modal from '../Modal'

interface PanelChanchitosProps {
  usuarioId: string
  chanchitos: Chanchito[]
  cuentas: Cuenta[]
  transacciones: Transaccion[]
  categorias: Categoria[]
  metas: Meta[]
}

const ICONOS_CHANCHITO = [
  'piggy bank', 'coins', 'umbrella beach', 'plane', 'gift', 'heart', 'home', 'gamepad', 'child', 'box open', 'star', 'shield alternate',
]

interface Borrador {
  id?: string
  nombre: string
  tipo: TipoChanchito
  icono: string
  color: string
  conReto: boolean
  retoTipo: TipoReto
  retoMonto: string
  retoDuracion: string
  retoInicio: string
}

interface Echar {
  chanchito: Chanchito
  monto: string
  cuentaId: string
  nota: string
  retoClave?: string
  titulo: string
}

type TipoDestino = DestinoSalida['tipo']

interface Sacar {
  chanchito: Chanchito
  saldo: number
  monto: string
  romper: boolean
  destino: TipoDestino
  cuentaId: string
  categoriaId: string
  metaId: string
}

function PanelChanchitos({ usuarioId, chanchitos, cuentas, transacciones, categorias, metas }: PanelChanchitosProps) {
  const { avisar } = useAvisos()
  const [borrador, setBorrador] = useState<Borrador | null>(null)
  const [echar, setEchar] = useState<Echar | null>(null)
  const [sacar, setSacar] = useState<Sacar | null>(null)
  const [historial, setHistorial] = useState<Chanchito | null>(null)
  const [eliminando, setEliminando] = useState<Chanchito | null>(null)
  const [verArchivados, setVerArchivados] = useState(false)
  const [rompiendo, setRompiendo] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)

  const operativas = cuentasOperativas(cuentas)
  const saldosCuentas = saldosPorCuenta(operativas, transacciones)
  const categoriasIngreso = categorias.filter((c) => c.tipo !== 'gasto')
  const saldo = (c: Chanchito) => saldoChanchito(c, cuentas, transacciones)

  const activos = chanchitos.filter((c) => !c.archivado).sort((a, b) => saldo(b) - saldo(a))
  const archivados = chanchitos.filter((c) => c.archivado)
  const total = activos.reduce((s, c) => s + saldo(c), 0)

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

  // ---------- Crear / editar ----------

  function abrir(c?: Chanchito) {
    setError(null)
    const reto = c?.reto
    setBorrador({
      id: c?.id,
      nombre: c?.nombre ?? '',
      tipo: c?.tipo ?? 'cuenta',
      icono: c?.icono ?? 'piggy bank',
      color: c?.color ?? COLORES_CATEGORIA[(chanchitos.length + 5) % 8],
      conReto: reto !== undefined,
      retoTipo: reto?.tipo ?? 'semanas52',
      retoMonto: String(reto?.montoBase ?? TIPOS_RETO[0].montoSugerido),
      retoDuracion: String(reto?.duracion ?? 30),
      retoInicio: fechaParaInput(reto?.inicio ?? new Date()),
    })
  }

  function guardar(e: FormEvent) {
    e.preventDefault()
    if (!borrador) return
    const reto: RetoAhorro | undefined = borrador.conReto
      ? {
          tipo: borrador.retoTipo,
          montoBase: Number(borrador.retoMonto),
          inicio: fechaDesdeInput(borrador.retoInicio, new Date(2000, 0, 1)),
          duracion: borrador.retoTipo === 'diario' ? Number(borrador.retoDuracion) : undefined,
          cumplidos: [],
        }
      : undefined
    const datos = { nombre: borrador.nombre, icono: borrador.icono, color: borrador.color, reto }
    void ejecutar(
      () =>
        borrador.id
          ? actualizarChanchito(borrador.id, datos)
          : crearChanchito({ ...datos, tipo: borrador.tipo }, usuarioId).then(() => {}),
      () => {
        avisar(borrador.id ? 'Chanchito actualizado' : 'Chanchito creado 🐷')
        setBorrador(null)
      },
    )
  }

  // ---------- Echar ----------

  function abrirEchar(chanchito: Chanchito, monto?: number, retoClave?: string, titulo?: string) {
    setError(null)
    const masRica = [...operativas].sort((a, b) => (saldosCuentas.get(b.id) ?? 0) - (saldosCuentas.get(a.id) ?? 0))[0]
    setEchar({
      chanchito,
      monto: monto !== undefined ? monto.toFixed(2) : '',
      cuentaId: masRica?.id ?? '',
      nota: '',
      retoClave,
      titulo: titulo ?? `Echar a "${chanchito.nombre}"`,
    })
  }

  function guardarEchar(e: FormEvent) {
    e.preventDefault()
    if (!echar) return
    void ejecutar(
      () =>
        echarAlChanchito(echar.chanchito, Number(echar.monto), {
          cuentaOrigenId: echar.cuentaId,
          nota: echar.nota,
          retoClave: echar.retoClave,
        }),
      () => {
        avisar(echar.retoClave ? '¡Reto cumplido! 🐷' : 'Al chanchito 🐷')
        setEchar(null)
      },
    )
  }

  // ---------- Sacar / romper ----------

  function abrirSacar(chanchito: Chanchito, romper: boolean) {
    setError(null)
    const s = saldo(chanchito)
    setSacar({
      chanchito,
      saldo: s,
      monto: romper ? s.toFixed(2) : '',
      romper,
      destino: 'cuenta',
      cuentaId: operativas[0]?.id ?? '',
      categoriaId: categoriasIngreso.find((c) => /ahorro|otro/i.test(c.nombre))?.id ?? categoriasIngreso[0]?.id ?? '',
      metaId: metas[0]?.id ?? '',
    })
  }

  function guardarSacar(e: FormEvent) {
    e.preventDefault()
    if (!sacar) return
    const destino: DestinoSalida =
      sacar.destino === 'cuenta'
        ? { tipo: 'cuenta', cuentaId: sacar.cuentaId, categoriaId: sacar.categoriaId }
        : sacar.destino === 'meta'
          ? { tipo: 'meta', metaId: sacar.metaId, cuentaId: sacar.chanchito.tipo === 'cuenta' ? sacar.cuentaId : undefined }
          : { tipo: 'nada' }
    const monto = Number(sacar.monto)
    const rompe = monto >= sacar.saldo - 0.004
    void ejecutar(
      () => sacarDelChanchito(sacar.chanchito, monto, sacar.saldo, destino),
      () => {
        if (rompe) {
          setRompiendo(sacar.chanchito.id)
          setTimeout(() => setRompiendo(null), 900)
        }
        avisar(rompe ? `¡Rompiste "${sacar.chanchito.nombre}"! 🔨🐷` : 'Dinero sacado del chanchito')
        setSacar(null)
      },
    )
  }

  // ---------- Tarjeta ----------

  function bloqueReto(c: Chanchito) {
    if (!c.reto) return null
    const e = estadoReto(c.reto)
    const progreso = e.total ? e.cumplidos / e.total : 0
    return (
      <div className="reto-chanchito">
        <div className="linea">
          <span>
            <i className="fire icon" />
            {NOMBRE_RETO[c.reto.tipo]}
          </span>
          <span className="texto-suave">
            {e.total ? `${e.cumplidos}/${e.total}` : `${e.cumplidos} ${e.cumplidos === 1 ? 'vez' : 'veces'}`}
          </span>
        </div>
        {e.total !== undefined && (
          <BarraProgreso valor={progreso} color={c.color} etiqueta={`Reto: ${e.cumplidos} de ${e.total}`} />
        )}
        <div className="linea">
          <span className="texto-suave">
            Llevas {formatearMoneda(e.ahorrado)}
            {e.meta !== undefined && ` de ${formatearMoneda(e.meta)}`}
          </span>
        </div>
        {e.terminado ? (
          <span className="texto-ingreso">
            <i className="trophy icon" />
            ¡Reto terminado!
          </span>
        ) : (
          <div className="acciones-reto">
            {e.actual && (
              <button
                type="button"
                className="ui mini basic button"
                disabled={e.actual.cumplido}
                onClick={() =>
                  abrirEchar(c, e.actual!.monto, e.actual!.clave, `${NOMBRE_RETO[c.reto!.tipo]} · ${e.actual!.etiqueta}`)
                }
              >
                <i className={`${e.actual.cumplido ? 'check' : 'calendar check'} icon`} />
                {e.actual.cumplido
                  ? `${e.actual.etiqueta}: hecho`
                  : c.reto.tipo === 'monedas'
                    ? `+ ${formatearMoneda(e.actual.monto)}`
                    : `${c.reto.tipo === 'semanas52' ? 'Esta semana' : 'Hoy'}: ${formatearMoneda(e.actual.monto)}`}
              </button>
            )}
            {e.atrasados.length > 0 && (
              <button
                type="button"
                className="ui mini basic button"
                onClick={() =>
                  abrirEchar(c, e.atrasados[0].monto, e.atrasados[0].clave, `Ponerte al día · ${e.atrasados[0].etiqueta}`)
                }
              >
                <i className="history icon" />
                {e.atrasados.length} pendiente{e.atrasados.length === 1 ? '' : 's'}
              </button>
            )}
          </div>
        )}
      </div>
    )
  }

  function tarjeta(c: Chanchito) {
    const s = saldo(c)
    return (
      <div key={c.id} className={`ui segment tarjeta-meta tarjeta-chanchito ${rompiendo === c.id ? 'rompiendo' : ''}`}>
        <div className="cabecera">
          <span className="icono-circulo" style={{ background: c.color }}>
            <i className={`${c.icono} icon`} />
          </span>
          <div className="titulo">
            <strong>{c.nombre}</strong>
            <span>{c.tipo === 'cuenta' ? 'Apartado de tus cuentas' : 'Chanchito físico'}</span>
          </div>
          <div className="ui mini basic icon buttons">
            <button type="button" className="ui button" aria-label="Historial" onClick={() => setHistorial(c)}>
              <i className="history icon" />
            </button>
            <button type="button" className="ui button" aria-label="Editar" onClick={() => abrir(c)}>
              <i className="pencil alternate icon" />
            </button>
            <button
              type="button"
              className="ui button"
              aria-label={c.archivado ? 'Desarchivar' : 'Eliminar'}
              onClick={() =>
                c.archivado
                  ? void archivarChanchito(c, false).then(() => avisar('Chanchito restaurado'))
                  : (setError(null), setEliminando(c))
              }
            >
              <i className={`${c.archivado ? 'undo' : 'trash alternate outline'} icon`} />
            </button>
          </div>
        </div>

        <div className="cifras-meta">
          <strong>{formatearMoneda(s)}</strong>
          <span className="texto-suave">guardado</span>
        </div>

        {bloqueReto(c)}

        {!c.archivado && (
          <div className="acciones-meta">
            <button
              type="button"
              className="ui small primary button"
              disabled={c.tipo === 'cuenta' && operativas.length === 0}
              onClick={() => abrirEchar(c)}
            >
              <i className="plus icon" />
              Echar
            </button>
            {s > 0 && (
              <>
                <button type="button" className="ui small basic button" onClick={() => abrirSacar(c, false)}>
                  <i className="minus icon" />
                  Sacar
                </button>
                <button type="button" className="ui small basic button" onClick={() => abrirSacar(c, true)}>
                  <i className="hammer icon" />
                  Romper
                </button>
              </>
            )}
          </div>
        )}
      </div>
    )
  }

  const retoElegido = TIPOS_RETO.find((t) => t.id === borrador?.retoTipo)

  return (
    <>
      <div className="barra-filtros">
        <div className="resumen-linea">
          En tus chanchitos: <strong>{formatearMoneda(total)}</strong>
        </div>
        <button type="button" className="ui primary button" onClick={() => abrir()}>
          <i className="plus icon" />
          Nuevo chanchito
        </button>
      </div>

      {activos.length === 0 ? (
        <div className="ui segment estado-vacio">
          <Ilustracion nombre="chanchito" />
          <p>
            <strong>Tu chanchito, sin metas ni fechas</strong>
            <br />
            Ve guardando de a pocos: apártalo de tus cuentas o anota lo que metes en tu alcancía de
            verdad. Súmale un reto (como el de 52 semanas) y rómpelo cuando lo necesites.
          </p>
          <button type="button" className="ui primary button" onClick={() => abrir()}>
            <i className="piggy bank icon" />
            Crear mi primer chanchito
          </button>
        </div>
      ) : (
        <div className="rejilla-metas">{activos.map(tarjeta)}</div>
      )}

      {archivados.length > 0 && (
        <div className="archivados-chanchitos">
          <button type="button" className="enlace-sugerencia" onClick={() => setVerArchivados(!verArchivados)}>
            <i className="archive icon" />
            {verArchivados ? 'Ocultar' : 'Ver'} archivados ({archivados.length})
          </button>
          {verArchivados && <div className="rejilla-metas">{archivados.map(tarjeta)}</div>}
        </div>
      )}

      {/* ---------- Crear / editar ---------- */}
      <Modal
        abierto={borrador !== null}
        titulo={borrador?.id ? 'Editar chanchito' : 'Nuevo chanchito'}
        icono="piggy bank"
        onCerrar={() => setBorrador(null)}
      >
        {borrador && (
          <form className={`ui form ${error ? 'error' : ''}`} onSubmit={guardar}>
            <div className="field required">
              <label htmlFor="chanchito-nombre">Nombre</label>
              <input
                id="chanchito-nombre"
                value={borrador.nombre}
                maxLength={40}
                placeholder="Ej. Vacaciones, Por si acaso, Monedas"
                onChange={(e) => setBorrador({ ...borrador, nombre: e.target.value })}
                autoFocus
                required
              />
            </div>

            {!borrador.id && (
              <div className="field">
                <label>¿Dónde está el dinero?</label>
                <div className="opciones-tipo-chanchito">
                  {(
                    [
                      ['cuenta', 'wallet', 'Apartado de mis cuentas', 'Lo sacas de Yape, Banco… sin que cuente como gasto. Tu saldo disponible baja.'],
                      ['fisico', 'piggy bank', 'Alcancía física', 'Solo anotas lo que metes en tu chanchito de verdad. No toca tus cuentas.'],
                    ] as const
                  ).map(([tipo, icono, titulo, texto]) => (
                    <button
                      key={tipo}
                      type="button"
                      aria-pressed={borrador.tipo === tipo}
                      className={`opcion-tipo ${borrador.tipo === tipo ? 'activa' : ''}`}
                      onClick={() => setBorrador({ ...borrador, tipo })}
                    >
                      <i className={`${icono} icon`} />
                      <strong>{titulo}</strong>
                      <span>{texto}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

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
                {ICONOS_CHANCHITO.map((icono) => (
                  <button
                    key={icono}
                    type="button"
                    aria-label={icono}
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

            <div className="field">
              <label className="casilla">
                <input
                  type="checkbox"
                  checked={borrador.conReto}
                  onChange={(e) => setBorrador({ ...borrador, conReto: e.target.checked })}
                />
                Sumarle un reto de ahorro
              </label>
            </div>

            {borrador.conReto && (
              <div className="ui segment bloque-reto">
                <div className="field">
                  <label htmlFor="reto-tipo">Reto</label>
                  <select
                    id="reto-tipo"
                    className="ui dropdown"
                    value={borrador.retoTipo}
                    onChange={(e) => {
                      const tipo = e.target.value as TipoReto
                      const sugerido = TIPOS_RETO.find((t) => t.id === tipo)!.montoSugerido
                      setBorrador({ ...borrador, retoTipo: tipo, retoMonto: String(sugerido) })
                    }}
                  >
                    {TIPOS_RETO.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.nombre}
                      </option>
                    ))}
                  </select>
                  <p className="texto-suave ayuda-campo">{retoElegido?.descripcion}</p>
                </div>
                <div className="two fields">
                  <div className="field required">
                    <label htmlFor="reto-monto">
                      {borrador.retoTipo === 'semanas52'
                        ? 'Monto de la semana 1'
                        : borrador.retoTipo === 'diario'
                          ? 'Monto por día'
                          : 'Valor de la moneda/billete'}
                    </label>
                    <div className="ui left labeled input">
                      <span className="ui basic label">S/</span>
                      <input
                        id="reto-monto"
                        type="number"
                        inputMode="decimal"
                        min="0"
                        step="0.1"
                        value={borrador.retoMonto}
                        onChange={(e) => setBorrador({ ...borrador, retoMonto: e.target.value })}
                        required
                      />
                    </div>
                  </div>
                  {borrador.retoTipo === 'diario' ? (
                    <div className="field required">
                      <label htmlFor="reto-duracion">Durante (días)</label>
                      <select
                        id="reto-duracion"
                        className="ui dropdown"
                        value={borrador.retoDuracion}
                        onChange={(e) => setBorrador({ ...borrador, retoDuracion: e.target.value })}
                      >
                        {[7, 30, 60, 100, 365].map((d) => (
                          <option key={d} value={d}>
                            {d} días
                          </option>
                        ))}
                      </select>
                    </div>
                  ) : borrador.retoTipo === 'semanas52' ? (
                    <div className="field">
                      <label htmlFor="reto-inicio">Empieza</label>
                      <input
                        id="reto-inicio"
                        type="date"
                        value={borrador.retoInicio}
                        onChange={(e) => setBorrador({ ...borrador, retoInicio: e.target.value })}
                      />
                    </div>
                  ) : null}
                </div>
                {borrador.retoTipo === 'diario' && (
                  <div className="field">
                    <label htmlFor="reto-inicio-d">Empieza</label>
                    <input
                      id="reto-inicio-d"
                      type="date"
                      value={borrador.retoInicio}
                      onChange={(e) => setBorrador({ ...borrador, retoInicio: e.target.value })}
                    />
                  </div>
                )}
                {borrador.retoTipo !== 'monedas' && Number(borrador.retoMonto) > 0 && (
                  <p className="texto-suave">
                    Si lo cumples completo juntas{' '}
                    <strong>
                      {formatearMoneda(
                        borrador.retoTipo === 'semanas52'
                          ? Number(borrador.retoMonto) * 1378
                          : Number(borrador.retoMonto) * Number(borrador.retoDuracion),
                      )}
                    </strong>
                    .
                  </p>
                )}
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

      {/* ---------- Echar ---------- */}
      <Modal abierto={echar !== null} titulo={echar?.titulo ?? ''} icono="piggy bank" tamano="tiny" onCerrar={() => setEchar(null)}>
        {echar && (
          <form className={`ui form ${error ? 'error' : ''}`} onSubmit={guardarEchar}>
            <div className="field required">
              <label htmlFor="echar-monto">Monto</label>
              <div className="ui left labeled input">
                <span className="ui basic label">S/</span>
                <input
                  id="echar-monto"
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="0.01"
                  value={echar.monto}
                  onChange={(e) => setEchar({ ...echar, monto: e.target.value })}
                  autoFocus
                  required
                />
              </div>
            </div>
            {echar.chanchito.tipo === 'cuenta' && (
              <div className="field required">
                <label htmlFor="echar-cuenta">¿De qué cuenta sale?</label>
                <select
                  id="echar-cuenta"
                  className="ui dropdown"
                  value={echar.cuentaId}
                  onChange={(e) => setEchar({ ...echar, cuentaId: e.target.value })}
                >
                  {operativas.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nombre} ({formatearMoneda(saldosCuentas.get(c.id) ?? 0)})
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div className="field">
              <label htmlFor="echar-nota">Nota (opcional)</label>
              <input
                id="echar-nota"
                value={echar.nota}
                maxLength={80}
                onChange={(e) => setEchar({ ...echar, nota: e.target.value })}
              />
            </div>
            {error && (
              <div className="ui error message">
                <p>{error}</p>
              </div>
            )}
            <div className="acciones-formulario">
              <button type="button" className="ui basic button" onClick={() => setEchar(null)}>
                Cancelar
              </button>
              <button type="submit" className={`ui primary button ${guardando ? 'loading' : ''}`} disabled={guardando}>
                <i className="piggy bank icon" />
                Echar al chanchito
              </button>
            </div>
          </form>
        )}
      </Modal>

      {/* ---------- Sacar / romper ---------- */}
      <Modal
        abierto={sacar !== null}
        titulo={sacar ? `${sacar.romper ? 'Romper' : 'Sacar de'} "${sacar.chanchito.nombre}"` : ''}
        icono={sacar?.romper ? 'hammer' : 'minus circle'}
        tamano="tiny"
        onCerrar={() => setSacar(null)}
      >
        {sacar && (
          <form className={`ui form ${error ? 'error' : ''}`} onSubmit={guardarSacar}>
            <p>
              Hay <strong>{formatearMoneda(sacar.saldo)}</strong> en el chanchito.
            </p>
            <div className="field required">
              <label htmlFor="sacar-monto">Monto</label>
              <div className="ui left labeled input">
                <span className="ui basic label">S/</span>
                <input
                  id="sacar-monto"
                  type="number"
                  inputMode="decimal"
                  min="0"
                  max={sacar.saldo}
                  step="0.01"
                  value={sacar.monto}
                  readOnly={sacar.romper}
                  onChange={(e) => setSacar({ ...sacar, monto: e.target.value })}
                  autoFocus={!sacar.romper}
                  required
                />
              </div>
            </div>
            <div className="field">
              <label htmlFor="sacar-destino">¿A dónde va?</label>
              <select
                id="sacar-destino"
                className="ui dropdown"
                value={sacar.destino}
                onChange={(e) => setSacar({ ...sacar, destino: e.target.value as TipoDestino })}
              >
                <option value="cuenta">A una de mis cuentas</option>
                {metas.length > 0 && <option value="meta">A una meta de ahorro</option>}
                {sacar.chanchito.tipo === 'fisico' && <option value="nada">Lo usé (solo sacarlo)</option>}
              </select>
            </div>
            {sacar.destino === 'meta' && (
              <div className="field required">
                <label htmlFor="sacar-meta">Meta</label>
                <select
                  id="sacar-meta"
                  className="ui dropdown"
                  value={sacar.metaId}
                  onChange={(e) => setSacar({ ...sacar, metaId: e.target.value })}
                >
                  {metas.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.nombre}
                    </option>
                  ))}
                </select>
              </div>
            )}
            {(sacar.destino === 'cuenta' || (sacar.destino === 'meta' && sacar.chanchito.tipo === 'cuenta')) && (
              <div className="field required">
                <label htmlFor="sacar-cuenta">
                  {sacar.destino === 'meta' ? '¿En qué cuenta queda el dinero?' : 'Cuenta'}
                </label>
                <select
                  id="sacar-cuenta"
                  className="ui dropdown"
                  value={sacar.cuentaId}
                  onChange={(e) => setSacar({ ...sacar, cuentaId: e.target.value })}
                >
                  {operativas.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nombre}
                    </option>
                  ))}
                </select>
              </div>
            )}
            {sacar.destino === 'cuenta' && sacar.chanchito.tipo === 'fisico' && (
              <div className="field required">
                <label htmlFor="sacar-categoria">Se registra como ingreso en</label>
                <select
                  id="sacar-categoria"
                  className="ui dropdown"
                  value={sacar.categoriaId}
                  onChange={(e) => setSacar({ ...sacar, categoriaId: e.target.value })}
                >
                  {categoriasIngreso.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nombre}
                    </option>
                  ))}
                </select>
                <p className="texto-suave ayuda-campo">
                  El dinero de tu alcancía no estaba en ninguna cuenta: al depositarlo entra como ingreso.
                </p>
              </div>
            )}
            {error && (
              <div className="ui error message">
                <p>{error}</p>
              </div>
            )}
            <div className="acciones-formulario">
              <button type="button" className="ui basic button" onClick={() => setSacar(null)}>
                Cancelar
              </button>
              <button type="submit" className={`ui primary button ${guardando ? 'loading' : ''}`} disabled={guardando}>
                <i className={`${sacar.romper ? 'hammer' : 'check'} icon`} />
                {sacar.romper ? 'Romper chanchito' : 'Sacar'}
              </button>
            </div>
          </form>
        )}
      </Modal>

      {/* ---------- Historial ---------- */}
      <Modal
        abierto={historial !== null}
        titulo={historial ? `Historial de "${historial.nombre}"` : ''}
        icono="history"
        tamano="tiny"
        onCerrar={() => setHistorial(null)}
      >
        {historial &&
          (() => {
            const lista = historialChanchito(historial, transacciones)
            return lista.length === 0 ? (
              <p className="texto-suave">Todavía no hay movimientos.</p>
            ) : (
              <div className="historial-aportes">
                {lista.slice(0, 50).map((m) => (
                  <div key={m.id} className="fila-aporte">
                    <span>
                      {formatearFecha(m.fecha)}
                      {m.nota ? ` · ${m.nota}` : ''}
                    </span>
                    <strong className={m.monto < 0 ? 'texto-gasto' : 'texto-ingreso'}>
                      {m.monto < 0 ? '-' : '+'}
                      {formatearMoneda(Math.abs(m.monto))}
                    </strong>
                  </div>
                ))}
              </div>
            )
          })()}
      </Modal>

      {/* ---------- Eliminar ---------- */}
      <Modal
        abierto={eliminando !== null}
        titulo={`¿Eliminar "${eliminando?.nombre ?? ''}"?`}
        icono="trash alternate outline"
        tamano="tiny"
        onCerrar={() => setEliminando(null)}
      >
        {eliminando && (
          <>
            {saldo(eliminando) > 0.004 ? (
              <p>
                Todavía tiene <strong>{formatearMoneda(saldo(eliminando))}</strong>. Primero rómpelo para
                sacar el dinero.
              </p>
            ) : eliminando.tipo === 'cuenta' ? (
              <p>
                Si ya tuvo movimientos se <strong>archivará</strong> (así no cambia el historial de tus
                cuentas); si nunca se usó, se borra.
              </p>
            ) : (
              <p>Se borrará el chanchito y su historial.</p>
            )}
            {error && (
              <div className="ui visible error message">
                <p>{error}</p>
              </div>
            )}
            <div className="acciones-formulario">
              <button type="button" className="ui basic button" onClick={() => setEliminando(null)}>
                Cancelar
              </button>
              {saldo(eliminando) > 0.004 ? (
                <button
                  type="button"
                  className="ui primary button"
                  onClick={() => {
                    const c = eliminando
                    setEliminando(null)
                    abrirSacar(c, true)
                  }}
                >
                  <i className="hammer icon" />
                  Romperlo
                </button>
              ) : (
                <button
                  type="button"
                  className="ui red button"
                  onClick={() =>
                    void ejecutar(
                      async () => {
                        const r = await eliminarChanchito(eliminando, saldo(eliminando))
                        avisar(r === 'archivado' ? 'Chanchito archivado' : 'Chanchito eliminado', 'info')
                      },
                      () => setEliminando(null),
                    )
                  }
                >
                  <i className="trash icon" />
                  Eliminar
                </button>
              )}
            </div>
          </>
        )}
      </Modal>
    </>
  )
}

export default PanelChanchitos
