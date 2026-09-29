import { useMemo, useState, type FormEvent } from 'react'
import { useAvisos } from '../../hooks/useAvisos'
import { actualizarCompraCuotas, crearCompraCuotas, eliminarCompraCuotas } from '../../services/cuotaService'
import type { Categoria, CompraCuotas, Cuenta, ModoCuotas, Transaccion } from '../../types'
import { ordenJerarquico } from '../../utils/categorias'
import { estadoTarjeta } from '../../utils/cuentas'
import { estadoCuotas, teaAproximada } from '../../utils/cuotas'
import { fechaDesdeInput, fechaParaInput, formatearFecha, formatearMoneda, formatearPorcentaje } from '../../utils/formato'
import BarraProgreso from '../BarraProgreso'
import Modal from '../Modal'

interface PanelCuotasProps {
  usuarioId: string
  cuotas: CompraCuotas[]
  /** Solo las operativas (sin chanchitos). */
  cuentas: Cuenta[]
  categorias: Categoria[]
  transacciones: Transaccion[]
}

interface Borrador {
  id?: string
  descripcion: string
  cuentaId: string
  categoriaId: string
  montoTotal: string
  numeroCuotas: string
  montoCuota: string
  /** El usuario escribió la cuota (si no, se calcula sin intereses). */
  cuotaEditada: boolean
  fechaCompra: string
  primeraCuota: string
  modo: ModoCuotas
}

const MESES_OPCIONES = [3, 6, 12, 18, 24, 36]

function PanelCuotas({ usuarioId, cuotas, cuentas, categorias, transacciones }: PanelCuotasProps) {
  const { avisar } = useAvisos()
  const [borrador, setBorrador] = useState<Borrador | null>(null)
  const [eliminando, setEliminando] = useState<CompraCuotas | null>(null)
  const [conMovimientos, setConMovimientos] = useState(false)
  const [verTerminadas, setVerTerminadas] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)
  const [hoy] = useState(() => new Date())

  const tarjetas = cuentas.filter((c) => c.tipo === 'tarjeta_credito')
  const cuentasPorId = new Map(cuentas.map((c) => [c.id, c]))
  const categoriasPorId = new Map(categorias.map((c) => [c.id, c]))

  const conEstado = useMemo(
    () =>
      cuotas
        .map((c) => ({ c, e: estadoCuotas(c, hoy) }))
        .sort((a, b) => Number(a.e.completada) - Number(b.e.completada) || (a.e.proxima?.getTime() ?? 0) - (b.e.proxima?.getTime() ?? 0)),
    [cuotas, hoy],
  )
  const activas = conEstado.filter((x) => !x.e.completada)
  const terminadas = conEstado.filter((x) => x.e.completada)
  const pendienteTotal = activas.reduce((s, x) => s + x.e.pendiente, 0)
  const cuotaMensual = activas.reduce((s, x) => s + x.c.montoCuota, 0)
  const interesesTotales = activas.reduce((s, x) => s + x.e.interes, 0)

  function abrir(c?: CompraCuotas) {
    setError(null)
    if (c) {
      setBorrador({
        id: c.id,
        descripcion: c.descripcion,
        cuentaId: c.cuentaId,
        categoriaId: c.categoriaId,
        montoTotal: String(c.montoTotal),
        numeroCuotas: String(c.numeroCuotas),
        montoCuota: String(c.montoCuota),
        cuotaEditada: true,
        fechaCompra: fechaParaInput(c.fechaCompra),
        primeraCuota: fechaParaInput(c.primeraCuota),
        modo: c.modo,
      })
      return
    }
    const cuenta = tarjetas[0] ?? cuentas[0]
    // Primera cuota: el próximo pago de la tarjeta, o dentro de un mes.
    const pago = cuenta ? estadoTarjeta(cuenta, transacciones, hoy).proximoPago : undefined
    const unMes = new Date(hoy.getFullYear(), hoy.getMonth() + 1, hoy.getDate())
    setBorrador({
      descripcion: '',
      cuentaId: cuenta?.id ?? '',
      categoriaId: categorias.find((c) => c.tipo === 'gasto')?.id ?? '',
      montoTotal: '',
      numeroCuotas: '6',
      montoCuota: '',
      cuotaEditada: false,
      fechaCompra: fechaParaInput(hoy),
      primeraCuota: fechaParaInput(pago && pago > hoy ? pago : unMes),
      modo: 'total',
    })
  }

  const total = Number(borrador?.montoTotal)
  const n = Number(borrador?.numeroCuotas)
  const cuotaCalculada = total > 0 && n > 0 ? Math.round((total / n) * 100) / 100 : 0
  const cuota = borrador?.cuotaEditada ? Number(borrador.montoCuota) : cuotaCalculada
  const tea = borrador && total > 0 && n > 1 && cuota > 0 ? teaAproximada({ montoTotal: total, montoCuota: cuota, numeroCuotas: n }) : null

  async function guardar(e: FormEvent) {
    e.preventDefault()
    if (!borrador) return
    setGuardando(true)
    setError(null)
    const datos = {
      descripcion: borrador.descripcion,
      cuentaId: borrador.cuentaId,
      categoriaId: borrador.categoriaId,
      montoTotal: total,
      numeroCuotas: n,
      montoCuota: cuota,
      fechaCompra: fechaDesdeInput(borrador.fechaCompra),
      primeraCuota: fechaDesdeInput(borrador.primeraCuota, new Date(2000, 0, 1, 12)),
      modo: borrador.modo,
    }
    try {
      if (borrador.id) await actualizarCompraCuotas(borrador.id, datos)
      else await crearCompraCuotas(datos, usuarioId)
      avisar(borrador.id ? 'Compra actualizada' : 'Compra en cuotas registrada')
      setBorrador(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar.')
    } finally {
      setGuardando(false)
    }
  }

  function tarjeta(x: { c: CompraCuotas; e: ReturnType<typeof estadoCuotas> }) {
    const { c, e } = x
    const categoria = categoriasPorId.get(c.categoriaId)
    return (
      <div key={c.id} className="ui segment tarjeta-cuotas">
        <div className="cabecera">
          <span className="icono-circulo" style={{ background: categoria?.color ?? '#898781' }}>
            <i className={`${categoria?.icono ?? 'tag'} icon`} />
          </span>
          <div className="detalle">
            <strong>{c.descripcion}</strong>
            <span className="texto-suave">
              {cuentasPorId.get(c.cuentaId)?.nombre ?? '—'} · comprado el {formatearFecha(c.fechaCompra)}
            </span>
          </div>
          <div className="ui mini basic icon buttons">
            <button type="button" className="ui button" aria-label="Editar" onClick={() => abrir(c)}>
              <i className="pencil alternate icon" />
            </button>
            <button
              type="button"
              className="ui button"
              aria-label="Eliminar"
              onClick={() => {
                setConMovimientos(false)
                setEliminando(c)
              }}
            >
              <i className="trash alternate outline icon" />
            </button>
          </div>
        </div>
        <div className="cifras-cuotas">
          <span>
            <strong>{formatearMoneda(c.montoCuota)}</strong> al mes
          </span>
          <span>
            Cuota {Math.min(e.pagadas + 1, c.numeroCuotas)} de {c.numeroCuotas}
          </span>
          <span>{e.completada ? '¡Pagada!' : `Falta ${formatearMoneda(e.pendiente)}`}</span>
        </div>
        <BarraProgreso
          valor={e.porcentaje}
          color={e.completada ? 'var(--color-ingreso)' : 'var(--color-marca)'}
          etiqueta={`${c.descripcion}: ${e.pagadas} de ${c.numeroCuotas} cuotas`}
          grosor={6}
        />
        <small className="texto-suave">
          {e.proxima ? `Próxima cuota: ${formatearFecha(e.proxima)}` : 'Todas las cuotas vencidas'}
          {e.interes > 0 ? ` · Intereses: ${formatearMoneda(e.interes)}` : ' · Sin intereses'}
          {c.modo === 'por_cuota' ? ' · Cada cuota se registra como gasto' : ' · El total se registró como gasto'}
        </small>
      </div>
    )
  }

  const categoriasGasto = ordenJerarquico(categorias.filter((c) => c.tipo !== 'ingreso'))

  return (
    <>
      <div className="rejilla-kpi tres">
        <div className="kpi ui segment">
          <span className="etiqueta"><i className="credit card outline icon" />Te falta pagar</span>
          <strong className={pendienteTotal > 0 ? 'texto-gasto' : ''}>{formatearMoneda(pendienteTotal)}</strong>
          <span className="nota">{activas.length} compra{activas.length === 1 ? '' : 's'} en curso</span>
        </div>
        <div className="kpi ui segment">
          <span className="etiqueta"><i className="calendar alternate outline icon" />Cuotas al mes</span>
          <strong>{formatearMoneda(cuotaMensual)}</strong>
          <span className="nota">Suma de las cuotas activas</span>
        </div>
        <div className="kpi ui segment">
          <span className="etiqueta"><i className="percent icon" />Intereses</span>
          <strong>{formatearMoneda(interesesTotales)}</strong>
          <span className="nota">Lo que pagas de más por financiar</span>
        </div>
      </div>

      <div className="barra-filtros">
        <p className="texto-suave sin-margen">
          <i className="info circle icon" />
          Celular, electrodomésticos, pasajes… lo que pagas en cuotas con tu tarjeta.
        </p>
        <button type="button" className="ui primary button" onClick={() => abrir()} disabled={cuentas.length === 0}>
          <i className="plus icon" />
          Nueva compra en cuotas
        </button>
      </div>

      {activas.length === 0 && terminadas.length === 0 && (
        <div className="ui segment estado-vacio">
          <i className="huge credit card outline icon texto-suave" />
          <p>
            <strong>Sin compras en cuotas.</strong>
            <br />
            Regístralas para saber cuánto te falta pagar y cuánto pagas en intereses.
          </p>
        </div>
      )}

      {activas.map(tarjeta)}

      {terminadas.length > 0 && (
        <button type="button" className="enlace-sugerencia" onClick={() => setVerTerminadas(!verTerminadas)}>
          <i className={`${verTerminadas ? 'chevron up' : 'chevron down'} icon`} />
          {verTerminadas ? 'Ocultar' : 'Ver'} {terminadas.length} compra{terminadas.length === 1 ? '' : 's'} ya pagada{terminadas.length === 1 ? '' : 's'}
        </button>
      )}
      {verTerminadas && terminadas.map(tarjeta)}

      <Modal
        abierto={borrador !== null}
        titulo={borrador?.id ? 'Editar compra en cuotas' : 'Nueva compra en cuotas'}
        icono="credit card outline"
        onCerrar={() => setBorrador(null)}
      >
        {borrador && (
          <form className={`ui form ${error ? 'error' : ''}`} onSubmit={guardar}>
            <div className="field required">
              <label htmlFor="cu-desc">¿Qué compraste?</label>
              <input
                id="cu-desc"
                value={borrador.descripcion}
                maxLength={80}
                placeholder="Ej. Celular, Refrigeradora, Pasajes"
                onChange={(e) => setBorrador({ ...borrador, descripcion: e.target.value })}
                autoFocus
                required
              />
            </div>
            <div className="two fields">
              <div className="field required">
                <label htmlFor="cu-cuenta">Con</label>
                <select
                  id="cu-cuenta"
                  className="ui dropdown"
                  value={borrador.cuentaId}
                  onChange={(e) => setBorrador({ ...borrador, cuentaId: e.target.value })}
                >
                  {tarjetas.length > 0 && (
                    <optgroup label="Tarjetas de crédito">
                      {tarjetas.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.nombre}
                        </option>
                      ))}
                    </optgroup>
                  )}
                  <optgroup label="Otras cuentas">
                    {cuentas
                      .filter((c) => c.tipo !== 'tarjeta_credito')
                      .map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.nombre}
                        </option>
                      ))}
                  </optgroup>
                </select>
              </div>
              <div className="field required">
                <label htmlFor="cu-cat">Categoría</label>
                <select
                  id="cu-cat"
                  className="ui dropdown"
                  value={borrador.categoriaId}
                  onChange={(e) => setBorrador({ ...borrador, categoriaId: e.target.value })}
                >
                  {categoriasGasto.map(([c, sub]) => (
                    <option key={c.id} value={c.id}>
                      {sub ? `  › ${c.nombre}` : c.nombre}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="three fields">
              <div className="field required">
                <label htmlFor="cu-total">Precio (S/)</label>
                <input
                  id="cu-total"
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="0.01"
                  value={borrador.montoTotal}
                  onChange={(e) => setBorrador({ ...borrador, montoTotal: e.target.value })}
                  required
                />
              </div>
              <div className="field required">
                <label htmlFor="cu-n">Cuotas</label>
                <input
                  id="cu-n"
                  type="number"
                  inputMode="numeric"
                  min="2"
                  max="72"
                  list="cu-n-opciones"
                  value={borrador.numeroCuotas}
                  onChange={(e) => setBorrador({ ...borrador, numeroCuotas: e.target.value })}
                  required
                />
                <datalist id="cu-n-opciones">
                  {MESES_OPCIONES.map((m) => (
                    <option key={m} value={m} />
                  ))}
                </datalist>
              </div>
              <div className="field required">
                <label htmlFor="cu-cuota">Cuota mensual (S/)</label>
                <input
                  id="cu-cuota"
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="0.01"
                  placeholder={cuotaCalculada ? cuotaCalculada.toFixed(2) : ''}
                  value={borrador.montoCuota}
                  onChange={(e) => setBorrador({ ...borrador, montoCuota: e.target.value, cuotaEditada: e.target.value !== '' })}
                  required
                />
              </div>
            </div>
            {total > 0 && n > 1 && cuota > 0 && (
              <p className={tea ? 'texto-alerta' : 'texto-suave'}>
                <i className={`${tea ? 'exclamation triangle' : 'check circle'} icon`} />
                {tea
                  ? `Pagarás ${formatearMoneda(cuota * n)} en total: ${formatearMoneda(cuota * n - total)} de intereses (TEA aprox. ${formatearPorcentaje(tea)}).`
                  : 'Sin intereses: pagas exactamente el precio.'}
              </p>
            )}
            <div className="two fields">
              <div className="field required">
                <label htmlFor="cu-fecha">Fecha de compra</label>
                <input
                  id="cu-fecha"
                  type="date"
                  value={borrador.fechaCompra}
                  onChange={(e) => setBorrador({ ...borrador, fechaCompra: e.target.value })}
                  required
                />
              </div>
              <div className="field required">
                <label htmlFor="cu-primera">Primera cuota</label>
                <input
                  id="cu-primera"
                  type="date"
                  value={borrador.primeraCuota}
                  onChange={(e) => setBorrador({ ...borrador, primeraCuota: e.target.value })}
                  required
                />
              </div>
            </div>
            {!borrador.id && (
              <div className="field">
                <label>¿Cómo lo registramos en tus gastos?</label>
                <div className="opciones-modo">
                  {(
                    [
                      ['total', 'Todo hoy', 'Un gasto por el precio completo (así suele verlo el estado de cuenta de la tarjeta).'],
                      ['por_cuota', 'Mes a mes', 'Cada cuota se registra como gasto cuando llega su fecha.'],
                    ] as [ModoCuotas, string, string][]
                  ).map(([id, titulo, texto]) => (
                    <button
                      key={id}
                      type="button"
                      aria-pressed={borrador.modo === id}
                      className={`opcion-tipo ${borrador.modo === id ? 'activa' : ''}`}
                      onClick={() => setBorrador({ ...borrador, modo: id })}
                    >
                      <strong>{titulo}</strong>
                      <span>{texto}</span>
                    </button>
                  ))}
                </div>
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

      <Modal
        abierto={eliminando !== null}
        titulo={`¿Eliminar "${eliminando?.descripcion ?? ''}"?`}
        icono="trash alternate outline"
        tamano="tiny"
        onCerrar={() => setEliminando(null)}
      >
        <p>Dejará de seguirse la compra.</p>
        <label className="casilla-simple">
          <input type="checkbox" checked={conMovimientos} onChange={(e) => setConMovimientos(e.target.checked)} />
          Borrar también {eliminando?.modo === 'total' ? 'su gasto registrado' : 'las cuotas ya registradas como gasto'}
        </label>
        <div className="acciones-formulario">
          <button type="button" className="ui basic button" onClick={() => setEliminando(null)}>
            Cancelar
          </button>
          <button
            type="button"
            className="ui red button"
            onClick={() => {
              if (eliminando) void eliminarCompraCuotas(eliminando, conMovimientos)
              avisar('Compra eliminada', 'info')
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

export default PanelCuotas
