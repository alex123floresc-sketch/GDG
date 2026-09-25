import { useState, type FormEvent } from 'react'
import { useAvisos } from '../../hooks/useAvisos'
import {
  abonarDeuda,
  actualizarDeuda,
  crearDeuda,
  eliminarDeuda,
  marcarDeudaPagada,
  restaurarDeuda,
} from '../../services/deudaService'
import { registrarCobroDividido } from '../../services/divisionService'
import { crearTransaccion } from '../../services/transaccionService'
import type { Categoria, Cuenta, Deuda, TipoDeuda } from '../../types'
import { fechaDesdeInput, fechaParaInput, formatearFecha, formatearMoneda } from '../../utils/formato'
import { estadoDeuda } from '../../utils/planificacion'
import BarraProgreso from '../BarraProgreso'
import Modal from '../Modal'
import Ilustracion from '../Ilustracion'

interface PanelDeudasProps {
  usuarioId: string
  deudas: Deuda[]
  cuentas: Cuenta[]
  categorias: Categoria[]
}

const TIPOS: { id: TipoDeuda; etiqueta: string; icono: string; descripcion: string }[] = [
  { id: 'me_deben', etiqueta: 'Me deben', icono: 'hand holding usd', descripcion: 'Prestaste dinero' },
  { id: 'debo', etiqueta: 'Debo', icono: 'handshake', descripcion: 'Te prestaron dinero' },
]

interface BorradorDeuda {
  id?: string
  tipo: TipoDeuda
  persona: string
  monto: string
  concepto: string
  fecha: string
  fechaLimite: string
}

interface BorradorAbono {
  deuda: Deuda
  monto: string
  nota: string
  registrar: boolean
  cuentaId: string
}

function PanelDeudas({ usuarioId, deudas, cuentas, categorias }: PanelDeudasProps) {
  const { avisar } = useAvisos()
  const [verSaldadas, setVerSaldadas] = useState(false)
  const [borrador, setBorrador] = useState<BorradorDeuda | null>(null)
  const [abono, setAbono] = useState<BorradorAbono | null>(null)
  const [eliminando, setEliminando] = useState<Deuda | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)

  const conEstado = deudas.map((d) => ({ deuda: d, estado: estadoDeuda(d) }))
  const pendientes = conEstado.filter((x) => !x.estado.saldada)
  const saldadas = conEstado.filter((x) => x.estado.saldada)
  const totalMeDeben = pendientes.filter((x) => x.deuda.tipo === 'me_deben').reduce((s, x) => s + x.estado.pendiente, 0)
  const totalDebo = pendientes.filter((x) => x.deuda.tipo === 'debo').reduce((s, x) => s + x.estado.pendiente, 0)

  const visibles = (verSaldadas ? saldadas : pendientes).sort(
    (a, b) =>
      Number(b.estado.vencida) - Number(a.estado.vencida) ||
      (a.estado.diasParaVencer ?? 9999) - (b.estado.diasParaVencer ?? 9999),
  )

  function abrir(deuda?: Deuda, tipo: TipoDeuda = 'me_deben') {
    setError(null)
    setBorrador(
      deuda
        ? {
            id: deuda.id,
            tipo: deuda.tipo,
            persona: deuda.persona,
            monto: String(deuda.monto),
            concepto: deuda.concepto ?? '',
            fecha: fechaParaInput(deuda.fecha),
            fechaLimite: deuda.fechaLimite ? fechaParaInput(deuda.fechaLimite) : '',
          }
        : { tipo, persona: '', monto: '', concepto: '', fecha: fechaParaInput(), fechaLimite: '' },
    )
  }

  async function ejecutar(accion: () => Promise<unknown>, alTerminar: () => void) {
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

  function guardarDeuda(e: FormEvent) {
    e.preventDefault()
    if (!borrador) return
    const mediodia = new Date(2000, 0, 1, 12)
    const datos = {
      tipo: borrador.tipo,
      persona: borrador.persona,
      monto: Number(borrador.monto),
      concepto: borrador.concepto,
      fecha: fechaDesdeInput(borrador.fecha, mediodia),
      fechaLimite: borrador.fechaLimite ? fechaDesdeInput(borrador.fechaLimite, mediodia) : undefined,
    }
    void ejecutar(
      () => (borrador.id ? actualizarDeuda(borrador.id, datos) : crearDeuda(datos, usuarioId)),
      () => {
        avisar(borrador.id ? 'Deuda actualizada' : 'Deuda registrada')
        setBorrador(null)
      },
    )
  }

  function guardarAbono(e: FormEvent) {
    e.preventDefault()
    if (!abono) return
    const monto = Number(abono.monto)
    const { deuda } = abono
    const categoria = categorias.find((c) => c.tipo === 'ambos') ?? categorias[0]

    void ejecutar(
      async () => {
        await abonarDeuda(deuda.id, monto, abono.nota)
        if (abono.registrar && abono.cuentaId && deuda.gastoDividido) {
          // Lo adelantado en un gasto dividido vuelve desde "Por cobrar".
          await registrarCobroDividido(usuarioId, deuda.persona, monto, abono.cuentaId)
        } else if (abono.registrar && abono.cuentaId && categoria) {
          // Cobrar lo que me deben = ingreso; pagar lo que debo = gasto.
          await crearTransaccion(
            {
              monto,
              tipo: deuda.tipo === 'me_deben' ? 'ingreso' : 'gasto',
              cuentaId: abono.cuentaId,
              categoriaId: categoria.id,
              fecha: new Date(),
              concepto: `${deuda.tipo === 'me_deben' ? 'Cobro a' : 'Pago a'} ${deuda.persona}`,
              origen: 'manual',
            },
            usuarioId,
          )
        }
      },
      () => {
        const saldada = estadoDeuda(deuda).pendiente - monto < 0.005
        avisar(saldada ? `¡Deuda con ${deuda.persona} saldada!` : 'Abono registrado')
        setAbono(null)
      },
    )
  }

  return (
    <>
      <div className="rejilla-kpi dos">
        <div className="kpi ui segment">
          <span className="etiqueta"><i className="hand holding usd icon" />Me deben</span>
          <strong className="texto-ingreso">{formatearMoneda(totalMeDeben)}</strong>
          <button type="button" className="enlace-sugerencia" onClick={() => abrir(undefined, 'me_deben')}>
            + Registrar préstamo que hice
          </button>
        </div>
        <div className="kpi ui segment">
          <span className="etiqueta"><i className="handshake icon" />Debo</span>
          <strong className="texto-gasto">{formatearMoneda(totalDebo)}</strong>
          <button type="button" className="enlace-sugerencia" onClick={() => abrir(undefined, 'debo')}>
            + Registrar lo que debo
          </button>
        </div>
      </div>

      <div className="ui secondary pointing menu submenu-mas compacto">
        <button type="button" className={`item ${!verSaldadas ? 'active' : ''}`} onClick={() => setVerSaldadas(false)}>
          Pendientes ({pendientes.length})
        </button>
        <button type="button" className={`item ${verSaldadas ? 'active' : ''}`} onClick={() => setVerSaldadas(true)}>
          Saldadas ({saldadas.length})
        </button>
      </div>

      {visibles.length === 0 ? (
        <div className="ui segment estado-vacio">
          <Ilustracion nombre="deudas" />
          <p>{verSaldadas ? 'Aún no hay deudas saldadas.' : 'No tienes deudas pendientes. 🙌'}</p>
        </div>
      ) : (
        <div className="lista-planes">
          {visibles.map(({ deuda, estado }) => (
            <div key={deuda.id} className={`ui segment tarjeta-plan ${estado.vencida ? 'nivel-excedido' : ''}`}>
              <div className="cabecera">
                <span className={`icono-circulo ${deuda.tipo === 'me_deben' ? 'fondo-ingreso' : 'fondo-gasto'}`}>
                  <i className={`${TIPOS.find((t) => t.id === deuda.tipo)!.icono} icon`} />
                </span>
                <div className="titulo">
                  <strong>{deuda.persona}</strong>
                  <span>
                    {deuda.tipo === 'me_deben' ? 'Te debe' : 'Le debes'}
                    {deuda.gastoDividido ? ' · gasto dividido' : ''}
                    {deuda.concepto ? ` · ${deuda.concepto}` : ''} · {formatearFecha(deuda.fecha)}
                  </span>
                </div>
                <div className="ui mini basic icon buttons">
                  <button type="button" className="ui button" aria-label="Editar" onClick={() => abrir(deuda)}>
                    <i className="pencil alternate icon" />
                  </button>
                  <button type="button" className="ui button" aria-label="Eliminar" onClick={() => setEliminando(deuda)}>
                    <i className="trash alternate outline icon" />
                  </button>
                </div>
              </div>

              <div className="cifras-meta">
                <strong className={deuda.tipo === 'me_deben' ? 'texto-ingreso' : 'texto-gasto'}>
                  {formatearMoneda(estado.pendiente)}
                </strong>
                <span className="texto-suave">pendiente de {formatearMoneda(deuda.monto)}</span>
              </div>
              <BarraProgreso
                valor={estado.porcentaje}
                color={deuda.tipo === 'me_deben' ? 'var(--color-ingreso)' : 'var(--color-gasto)'}
                etiqueta={`Pagado ${Math.round(estado.porcentaje * 100)}%`}
              />
              <div className="pie">
                {estado.saldada ? (
                  <span className="texto-ingreso"><i className="check circle icon" />Saldada</span>
                ) : deuda.fechaLimite ? (
                  <span className={estado.vencida ? 'texto-gasto' : estado.diasParaVencer! <= 7 ? 'texto-alerta' : 'texto-suave'}>
                    <i className="calendar alternate outline icon" />
                    {estado.vencida
                      ? `Venció hace ${-estado.diasParaVencer!} día${estado.diasParaVencer === -1 ? '' : 's'}`
                      : estado.diasParaVencer === 0
                        ? 'Vence hoy'
                        : `Vence el ${formatearFecha(deuda.fechaLimite)}`}
                  </span>
                ) : (
                  <span className="texto-suave">Sin fecha límite</span>
                )}
                {!estado.saldada && (
                  <div className="acciones-meta">
                  {!deuda.gastoDividido && (
                    <button
                      type="button"
                      className="ui small basic button"
                      title="Saldar sin registrar movimientos en tus cuentas"
                      onClick={async () => {
                        const anterior = await marcarDeudaPagada(deuda.id)
                        avisar(`Deuda con ${deuda.persona} marcada como pagada`, 'exito', {
                          texto: 'Deshacer',
                          onClick: () => void restaurarDeuda(anterior),
                        })
                      }}
                    >
                      <i className="check double icon" />
                      Marcar como pagada
                    </button>
                  )}
                  <button
                    type="button"
                    className="ui small primary button"
                    onClick={() => {
                      setError(null)
                      setAbono({
                        deuda,
                        monto: estado.pendiente.toFixed(2),
                        nota: '',
                        registrar: true,
                        cuentaId: cuentas[0]?.id ?? '',
                      })
                    }}
                  >
                    <i className="check icon" />
                    {deuda.tipo === 'me_deben' ? 'Registrar cobro' : 'Registrar pago'}
                  </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal
        abierto={borrador !== null}
        titulo={borrador?.id ? 'Editar deuda' : 'Nueva deuda o préstamo'}
        icono="handshake"
        onCerrar={() => setBorrador(null)}
      >
        {borrador && (
          <form className={`ui form ${error ? 'error' : ''}`} onSubmit={guardarDeuda}>
            <div className="ui fluid two buttons field">
              {TIPOS.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  className={`ui button ${borrador.tipo === t.id ? (t.id === 'me_deben' ? 'green' : 'red') : 'basic'}`}
                  aria-pressed={borrador.tipo === t.id}
                  onClick={() => setBorrador({ ...borrador, tipo: t.id })}
                >
                  <i className={`${t.icono} icon`} />
                  {t.etiqueta}
                </button>
              ))}
            </div>
            <div className="two fields">
              <div className="field required">
                <label htmlFor="deuda-persona">{borrador.tipo === 'me_deben' ? '¿Quién te debe?' : '¿A quién le debes?'}</label>
                <input
                  id="deuda-persona"
                  value={borrador.persona}
                  maxLength={60}
                  placeholder="Ej. Juan"
                  onChange={(e) => setBorrador({ ...borrador, persona: e.target.value })}
                  autoFocus
                  required
                />
              </div>
              <div className="field required">
                <label htmlFor="deuda-monto">Monto</label>
                <div className="ui left labeled input">
                  <span className="ui basic label">S/</span>
                  <input
                    id="deuda-monto"
                    type="number"
                    inputMode="decimal"
                    min="0"
                    step="0.01"
                    value={borrador.monto}
                    onChange={(e) => setBorrador({ ...borrador, monto: e.target.value })}
                    required
                  />
                </div>
              </div>
            </div>
            <div className="field">
              <label htmlFor="deuda-concepto">Concepto (opcional)</label>
              <input
                id="deuda-concepto"
                value={borrador.concepto}
                maxLength={100}
                placeholder="Ej. Préstamo para el pasaje"
                onChange={(e) => setBorrador({ ...borrador, concepto: e.target.value })}
              />
            </div>
            <div className="two fields">
              <div className="field">
                <label htmlFor="deuda-fecha">Fecha</label>
                <input id="deuda-fecha" type="date" value={borrador.fecha} onChange={(e) => setBorrador({ ...borrador, fecha: e.target.value })} required />
              </div>
              <div className="field">
                <label htmlFor="deuda-limite">Fecha límite (opcional)</label>
                <input id="deuda-limite" type="date" value={borrador.fechaLimite} onChange={(e) => setBorrador({ ...borrador, fechaLimite: e.target.value })} />
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
        abierto={abono !== null}
        titulo={abono ? `${abono.deuda.tipo === 'me_deben' ? 'Cobro de' : 'Pago a'} ${abono.deuda.persona}` : ''}
        icono="check circle"
        tamano="tiny"
        onCerrar={() => setAbono(null)}
      >
        {abono && (
          <form className={`ui form ${error ? 'error' : ''}`} onSubmit={guardarAbono}>
            <div className="field required">
              <label htmlFor="abono-monto">Monto (pendiente: {formatearMoneda(estadoDeuda(abono.deuda).pendiente)})</label>
              <div className="ui left labeled input">
                <span className="ui basic label">S/</span>
                <input
                  id="abono-monto"
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="0.01"
                  value={abono.monto}
                  onChange={(e) => setAbono({ ...abono, monto: e.target.value })}
                  autoFocus
                  required
                />
              </div>
            </div>
            <div className="field">
              <label htmlFor="abono-nota">Nota (opcional)</label>
              <input id="abono-nota" value={abono.nota} maxLength={80} onChange={(e) => setAbono({ ...abono, nota: e.target.value })} />
            </div>
            <div className="field">
              <label className="casilla">
                <input
                  type="checkbox"
                  checked={abono.registrar}
                  onChange={(e) => setAbono({ ...abono, registrar: e.target.checked })}
                />
                {abono.deuda.gastoDividido
                  ? 'Devolver de "Por cobrar" a'
                  : `Registrarlo también como ${abono.deuda.tipo === 'me_deben' ? 'ingreso' : 'gasto'} en`}
              </label>
              {abono.registrar && (
                <select
                  aria-label="Cuenta"
                  className="ui dropdown"
                  value={abono.cuentaId}
                  onChange={(e) => setAbono({ ...abono, cuentaId: e.target.value })}
                >
                  {cuentas.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nombre}
                    </option>
                  ))}
                </select>
              )}
            </div>
            {error && (
              <div className="ui error message">
                <p>{error}</p>
              </div>
            )}
            <div className="acciones-formulario">
              <button type="button" className="ui basic button" onClick={() => setAbono(null)}>
                Cancelar
              </button>
              <button type="submit" className={`ui primary button ${guardando ? 'loading' : ''}`} disabled={guardando}>
                <i className="check icon" />
                Guardar
              </button>
            </div>
          </form>
        )}
      </Modal>

      <Modal
        abierto={eliminando !== null}
        titulo={`¿Eliminar la deuda con ${eliminando?.persona ?? ''}?`}
        icono="trash alternate outline"
        tamano="tiny"
        onCerrar={() => setEliminando(null)}
      >
        <p>Se borrará con todos sus abonos. Los movimientos que ya registraste en tus cuentas se mantienen.</p>
        <div className="acciones-formulario">
          <button type="button" className="ui basic button" onClick={() => setEliminando(null)}>
            Cancelar
          </button>
          <button
            type="button"
            className="ui red button"
            onClick={() => {
              if (eliminando) void eliminarDeuda(eliminando)
              avisar('Deuda eliminada', 'info')
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

export default PanelDeudas
