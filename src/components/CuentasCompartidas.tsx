import { useMemo, useState, type FormEvent } from 'react'
import { useAvisos } from '../hooks/useAvisos'
import type { DatosCompartidos } from '../hooks/useCompartidas'
import {
  aceptarInvitacion,
  invitarACuenta,
  quitarDeCuenta,
  salirDeCuenta,
  textoInvitacion,
} from '../services/compartirService'
import { NOMBRE_POR_COBRAR } from '../services/cuentaService'
import type { Cuenta, Transaccion } from '../types'
import { cuentasOperativas, saldosPorCuenta } from '../utils/cuentas'
import { formatearFecha, formatearMoneda } from '../utils/formato'
import IconoCuenta from './IconoCuenta'

interface CuentasCompartidasProps {
  usuarioId: string
  email: string
  cuentas: Cuenta[]
  transacciones: Transaccion[]
  datos: DatosCompartidos
  sincronizarAhora: () => Promise<void>
  /** Abre el registro con esa cuenta elegida. */
  onRegistrarEn: (cuentaId: string) => void
}

const MOVIMIENTOS_VISIBLES = 6

/** Más → Compartir: invitar a tus cuentas y ver las que te compartieron. */
function CuentasCompartidas({
  usuarioId,
  email,
  cuentas,
  transacciones,
  datos,
  sincronizarAhora,
  onRegistrarEn,
}: CuentasCompartidasProps) {
  const { avisar } = useAvisos()
  const { compartidas, cuentasAjenas, movimientosAjenos } = datos
  const miCorreo = email.trim().toLowerCase()
  // No se comparten los chanchitos ni la cuenta de sistema "Por cobrar".
  const propias = cuentasOperativas(cuentas).filter((c) => c.nombre !== NOMBRE_POR_COBRAR)
  const [cuentaInvitar, setCuentaInvitar] = useState('')
  const [correo, setCorreo] = useState('')
  const [ocupado, setOcupado] = useState<string | null>(null)
  /** Recién invitado: se ofrece avisarle. */
  const [avisarA, setAvisarA] = useState<{ correo: string; cuenta: string } | null>(null)

  const cuentaElegida = propias.find((c) => c.id === cuentaInvitar) ?? propias[0]
  const recibidas = compartidas.filter((c) => c.estado === 'pendiente' && c.email === miCorreo && c.duenoId !== usuarioId)
  const enviadas = compartidas.filter((c) => c.duenoId === usuarioId)
  const porCuentaPropia = useMemo(() => {
    const mapa = new Map<string, typeof enviadas>()
    for (const c of enviadas) mapa.set(c.cuentaId, [...(mapa.get(c.cuentaId) ?? []), c])
    return mapa
  }, [enviadas])

  // Saldo de las ajenas: saldo inicial + lo de todos (lo mío y lo de otros).
  const todos = useMemo(() => [...transacciones, ...movimientosAjenos], [transacciones, movimientosAjenos])
  const saldosAjenas = useMemo(() => saldosPorCuenta(cuentasAjenas, todos), [cuentasAjenas, todos])

  async function ejecutar(clave: string, accion: () => Promise<void>, exito: string) {
    setOcupado(clave)
    try {
      await accion()
      avisar(exito)
      await sincronizarAhora()
    } catch (e) {
      avisar(e instanceof Error ? e.message : 'No se pudo completar.', 'error')
    } finally {
      setOcupado(null)
    }
  }

  async function invitar(e: FormEvent) {
    e.preventDefault()
    if (!cuentaElegida) return
    const destino = correo.trim().toLowerCase()
    await ejecutar(
      'invitar',
      async () => {
        await invitarACuenta(usuarioId, email, cuentaElegida, destino)
        setCorreo('')
        setAvisarA({ correo: destino, cuenta: cuentaElegida.nombre })
      },
      `Invitación creada para ${destino}`,
    )
  }

  async function compartirTexto(texto: string) {
    try {
      if (navigator.share) await navigator.share({ text: texto })
      else {
        await navigator.clipboard.writeText(texto)
        avisar('Texto copiado', 'info')
      }
    } catch {
      // El usuario cerró el menú de compartir.
    }
  }

  function autor(id: string, correoAutor: string) {
    return id === usuarioId ? 'Tú' : correoAutor || 'Otra persona'
  }

  return (
    <>
      <div className="barra-filtros">
        <h2 className="ui header">
          <i className="users icon" />
          <div className="content">
            Compartir cuentas
            <div className="sub header">Registren juntos en una misma cuenta (pareja, familia, roomies)</div>
          </div>
        </h2>
      </div>

      {recibidas.length > 0 && (
        <section className="ui segment invitaciones-recibidas">
          <h3 className="ui header">
            <i className="envelope open outline icon" />
            Invitaciones para ti
          </h3>
          {recibidas.map((c) => (
            <div key={c.id} className="fila-compartida">
              <span>
                <strong>{c.duenoEmail}</strong> te invitó a la cuenta <strong>«{c.cuentaNombre}»</strong>
              </span>
              <span className="acciones">
                <button
                  type="button"
                  className={`ui small primary button ${ocupado === c.id ? 'loading' : ''}`}
                  disabled={ocupado !== null}
                  onClick={() => void ejecutar(c.id, () => aceptarInvitacion(c.id), `Ya ves «${c.cuentaNombre}»`)}
                >
                  Aceptar
                </button>
                <button
                  type="button"
                  className="ui small basic button"
                  disabled={ocupado !== null}
                  onClick={() => void ejecutar(c.id, () => salirDeCuenta(c.id), 'Invitación rechazada')}
                >
                  Rechazar
                </button>
              </span>
            </div>
          ))}
        </section>
      )}

      <section className="ui segment">
        <h3 className="ui header">
          <i className="handshake outline icon" />
          Compartidas contigo
        </h3>
        {cuentasAjenas.length === 0 ? (
          <p className="texto-suave">
            Cuando alguien te invite a una de sus cuentas con tu correo (<strong>{miCorreo}</strong>) la verás aquí.
          </p>
        ) : (
          cuentasAjenas.map((cuenta) => {
            const miembro = compartidas.find(
              (c) => c.cuentaId === cuenta.id && c.miembroId === usuarioId && c.estado === 'aceptada',
            )
            const movimientos = todos
              .filter((t) => t.cuentaId === cuenta.id)
              .sort((a, b) => b.fecha.getTime() - a.fecha.getTime())
              .slice(0, MOVIMIENTOS_VISIBLES)
            return (
              <div key={cuenta.id} className="tarjeta-compartida">
                <div className="encabezado">
                  <IconoCuenta cuenta={cuenta} />
                  <div className="nombre">
                    <strong>{cuenta.nombre}</strong>
                    <span className="texto-suave">de {cuenta.duenoEmail}</span>
                  </div>
                  <strong className="saldo">{formatearMoneda(saldosAjenas.get(cuenta.id) ?? cuenta.saldoInicial)}</strong>
                </div>
                {movimientos.length > 0 && (
                  <ul className="movimientos-compartidos">
                    {movimientos.map((t) => {
                      const ajeno = 'autorId' in t ? (t as (typeof movimientosAjenos)[number]) : null
                      return (
                        <li key={t.id}>
                          <span className="texto-suave">{formatearFecha(t.fecha)}</span>
                          <span className="concepto">
                            {t.concepto || ajeno?.categoriaNombre || (t.transferenciaId ? 'Transferencia' : 'Movimiento')}
                            <small className="texto-suave"> · {autor(ajeno ? ajeno.autorId : usuarioId, ajeno?.autorEmail ?? '')}</small>
                          </span>
                          <span className={t.tipo === 'ingreso' ? 'texto-ingreso' : 'texto-gasto'}>
                            {t.tipo === 'ingreso' ? '+' : '−'}
                            {formatearMoneda(t.monto)}
                          </span>
                        </li>
                      )
                    })}
                  </ul>
                )}
                <div className="acciones">
                  <button type="button" className="ui small primary button" onClick={() => onRegistrarEn(cuenta.id)}>
                    <i className="plus icon" />
                    Registrar aquí
                  </button>
                  {miembro && (
                    <button
                      type="button"
                      className="ui small basic button"
                      disabled={ocupado !== null}
                      onClick={() =>
                        void ejecutar(miembro.id, () => salirDeCuenta(miembro.id), `Ya no ves «${cuenta.nombre}»`)
                      }
                    >
                      Salir de la cuenta
                    </button>
                  )}
                </div>
              </div>
            )
          })
        )}
      </section>

      <section className="ui segment">
        <h3 className="ui header">
          <i className="share alternate icon" />
          Compartir una de tus cuentas
        </h3>
        <p className="texto-suave">
          La otra persona verá esa cuenta, su saldo y todos sus movimientos, y podrá registrar en ella. Tus demás
          cuentas y tus análisis siguen siendo solo tuyos.
        </p>
        {propias.length === 0 ? (
          <p className="texto-suave">Primero crea una cuenta en Más → Cuentas.</p>
        ) : (
          <form className="ui form fila-invitar" onSubmit={(e) => void invitar(e)}>
            <select
              className="ui dropdown"
              aria-label="Cuenta a compartir"
              value={cuentaElegida?.id ?? ''}
              onChange={(e) => setCuentaInvitar(e.target.value)}
            >
              {propias.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                </option>
              ))}
            </select>
            <input
              type="email"
              required
              placeholder="correo@ejemplo.com"
              aria-label="Correo de la persona"
              value={correo}
              onChange={(e) => setCorreo(e.target.value)}
              autoComplete="email"
            />
            <button type="submit" className={`ui primary button ${ocupado === 'invitar' ? 'loading' : ''}`} disabled={ocupado !== null}>
              Invitar
            </button>
          </form>
        )}

        {avisarA && (
          <div className="ui info message aviso-invitacion">
            <p>
              Avísale a <strong>{avisarA.correo}</strong>: debe entrar a la app con ese correo y aceptar en Más →
              Compartir.
            </p>
            <a
              className="ui small basic button"
              href={`mailto:${encodeURIComponent(avisarA.correo)}?subject=${encodeURIComponent('Te invité a una cuenta en Gestor de Gastos')}&body=${encodeURIComponent(textoInvitacion(avisarA.cuenta, avisarA.correo))}`}
            >
              <i className="envelope icon" />
              Enviar correo
            </a>
            <button type="button" className="ui small basic button" onClick={() => void compartirTexto(textoInvitacion(avisarA.cuenta, avisarA.correo))}>
              <i className="share alternate icon" />
              Compartir por otra app
            </button>
            <button type="button" className="ui small basic button" onClick={() => setAvisarA(null)}>
              Listo
            </button>
          </div>
        )}

        {porCuentaPropia.size > 0 && (
          <div className="lista-compartidas">
            {[...porCuentaPropia.entries()].map(([cuentaId, personas]) => {
              const cuenta = cuentas.find((c) => c.id === cuentaId)
              return (
                <div key={cuentaId} className="grupo-compartida">
                  <strong>{cuenta?.nombre ?? personas[0].cuentaNombre}</strong>
                  {personas.map((p) => (
                    <div key={p.id} className="fila-compartida">
                      <span>
                        {p.email}{' '}
                        {p.estado === 'aceptada' ? (
                          <span className="ui mini green basic label">Aceptó</span>
                        ) : (
                          <span className="ui mini basic label">Pendiente</span>
                        )}
                      </span>
                      <button
                        type="button"
                        className="ui mini basic button"
                        disabled={ocupado !== null}
                        onClick={() => void ejecutar(p.id, () => quitarDeCuenta(p.id), `${p.email} ya no ve «${cuenta?.nombre ?? p.cuentaNombre}»`)}
                      >
                        {p.estado === 'aceptada' ? 'Quitar' : 'Cancelar invitación'}
                      </button>
                    </div>
                  ))}
                </div>
              )
            })}
          </div>
        )}
      </section>
    </>
  )
}

export default CuentasCompartidas
