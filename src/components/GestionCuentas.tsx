import { useMemo, useState, type FormEvent } from 'react'
import { useAvisos } from '../hooks/useAvisos'
import { actualizarCuenta, crearCuenta, eliminarCuenta } from '../services/cuentaService'
import type { Cuenta, TipoCuenta, Transaccion } from '../types'
import {
  ETIQUETA_CUENTA,
  estadoTarjeta,
  ICONO_CUENTA,
  saldosPorCuenta,
  TIPOS_CUENTA,
} from '../utils/cuentas'
import { formatearFecha, formatearMoneda, formatearPorcentaje } from '../utils/formato'
import Modal from './Modal'

interface GestionCuentasProps {
  usuarioId: string
  cuentas: Cuenta[]
  transacciones: Transaccion[]
  /** Abre el registro de una transferencia (p. ej. pagar la tarjeta). */
  onTransferir?: () => void
}

interface Borrador {
  id?: string
  nombre: string
  tipo: TipoCuenta
  /** Para tarjetas es la deuda (positiva); para el resto, el saldo. */
  saldo: string
  limite: string
  diaCorte: string
  diaPago: string
}

const VACIO: Borrador = {
  nombre: '',
  tipo: 'banco',
  saldo: '0',
  limite: '',
  diaCorte: '',
  diaPago: '',
}

const DIAS_ALERTA_PAGO = 5

function GestionCuentas({ usuarioId, cuentas, transacciones, onTransferir }: GestionCuentasProps) {
  const { avisar } = useAvisos()
  const [borrador, setBorrador] = useState<Borrador | null>(null)
  const [eliminando, setEliminando] = useState<Cuenta | null>(null)
  const [reasignarA, setReasignarA] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const saldos = useMemo(() => saldosPorCuenta(cuentas, transacciones), [cuentas, transacciones])
  const usos = useMemo(() => {
    const conteo = new Map<string, number>()
    for (const t of transacciones) conteo.set(t.cuentaId, (conteo.get(t.cuentaId) ?? 0) + 1)
    return conteo
  }, [transacciones])

  const patrimonio = [...saldos.values()].reduce((s, v) => s + v, 0)
  const esTarjeta = borrador?.tipo === 'tarjeta_credito'

  function abrir(cuenta?: Cuenta) {
    setError(null)
    setBorrador(
      cuenta
        ? {
            id: cuenta.id,
            nombre: cuenta.nombre,
            tipo: cuenta.tipo,
            saldo: String(cuenta.tipo === 'tarjeta_credito' ? -cuenta.saldoInicial : cuenta.saldoInicial),
            limite: cuenta.limiteCredito ? String(cuenta.limiteCredito) : '',
            diaCorte: cuenta.diaCorte ? String(cuenta.diaCorte) : '',
            diaPago: cuenta.diaPago ? String(cuenta.diaPago) : '',
          }
        : VACIO,
    )
  }

  async function guardar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!borrador) return
    setGuardando(true)
    setError(null)

    const saldo = Number(borrador.saldo || 0)
    const datos = {
      nombre: borrador.nombre,
      tipo: borrador.tipo,
      saldoInicial: esTarjeta ? -Math.abs(saldo) : saldo,
      limiteCredito: borrador.limite ? Number(borrador.limite) : undefined,
      diaCorte: borrador.diaCorte ? Number(borrador.diaCorte) : undefined,
      diaPago: borrador.diaPago ? Number(borrador.diaPago) : undefined,
    }

    try {
      if (borrador.id) {
        await actualizarCuenta(borrador.id, datos, usuarioId)
        avisar('Cuenta actualizada')
      } else {
        await crearCuenta(datos, usuarioId)
        avisar('Cuenta creada')
      }
      setBorrador(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar la cuenta.')
    } finally {
      setGuardando(false)
    }
  }

  function pedirEliminacion(c: Cuenta) {
    setError(null)
    setEliminando(c)
    setReasignarA(cuentas.find((o) => o.id !== c.id)?.id ?? '')
  }

  async function confirmarEliminacion() {
    if (!eliminando) return
    setGuardando(true)
    try {
      await eliminarCuenta(eliminando.id, reasignarA || undefined)
      avisar(`Cuenta "${eliminando.nombre}" eliminada`, 'info')
      setEliminando(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo eliminar la cuenta.')
    } finally {
      setGuardando(false)
    }
  }

  const usosEliminando = eliminando ? (usos.get(eliminando.id) ?? 0) : 0

  return (
    <>
      <div className="barra-filtros">
        <h2 className="ui header">
          <i className="wallet icon" />
          <div className="content">
            Cuentas
            <div className="sub header">
              Patrimonio neto: <strong className={patrimonio < 0 ? 'texto-gasto' : ''}>{formatearMoneda(patrimonio)}</strong>
            </div>
          </div>
        </h2>
        <div className="acciones-exportar">
          {onTransferir && cuentas.length > 1 && (
            <button type="button" className="ui basic button" onClick={onTransferir}>
              <i className="exchange icon" />
              Transferir
            </button>
          )}
          <button type="button" className="ui primary button" onClick={() => abrir()}>
            <i className="plus icon" />
            Nueva cuenta
          </button>
        </div>
      </div>

      <div className="rejilla-cuentas">
        {cuentas.map((c) => {
          const saldo = saldos.get(c.id) ?? c.saldoInicial
          const tarjeta = c.tipo === 'tarjeta_credito' ? estadoTarjeta(c, transacciones) : null
          const pagoCerca =
            tarjeta?.diasParaPago !== undefined &&
            tarjeta.diasParaPago <= DIAS_ALERTA_PAGO &&
            tarjeta.deuda > 0

          return (
            <div key={c.id} className={`tarjeta-cuenta ui segment ${tarjeta ? 'es-tarjeta' : ''}`}>
              <div className="cabecera">
                <span className="icono-circulo mini fondo-marca">
                  <i className={`${ICONO_CUENTA[c.tipo]} icon`} />
                </span>
                <div className="nombre">
                  <strong>{c.nombre}</strong>
                  <span>{ETIQUETA_CUENTA[c.tipo]}</span>
                </div>
                <div className="ui mini basic icon buttons">
                  <button type="button" className="ui button" title="Editar" aria-label={`Editar ${c.nombre}`} onClick={() => abrir(c)}>
                    <i className="pencil alternate icon" />
                  </button>
                  <button
                    type="button"
                    className="ui button"
                    title="Eliminar"
                    aria-label={`Eliminar ${c.nombre}`}
                    disabled={cuentas.length <= 1}
                    onClick={() => pedirEliminacion(c)}
                  >
                    <i className="trash alternate outline icon" />
                  </button>
                </div>
              </div>

              {tarjeta ? (
                <>
                  <div className="saldo">
                    <span className="etiqueta">Deuda</span>
                    <strong className={tarjeta.deuda > 0 ? 'texto-gasto' : ''}>
                      {formatearMoneda(tarjeta.deuda)}
                    </strong>
                  </div>
                  {tarjeta.uso !== undefined && (
                    <>
                      <div className="ui tiny progress barra-linea">
                        <div
                          className="bar"
                          style={{
                            width: `${Math.max(2, tarjeta.uso * 100)}%`,
                            background: tarjeta.uso >= 0.8 ? 'var(--color-gasto)' : 'var(--color-marca)',
                          }}
                        />
                      </div>
                      <div className="detalle-linea">
                        <span>{formatearPorcentaje(tarjeta.uso)} usado</span>
                        <span>Disponible {formatearMoneda(tarjeta.disponible ?? 0)}</span>
                      </div>
                    </>
                  )}
                  <div className="detalle-linea">
                    <span>Consumo del ciclo: {formatearMoneda(tarjeta.consumoCiclo)}</span>
                  </div>
                  {tarjeta.proximoPago && (
                    <div className={`ui mini ${pagoCerca ? 'red' : 'basic'} label etiqueta-pago`}>
                      <i className={`${pagoCerca ? 'exclamation triangle' : 'calendar alternate outline'} icon`} />
                      Pago: {formatearFecha(tarjeta.proximoPago)}
                      {tarjeta.diasParaPago === 0
                        ? ' (hoy)'
                        : ` (en ${tarjeta.diasParaPago} día${tarjeta.diasParaPago === 1 ? '' : 's'})`}
                    </div>
                  )}
                </>
              ) : (
                <div className="saldo">
                  <span className="etiqueta">Saldo</span>
                  <strong className={saldo < 0 ? 'texto-gasto' : ''}>{formatearMoneda(saldo)}</strong>
                </div>
              )}
              <div className="movimientos-cuenta">
                {usos.get(c.id) ?? 0} movimiento{(usos.get(c.id) ?? 0) === 1 ? '' : 's'}
              </div>
            </div>
          )
        })}
      </div>

      <Modal
        abierto={borrador !== null}
        titulo={borrador?.id ? 'Editar cuenta' : 'Nueva cuenta'}
        icono="wallet"
        onCerrar={() => setBorrador(null)}
      >
        {borrador && (
          <form className={`ui form ${error ? 'error' : ''}`} onSubmit={guardar}>
            <div className="field required">
              <label htmlFor="cta-nombre">Nombre</label>
              <input
                id="cta-nombre"
                value={borrador.nombre}
                maxLength={40}
                placeholder="Ej. BCP, Interbank, Plin"
                onChange={(e) => setBorrador({ ...borrador, nombre: e.target.value })}
                required
                autoFocus
              />
            </div>

            <div className="field">
              <label>Tipo</label>
              <div className="selector-tipo-cuenta">
                {TIPOS_CUENTA.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    className={`opcion-categoria ${borrador.tipo === t.id ? 'activa' : ''}`}
                    aria-pressed={borrador.tipo === t.id}
                    onClick={() => setBorrador({ ...borrador, tipo: t.id })}
                  >
                    <span className="icono-circulo mini fondo-marca">
                      <i className={`${t.icono} icon`} />
                    </span>
                    <span className="nombre">{t.etiqueta}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="field">
              <label htmlFor="cta-saldo">
                {esTarjeta ? 'Deuda actual de la tarjeta' : 'Saldo actual (al empezar a usar la app)'}
              </label>
              <div className="ui left labeled input">
                <span className="ui basic label">S/</span>
                <input
                  id="cta-saldo"
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  value={borrador.saldo}
                  onChange={(e) => setBorrador({ ...borrador, saldo: e.target.value })}
                />
              </div>
            </div>

            {esTarjeta && (
              <div className="three fields">
                <div className="field">
                  <label htmlFor="cta-limite">Línea de crédito</label>
                  <input
                    id="cta-limite"
                    type="number"
                    inputMode="decimal"
                    min="0"
                    step="0.01"
                    placeholder="Ej. 5000"
                    value={borrador.limite}
                    onChange={(e) => setBorrador({ ...borrador, limite: e.target.value })}
                  />
                </div>
                <div className="field">
                  <label htmlFor="cta-corte">Día de corte</label>
                  <input
                    id="cta-corte"
                    type="number"
                    min="1"
                    max="31"
                    placeholder="1–31"
                    value={borrador.diaCorte}
                    onChange={(e) => setBorrador({ ...borrador, diaCorte: e.target.value })}
                  />
                </div>
                <div className="field">
                  <label htmlFor="cta-pago">Día de pago</label>
                  <input
                    id="cta-pago"
                    type="number"
                    min="1"
                    max="31"
                    placeholder="1–31"
                    value={borrador.diaPago}
                    onChange={(e) => setBorrador({ ...borrador, diaPago: e.target.value })}
                  />
                </div>
              </div>
            )}

            {esTarjeta && (
              <p className="texto-suave nota-formulario">
                <i className="info circle icon" />
                Registra tus compras como gastos de esta tarjeta y el pago como una transferencia
                desde tu banco hacia la tarjeta.
              </p>
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
        titulo={`¿Eliminar "${eliminando?.nombre ?? ''}"?`}
        icono="trash alternate outline"
        tamano="tiny"
        onCerrar={() => setEliminando(null)}
      >
        {eliminando && (
          <div className="ui form">
            {usosEliminando > 0 ? (
              <div className="field">
                <label htmlFor="cta-reasignar">
                  Tiene {usosEliminando} movimiento{usosEliminando === 1 ? '' : 's'}. ¿A qué cuenta los pasamos?
                </label>
                <select
                  id="cta-reasignar"
                  className="ui dropdown"
                  value={reasignarA}
                  onChange={(e) => setReasignarA(e.target.value)}
                >
                  {cuentas
                    .filter((c) => c.id !== eliminando.id)
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.nombre}
                      </option>
                    ))}
                </select>
              </div>
            ) : (
              <p>No tiene movimientos asociados.</p>
            )}
            {error && <p className="texto-gasto">{error}</p>}
            <div className="acciones-formulario">
              <button type="button" className="ui basic button" onClick={() => setEliminando(null)}>
                Cancelar
              </button>
              <button
                type="button"
                className={`ui red button ${guardando ? 'loading' : ''}`}
                disabled={guardando}
                onClick={confirmarEliminacion}
              >
                <i className="trash icon" />
                Eliminar
              </button>
            </div>
          </div>
        )}
      </Modal>
    </>
  )
}

export default GestionCuentas
