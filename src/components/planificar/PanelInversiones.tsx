import { useMemo, useState, type FormEvent } from 'react'
import { useAvisos } from '../../hooks/useAvisos'
import { COLORES_CATEGORIA } from '../../services/categoriaService'
import {
  actualizarInversion,
  actualizarPrecio,
  archivarInversion,
  crearInversion,
  eliminarInversion,
  eliminarOperacion,
  guardarOperacion,
} from '../../services/inversionService'
import type { Inversion, Moneda, OperacionInversion, TipoInversion, TipoOperacion } from '../../types'
import type { ResumenCategoria } from '../../utils/analisis'
import {
  fechaDesdeInput,
  fechaParaInput,
  formatearEn,
  formatearFecha,
  formatearMoneda,
  formatearPorcentaje,
  formatearPrecio,
} from '../../utils/formato'
import {
  cantidadAlDia,
  estadoInversion,
  formatearCantidad,
  infoTipoInversion,
  ordenarOperaciones,
  resumenPortafolio,
  TIPOS_INVERSION,
} from '../../utils/inversiones'
import { guardarTipoCambio, leerTipoCambio } from '../../utils/preferencias'
import GraficoDona from '../graficos/GraficoDona'
import Ilustracion from '../Ilustracion'
import Modal from '../Modal'

interface PanelInversionesProps {
  usuarioId: string
  inversiones: Inversion[]
}

interface BorradorInversion {
  id?: string
  nombre: string
  simbolo: string
  tipo: TipoInversion
  moneda: Moneda
  broker: string
  color: string
  // Primera compra (solo al crear, opcional)
  cantidad: string
  precio: string
  comision: string
  fecha: string
}

interface BorradorOperacion {
  inversion: Inversion
  id?: string
  tipo: TipoOperacion
  fecha: string
  cantidad: string
  precio: string
  comision: string
  nota: string
}

const TITULO_OPERACION: Record<TipoOperacion, string> = {
  compra: 'Comprar',
  venta: 'Vender',
  dividendo: 'Registrar dividendo',
}

const num = (s: string) => (s.trim() === '' ? NaN : Number(s.replace(',', '.')))

/** Ganancia con signo y color (verde si gana, rojo si pierde). */
function Ganancia({ monto, moneda, porcentaje }: { monto: number; moneda: Moneda; porcentaje?: number | null }) {
  const clase = monto > 0.005 ? 'texto-ingreso' : monto < -0.005 ? 'texto-gasto' : 'texto-suave'
  return (
    <span className={clase}>
      {monto > 0.005 && '+'}
      {monto < -0.005 && '−'}
      {formatearEn(Math.abs(monto), moneda)}
      {porcentaje !== undefined && porcentaje !== null && (
        <small>
          {' '}
          ({monto < -0.005 ? '−' : monto > 0.005 ? '+' : ''}
          {formatearPorcentaje(Math.abs(porcentaje))})
        </small>
      )}
    </span>
  )
}

/**
 * Planificar → Inversiones: portafolio de acciones, ETF, fondos, bonos o
 * cripto. Como las metas, no mueve el saldo de tus cuentas.
 */
function PanelInversiones({ usuarioId, inversiones }: PanelInversionesProps) {
  const { avisar } = useAvisos()
  const [tipoCambio, setTipoCambio] = useState(leerTipoCambio)
  const [editandoCambio, setEditandoCambio] = useState(false)
  const [borrador, setBorrador] = useState<BorradorInversion | null>(null)
  const [operacion, setOperacion] = useState<BorradorOperacion | null>(null)
  const [precio, setPrecio] = useState<{ inversion: Inversion; valor: string } | null>(null)
  const [historial, setHistorial] = useState<Inversion | null>(null)
  const [eliminando, setEliminando] = useState<Inversion | null>(null)
  const [verArchivadas, setVerArchivadas] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)

  const activas = inversiones.filter((i) => !i.archivada)
  const archivadas = inversiones.filter((i) => i.archivada)
  const resumen = useMemo(() => resumenPortafolio(inversiones, tipoCambio), [inversiones, tipoCambio])
  // Mayor valor primero; las ya vendidas del todo, al final.
  const ordenadas = useMemo(
    () =>
      [...activas].sort((a, b) => {
        const fa = a.moneda === 'USD' ? tipoCambio : 1
        const fb = b.moneda === 'USD' ? tipoCambio : 1
        return estadoInversion(b).valorActual * fb - estadoInversion(a).valorActual * fa
      }),
    [activas, tipoCambio],
  )
  const reparto: ResumenCategoria[] = useMemo(() => {
    const total = resumen.porTipo.reduce((s, t) => s + t.valor, 0)
    return resumen.porTipo.map((t, i) => {
      const info = infoTipoInversion(t.tipo)
      return {
        categoriaId: t.tipo,
        nombre: info.etiqueta,
        icono: info.icono,
        color: COLORES_CATEGORIA[i % COLORES_CATEGORIA.length],
        total: t.valor,
        cantidad: activas.filter((a) => a.tipo === t.tipo).length,
        porcentaje: total > 0 ? t.valor / total : 0,
      }
    })
  }, [resumen, activas])

  // Si el historial abierto cambió (se borró una operación), se refresca.
  const historialActual = historial ? (inversiones.find((i) => i.id === historial.id) ?? null) : null

  async function ejecutar(accion: () => Promise<void>, exito: string, alTerminar: () => void) {
    setGuardando(true)
    setError(null)
    try {
      await accion()
      avisar(exito)
      alTerminar()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar.')
    } finally {
      setGuardando(false)
    }
  }

  function abrir(inv?: Inversion) {
    setError(null)
    setBorrador(
      inv
        ? {
            id: inv.id,
            nombre: inv.nombre,
            simbolo: inv.simbolo ?? '',
            tipo: inv.tipo,
            moneda: inv.moneda,
            broker: inv.broker ?? '',
            color: inv.color,
            cantidad: '',
            precio: '',
            comision: '',
            fecha: fechaParaInput(),
          }
        : {
            nombre: '',
            simbolo: '',
            tipo: 'accion',
            moneda: 'USD',
            broker: '',
            color: COLORES_CATEGORIA[inversiones.length % COLORES_CATEGORIA.length],
            cantidad: '',
            precio: '',
            comision: '',
            fecha: fechaParaInput(),
          },
    )
  }

  function abrirOperacion(inversion: Inversion, tipo: TipoOperacion, op?: OperacionInversion) {
    setError(null)
    setOperacion(
      op
        ? {
            inversion,
            id: op.id,
            tipo: op.tipo,
            fecha: fechaParaInput(op.fecha),
            cantidad: op.tipo === 'dividendo' ? '' : String(op.cantidad),
            precio: String(op.precio),
            comision: op.comision ? String(op.comision) : '',
            nota: op.nota ?? '',
          }
        : {
            inversion,
            tipo,
            fecha: fechaParaInput(),
            cantidad: '',
            // Compra/venta: sugiere el último precio conocido.
            precio: tipo === 'dividendo' ? '' : inversion.precioActual ? String(inversion.precioActual) : '',
            comision: '',
            nota: '',
          },
    )
  }

  function guardarInversion(e: FormEvent) {
    e.preventDefault()
    if (!borrador) return
    const datos = {
      nombre: borrador.nombre,
      simbolo: borrador.simbolo,
      tipo: borrador.tipo,
      moneda: borrador.moneda,
      broker: borrador.broker,
      color: borrador.color,
    }
    const conCompra = !borrador.id && (borrador.cantidad.trim() !== '' || borrador.precio.trim() !== '')
    void ejecutar(
      async () => {
        if (borrador.id) return actualizarInversion(borrador.id, datos)
        await crearInversion(
          datos,
          usuarioId,
          conCompra
            ? {
                fecha: fechaDesdeInput(borrador.fecha),
                cantidad: num(borrador.cantidad),
                precio: num(borrador.precio),
                comision: borrador.comision ? num(borrador.comision) : undefined,
              }
            : undefined,
        )
      },
      borrador.id ? 'Inversión actualizada' : 'Inversión agregada',
      () => setBorrador(null),
    )
  }

  function guardarOp(e: FormEvent) {
    e.preventDefault()
    if (!operacion) return
    const op = operacion
    void ejecutar(
      () =>
        guardarOperacion(op.inversion.id, {
          id: op.id,
          tipo: op.tipo,
          // Al editar se conserva la hora original (ordena operaciones del mismo día).
          fecha: fechaDesdeInput(op.fecha, op.inversion.operaciones.find((o) => o.id === op.id)?.fecha),
          cantidad: op.tipo === 'dividendo' ? 0 : num(op.cantidad),
          precio: num(op.precio),
          comision: op.comision ? num(op.comision) : undefined,
          nota: op.nota,
        }),
      op.id ? 'Operación actualizada' : op.tipo === 'compra' ? 'Compra registrada' : op.tipo === 'venta' ? 'Venta registrada' : 'Dividendo registrado',
      () => setOperacion(null),
    )
  }

  function guardarPrecio(e: FormEvent) {
    e.preventDefault()
    if (!precio) return
    const p = precio
    void ejecutar(() => actualizarPrecio(p.inversion.id, num(p.valor)), 'Precio actualizado', () => setPrecio(null))
  }

  // Total de la operación en el formulario (para revisar antes de guardar).
  const totalOperacion = operacion
    ? operacion.tipo === 'dividendo'
      ? num(operacion.precio)
      : num(operacion.cantidad) * num(operacion.precio) +
        (operacion.tipo === 'compra' ? 1 : -1) * (operacion.comision ? num(operacion.comision) : 0)
    : NaN
  const disponibleVenta =
    operacion?.tipo === 'venta'
      ? cantidadAlDia(operacion.inversion, fechaDesdeInput(operacion.fecha, new Date()), operacion.id)
      : 0

  const tarjeta = (inv: Inversion) => {
    const e = estadoInversion(inv)
    const info = infoTipoInversion(inv.tipo)
    const vendida = e.cantidad === 0
    return (
      <div key={inv.id} className={`ui segment tarjeta-meta tarjeta-inversion ${vendida ? 'vendida' : ''}`}>
        <div className="cabecera">
          <span className="icono-circulo" style={{ background: inv.color }}>
            <i className={`${info.icono} icon`} />
          </span>
          <div className="titulo">
            <strong>
              {inv.nombre}
              {inv.simbolo && <span className="simbolo-inversion">{inv.simbolo}</span>}
            </strong>
            <span>
              {info.etiqueta}
              {inv.broker ? ` · ${inv.broker}` : ''}
              {inv.moneda === 'USD' ? ' · en dólares' : ''}
            </span>
          </div>
          <div className="ui mini basic icon buttons">
            <button type="button" className="ui button" title="Historial" aria-label="Historial" onClick={() => setHistorial(inv)}>
              <i className="history icon" />
            </button>
            <button type="button" className="ui button" title="Editar" aria-label="Editar" onClick={() => abrir(inv)}>
              <i className="pencil alternate icon" />
            </button>
            <button type="button" className="ui button" title="Eliminar" aria-label="Eliminar" onClick={() => setEliminando(inv)}>
              <i className="trash alternate outline icon" />
            </button>
          </div>
        </div>

        {vendida ? (
          <div className="cifras-meta">
            <span className="texto-suave">Ya vendiste todo · resultado</span>
            <strong>
              <Ganancia monto={e.gananciaTotal} moneda={inv.moneda} porcentaje={e.rentabilidad} />
            </strong>
          </div>
        ) : (
          <>
            <div className="cifras-meta">
              <strong>{formatearEn(e.valorActual, inv.moneda)}</strong>
              <span className="texto-suave">
                {formatearCantidad(e.cantidad)} × {formatearPrecio(e.precio, inv.moneda)}
              </span>
            </div>
            <div className="linea-inversion">
              <span className="texto-suave">Ganancia</span>
              <strong>
                <Ganancia monto={e.gananciaNoRealizada} moneda={inv.moneda} porcentaje={e.rentabilidadPosicion} />
              </strong>
            </div>
            <div className="linea-inversion texto-suave">
              <span>Costo promedio {formatearPrecio(e.costoPromedio, inv.moneda)}</span>
              <span>Invertido {formatearEn(e.invertido, inv.moneda)}</span>
            </div>
          </>
        )}
        {(e.gananciaRealizada !== 0 || e.dividendos > 0) && !vendida && (
          <div className="linea-inversion texto-suave">
            {e.gananciaRealizada !== 0 && (
              <span>
                En ventas: <Ganancia monto={e.gananciaRealizada} moneda={inv.moneda} />
              </span>
            )}
            {e.dividendos > 0 && (
              <span>
                Dividendos: <span className="texto-ingreso">+{formatearEn(e.dividendos, inv.moneda)}</span>
              </span>
            )}
          </div>
        )}

        {!vendida && (
          <button
            type="button"
            className="enlace-sugerencia precio-inversion"
            onClick={() => {
              setError(null)
              setPrecio({ inversion: inv, valor: e.precio ? String(e.precio) : '' })
            }}
          >
            <i className="sync alternate icon" />
            {e.precioEstimado
              ? 'Precio de tu última operación · actualizar'
              : `Precio del ${formatearFecha(inv.fechaPrecio!)} · actualizar`}
          </button>
        )}

        <div className="acciones-meta">
          <button type="button" className="ui small primary button" onClick={() => abrirOperacion(inv, 'compra')}>
            <i className="plus icon" />
            Comprar
          </button>
          {!vendida && (
            <button type="button" className="ui small basic button" onClick={() => abrirOperacion(inv, 'venta')}>
              <i className="minus icon" />
              Vender
            </button>
          )}
          <button type="button" className="ui small basic button" onClick={() => abrirOperacion(inv, 'dividendo')}>
            <i className="hand holding usd icon" />
            Dividendo
          </button>
        </div>
      </div>
    )
  }

  return (
    <>
      <div className="barra-filtros">
        <div className="resumen-linea">
          Tu portafolio: <strong>{formatearMoneda(resumen.valorActual)}</strong>
        </div>
        <button type="button" className="ui primary button" onClick={() => abrir()}>
          <i className="plus icon" />
          Nueva inversión
        </button>
      </div>

      {inversiones.length === 0 ? (
        <div className="ui segment estado-vacio">
          <Ilustracion nombre="graficos" />
          <p>
            <strong>Lleva tus inversiones en bolsa</strong>
            <br />
            Anota tus acciones, ETF, fondos mutuos, bonos o cripto: cuánto compraste, a qué precio, los
            dividendos que cobras y cuánto vas ganando.
          </p>
          <button type="button" className="ui primary button" onClick={() => abrir()}>
            <i className="plus icon" />
            Agregar mi primera inversión
          </button>
        </div>
      ) : (
        <>
          <div className="rejilla-kpi">
            <div className="kpi ui segment">
              <span className="etiqueta">
                <i className="chartline icon" />
                Valor hoy
              </span>
              <strong>{formatearMoneda(resumen.valorActual)}</strong>
              <span className="nota">Invertido {formatearMoneda(resumen.invertido)}</span>
            </div>
            <div className="kpi ui segment">
              <span className="etiqueta">
                <i className="balance scale icon" />
                Ganancia
              </span>
              <strong>
                <Ganancia monto={resumen.gananciaNoRealizada} moneda="PEN" />
              </strong>
              <span className="nota">
                {resumen.rentabilidadPosicion !== null
                  ? `${resumen.rentabilidadPosicion >= 0 ? '+' : '−'}${formatearPorcentaje(Math.abs(resumen.rentabilidadPosicion))} sobre lo invertido`
                  : 'Sin posiciones abiertas'}
              </span>
            </div>
            <div className="kpi ui segment">
              <span className="etiqueta">
                <i className="hand holding usd icon" />
                Dividendos
              </span>
              <strong className={resumen.dividendos > 0 ? 'texto-ingreso' : ''}>{formatearMoneda(resumen.dividendos)}</strong>
              <span className="nota">Cobrados en total</span>
            </div>
            <div className="kpi ui segment">
              <span className="etiqueta">
                <i className="exchange icon" />
                En ventas
              </span>
              <strong>
                <Ganancia monto={resumen.gananciaRealizada} moneda="PEN" />
              </strong>
              <span className="nota">Ganancia ya realizada</span>
            </div>
          </div>

          <p className="texto-suave nota-formulario">
            <i className="info circle icon" />
            No mueve el saldo de tus cuentas: si pagaste desde el banco, registra una transferencia o un gasto aparte.
            {resumen.conDolares && (
              <>
                {' '}
                Lo que está en dólares se convierte a{' '}
                {editandoCambio ? (
                  <input
                    className="entrada-cambio"
                    type="number"
                    inputMode="decimal"
                    step="0.001"
                    min="0.1"
                    aria-label="Tipo de cambio"
                    defaultValue={tipoCambio}
                    autoFocus
                    onBlur={(e) => {
                      const v = Number(e.target.value)
                      if (Number.isFinite(v) && v > 0) {
                        setTipoCambio(v)
                        guardarTipoCambio(v)
                      }
                      setEditandoCambio(false)
                    }}
                    onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
                  />
                ) : (
                  <button type="button" className="enlace-sugerencia en-linea" onClick={() => setEditandoCambio(true)}>
                    S/ {tipoCambio.toFixed(3)} por dólar
                  </button>
                )}
                .
              </>
            )}
          </p>

          {reparto.length > 1 && (
            <div className="ui segment">
              <h3 className="ui header">
                <i className="chart pie icon" />
                <div className="content">
                  ¿En qué está tu dinero?
                  <div className="sub header">Valor de hoy por tipo de instrumento</div>
                </div>
              </h3>
              <GraficoDona datos={reparto} titulo="Portafolio" />
            </div>
          )}

          <div className="rejilla-metas">{ordenadas.map(tarjeta)}</div>

          {archivadas.length > 0 && (
            <div className="archivadas-inversion">
              <button type="button" className="enlace-sugerencia" onClick={() => setVerArchivadas(!verArchivadas)}>
                <i className={`${verArchivadas ? 'angle up' : 'angle down'} icon`} />
                Archivadas ({archivadas.length})
              </button>
              {verArchivadas && (
                <div className="lista-archivadas">
                  {archivadas.map((inv) => {
                    const e = estadoInversion(inv)
                    return (
                      <div key={inv.id} className="fila-compartida">
                        <span>
                          <strong>{inv.nombre}</strong>{' '}
                          <Ganancia monto={e.gananciaTotal} moneda={inv.moneda} porcentaje={e.rentabilidad} />
                        </span>
                        <button type="button" className="ui mini basic button" onClick={() => void archivarInversion(inv, false)}>
                          Restaurar
                        </button>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* ---------- Nueva / editar inversión ---------- */}
      <Modal
        abierto={borrador !== null}
        titulo={borrador?.id ? 'Editar inversión' : 'Nueva inversión'}
        icono="chartline"
        onCerrar={() => setBorrador(null)}
      >
        {borrador && (
          <form className={`ui form ${error ? 'error' : ''}`} onSubmit={guardarInversion}>
            <div className="two fields">
              <div className="field required">
                <label htmlFor="inv-nombre">Nombre</label>
                <input
                  id="inv-nombre"
                  value={borrador.nombre}
                  maxLength={60}
                  placeholder="Ej. Apple, S&P 500, Bitcoin"
                  onChange={(e) => setBorrador({ ...borrador, nombre: e.target.value })}
                  autoFocus
                  required
                />
              </div>
              <div className="field">
                <label htmlFor="inv-simbolo">Símbolo (opcional)</label>
                <input
                  id="inv-simbolo"
                  value={borrador.simbolo}
                  maxLength={15}
                  placeholder="AAPL, VOO, BTC"
                  onChange={(e) => setBorrador({ ...borrador, simbolo: e.target.value.toUpperCase() })}
                />
              </div>
            </div>
            <div className="field">
              <label>Tipo</label>
              <div className="selector-tipo-cuenta">
                {TIPOS_INVERSION.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    aria-pressed={borrador.tipo === t.id}
                    className={`ui button ${borrador.tipo === t.id ? 'primary' : 'basic'}`}
                    onClick={() => setBorrador({ ...borrador, tipo: t.id })}
                  >
                    <i className={`${t.icono} icon`} />
                    {t.etiqueta}
                  </button>
                ))}
              </div>
            </div>
            <div className="two fields">
              <div className="field">
                <label>Moneda</label>
                <div className="ui fluid buttons">
                  {(['USD', 'PEN'] as Moneda[]).map((m) => (
                    <button
                      key={m}
                      type="button"
                      aria-pressed={borrador.moneda === m}
                      className={`ui button ${borrador.moneda === m ? 'primary' : 'basic'}`}
                      onClick={() => setBorrador({ ...borrador, moneda: m })}
                      disabled={!!borrador.id && inversiones.find((i) => i.id === borrador.id)!.operaciones.length > 0 && borrador.moneda !== m}
                    >
                      {m === 'USD' ? 'Dólares (US$)' : 'Soles (S/)'}
                    </button>
                  ))}
                </div>
              </div>
              <div className="field">
                <label htmlFor="inv-broker">Broker o app (opcional)</label>
                <input
                  id="inv-broker"
                  value={borrador.broker}
                  maxLength={40}
                  placeholder="Ej. Hapi, Trii, Interactive Brokers"
                  onChange={(e) => setBorrador({ ...borrador, broker: e.target.value })}
                />
              </div>
            </div>

            {!borrador.id && (
              <fieldset className="primera-compra">
                <legend>Tu compra (opcional; puedes agregar más después)</legend>
                <div className="three fields">
                  <div className="field">
                    <label htmlFor="inv-cantidad">Cantidad</label>
                    <input
                      id="inv-cantidad"
                      type="number"
                      inputMode="decimal"
                      min="0"
                      step="any"
                      placeholder="Ej. 10"
                      value={borrador.cantidad}
                      onChange={(e) => setBorrador({ ...borrador, cantidad: e.target.value })}
                    />
                  </div>
                  <div className="field">
                    <label htmlFor="inv-precio">Precio por unidad</label>
                    <div className="ui left labeled input">
                      <span className="ui basic label">{borrador.moneda === 'USD' ? 'US$' : 'S/'}</span>
                      <input
                        id="inv-precio"
                        type="number"
                        inputMode="decimal"
                        min="0"
                        step="any"
                        value={borrador.precio}
                        onChange={(e) => setBorrador({ ...borrador, precio: e.target.value })}
                      />
                    </div>
                  </div>
                  <div className="field">
                    <label htmlFor="inv-comision">Comisión</label>
                    <input
                      id="inv-comision"
                      type="number"
                      inputMode="decimal"
                      min="0"
                      step="any"
                      placeholder="0"
                      value={borrador.comision}
                      onChange={(e) => setBorrador({ ...borrador, comision: e.target.value })}
                    />
                  </div>
                </div>
                <div className="field">
                  <label htmlFor="inv-fecha">Fecha de compra</label>
                  <input
                    id="inv-fecha"
                    type="date"
                    value={borrador.fecha}
                    max={fechaParaInput()}
                    onChange={(e) => setBorrador({ ...borrador, fecha: e.target.value })}
                  />
                </div>
              </fieldset>
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

      {/* ---------- Compra / venta / dividendo ---------- */}
      <Modal
        abierto={operacion !== null}
        titulo={operacion ? `${operacion.id ? 'Editar: ' : ''}${TITULO_OPERACION[operacion.tipo]} · ${operacion.inversion.nombre}` : ''}
        icono={operacion?.tipo === 'venta' ? 'minus circle' : operacion?.tipo === 'dividendo' ? 'hand holding usd' : 'plus circle'}
        tamano="tiny"
        onCerrar={() => setOperacion(null)}
      >
        {operacion && (
          <form className={`ui form ${error ? 'error' : ''}`} onSubmit={guardarOp}>
            {operacion.tipo !== 'dividendo' && (
              <div className="field required">
                <label htmlFor="op-cantidad">Cantidad</label>
                <input
                  id="op-cantidad"
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="any"
                  value={operacion.cantidad}
                  onChange={(e) => setOperacion({ ...operacion, cantidad: e.target.value })}
                  autoFocus
                  required
                />
                {operacion.tipo === 'venta' && (
                  <button
                    type="button"
                    className="enlace-sugerencia"
                    onClick={() => setOperacion({ ...operacion, cantidad: String(disponibleVenta) })}
                  >
                    Vender todo ({formatearCantidad(disponibleVenta)})
                  </button>
                )}
              </div>
            )}
            <div className="field required">
              <label htmlFor="op-precio">{operacion.tipo === 'dividendo' ? 'Monto cobrado' : 'Precio por unidad'}</label>
              <div className="ui left labeled input">
                <span className="ui basic label">{operacion.inversion.moneda === 'USD' ? 'US$' : 'S/'}</span>
                <input
                  id="op-precio"
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="any"
                  value={operacion.precio}
                  onChange={(e) => setOperacion({ ...operacion, precio: e.target.value })}
                  autoFocus={operacion.tipo === 'dividendo'}
                  required
                />
              </div>
            </div>
            <div className="two fields">
              {operacion.tipo !== 'dividendo' && (
                <div className="field">
                  <label htmlFor="op-comision">Comisión</label>
                  <input
                    id="op-comision"
                    type="number"
                    inputMode="decimal"
                    min="0"
                    step="any"
                    placeholder="0"
                    value={operacion.comision}
                    onChange={(e) => setOperacion({ ...operacion, comision: e.target.value })}
                  />
                </div>
              )}
              <div className="field">
                <label htmlFor="op-fecha">Fecha</label>
                <input
                  id="op-fecha"
                  type="date"
                  value={operacion.fecha}
                  max={fechaParaInput()}
                  onChange={(e) => setOperacion({ ...operacion, fecha: e.target.value })}
                />
              </div>
            </div>
            <div className="field">
              <label htmlFor="op-nota">Nota (opcional)</label>
              <input
                id="op-nota"
                value={operacion.nota}
                maxLength={80}
                onChange={(e) => setOperacion({ ...operacion, nota: e.target.value })}
              />
            </div>
            {Number.isFinite(totalOperacion) && totalOperacion > 0 && (
              <p className="total-operacion">
                {operacion.tipo === 'compra' ? 'Pagas' : 'Recibes'}{' '}
                <strong>{formatearEn(totalOperacion, operacion.inversion.moneda)}</strong>
                {operacion.inversion.moneda === 'USD' && (
                  <span className="texto-suave"> ≈ {formatearMoneda(totalOperacion * tipoCambio)}</span>
                )}
              </p>
            )}
            {error && (
              <div className="ui error message">
                <p>{error}</p>
              </div>
            )}
            <div className="acciones-formulario">
              <button type="button" className="ui basic button" onClick={() => setOperacion(null)}>
                Cancelar
              </button>
              <button type="submit" className={`ui primary button ${guardando ? 'loading' : ''}`} disabled={guardando}>
                <i className="check icon" />
                {operacion.id ? 'Guardar' : TITULO_OPERACION[operacion.tipo]}
              </button>
            </div>
          </form>
        )}
      </Modal>

      {/* ---------- Actualizar precio ---------- */}
      <Modal
        abierto={precio !== null}
        titulo={precio ? `Precio de hoy · ${precio.inversion.nombre}` : ''}
        icono="sync alternate"
        tamano="tiny"
        onCerrar={() => setPrecio(null)}
      >
        {precio && (
          <form className={`ui form ${error ? 'error' : ''}`} onSubmit={guardarPrecio}>
            <div className="field required">
              <label htmlFor="precio-actual">Precio por unidad (míralo en tu app del broker)</label>
              <div className="ui left labeled input">
                <span className="ui basic label">{precio.inversion.moneda === 'USD' ? 'US$' : 'S/'}</span>
                <input
                  id="precio-actual"
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="any"
                  value={precio.valor}
                  onChange={(e) => setPrecio({ ...precio, valor: e.target.value })}
                  autoFocus
                  required
                />
              </div>
            </div>
            {Number.isFinite(num(precio.valor)) && num(precio.valor) > 0 && (
              <p className="total-operacion">
                Tu posición valdría{' '}
                <strong>
                  {formatearEn(estadoInversion(precio.inversion).cantidad * num(precio.valor), precio.inversion.moneda)}
                </strong>
              </p>
            )}
            {error && (
              <div className="ui error message">
                <p>{error}</p>
              </div>
            )}
            <div className="acciones-formulario">
              <button type="button" className="ui basic button" onClick={() => setPrecio(null)}>
                Cancelar
              </button>
              <button type="submit" className={`ui primary button ${guardando ? 'loading' : ''}`} disabled={guardando}>
                <i className="check icon" />
                Actualizar
              </button>
            </div>
          </form>
        )}
      </Modal>

      {/* ---------- Historial ---------- */}
      <Modal
        abierto={historialActual !== null}
        titulo={historialActual ? `Historial · ${historialActual.nombre}` : ''}
        icono="history"
        onCerrar={() => setHistorial(null)}
      >
        {historialActual &&
          (historialActual.operaciones.length === 0 ? (
            <p className="texto-suave">Aún no registraste compras, ventas ni dividendos.</p>
          ) : (
            <div className="tabla-desplazable">
              <table className="ui very basic compact unstackable table tabla-compacta">
                <thead>
                  <tr>
                    <th>Fecha</th>
                    <th>Operación</th>
                    <th className="right aligned">Total</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {ordenarOperaciones(historialActual.operaciones)
                    .reverse()
                    .map((op) => {
                      const m = historialActual.moneda
                      const total =
                        op.tipo === 'dividendo'
                          ? op.precio
                          : op.cantidad * op.precio + (op.tipo === 'compra' ? 1 : -1) * (op.comision ?? 0)
                      return (
                        <tr key={op.id}>
                          <td>{formatearFecha(op.fecha)}</td>
                          <td>
                            <strong>{op.tipo === 'compra' ? 'Compra' : op.tipo === 'venta' ? 'Venta' : 'Dividendo'}</strong>
                            {op.tipo !== 'dividendo' && (
                              <div className="texto-suave">
                                {formatearCantidad(op.cantidad)} × {formatearPrecio(op.precio, m)}
                                {op.comision ? ` · comisión ${formatearEn(op.comision, m)}` : ''}
                              </div>
                            )}
                            {op.nota && <div className="texto-suave">{op.nota}</div>}
                          </td>
                          <td className={`right aligned ${op.tipo === 'compra' ? '' : 'texto-ingreso'}`}>
                            {op.tipo === 'compra' ? '−' : '+'}
                            {formatearEn(total, m)}
                          </td>
                          <td className="right aligned">
                            <div className="ui mini basic icon buttons">
                              <button
                                type="button"
                                className="ui button"
                                aria-label="Editar"
                                onClick={() => {
                                  setHistorial(null)
                                  abrirOperacion(historialActual, op.tipo, op)
                                }}
                              >
                                <i className="pencil alternate icon" />
                              </button>
                              <button
                                type="button"
                                className="ui button"
                                aria-label="Eliminar"
                                onClick={() =>
                                  void eliminarOperacion(historialActual.id, op.id)
                                    .then(() => avisar('Operación eliminada', 'info'))
                                    .catch((e: Error) => avisar(e.message, 'error'))
                                }
                              >
                                <i className="trash alternate outline icon" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                </tbody>
              </table>
            </div>
          ))}
      </Modal>

      {/* ---------- Eliminar ---------- */}
      <Modal
        abierto={eliminando !== null}
        titulo={`¿Eliminar "${eliminando?.nombre ?? ''}"?`}
        icono="trash alternate outline"
        tamano="tiny"
        onCerrar={() => setEliminando(null)}
      >
        <p>
          Se borrará con todo su historial de compras, ventas y dividendos.
          {eliminando && eliminando.operaciones.length > 0 && ' Si ya la vendiste y quieres conservar el resultado, mejor archívala.'}
        </p>
        <div className="acciones-formulario">
          <button type="button" className="ui basic button" onClick={() => setEliminando(null)}>
            Cancelar
          </button>
          {eliminando && eliminando.operaciones.length > 0 && (
            <button
              type="button"
              className="ui basic button"
              onClick={() => {
                if (eliminando) void archivarInversion(eliminando, true)
                avisar('Inversión archivada', 'info')
                setEliminando(null)
              }}
            >
              <i className="archive icon" />
              Archivar
            </button>
          )}
          <button
            type="button"
            className="ui red button"
            onClick={() => {
              if (eliminando) void eliminarInversion(eliminando)
              avisar('Inversión eliminada', 'info')
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

export default PanelInversiones
