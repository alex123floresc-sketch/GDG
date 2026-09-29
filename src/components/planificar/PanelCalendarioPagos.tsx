import { useMemo, useState } from 'react'
import type { CompraCuotas, Cuenta, Deuda, Meta, Recurrente, Transaccion } from '../../types'
import { formatearFecha, formatearMoneda, formatearMonedaCorta } from '../../utils/formato'
import { eventosDelMes, type EventoPago, type TipoEventoPago } from '../../utils/pagos'

interface PanelCalendarioPagosProps {
  recurrentes: Recurrente[]
  transacciones: Transaccion[]
  cuentas: Cuenta[]
  cuotas: CompraCuotas[]
  deudas: Deuda[]
  metas: Meta[]
}

const TIPOS: Record<TipoEventoPago, { etiqueta: string; icono: string }> = {
  'fijo-gasto': { etiqueta: 'Pago fijo', icono: 'redo alternate' },
  'fijo-ingreso': { etiqueta: 'Ingreso fijo', icono: 'arrow down' },
  tarjeta: { etiqueta: 'Tarjeta', icono: 'credit card' },
  cuota: { etiqueta: 'Cuota', icono: 'credit card outline' },
  debo: { etiqueta: 'Deuda', icono: 'handshake' },
  'me-deben': { etiqueta: 'Te pagan', icono: 'handshake outline' },
  meta: { etiqueta: 'Meta', icono: 'bullseye' },
}

const DIAS_SEMANA = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']

/** Planificar → Calendario: todo lo que se paga o cobra cada día del mes. */
function PanelCalendarioPagos(props: PanelCalendarioPagosProps) {
  const [hoy] = useState(() => new Date())
  const [mes, setMes] = useState(() => new Date(hoy.getFullYear(), hoy.getMonth(), 1))
  const [diaElegido, setDiaElegido] = useState<number | null>(null)

  const eventos = useMemo(
    () => eventosDelMes({ ...props, anio: mes.getFullYear(), mes: mes.getMonth(), hoy }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [props.recurrentes, props.transacciones, props.cuentas, props.cuotas, props.deudas, props.metas, mes, hoy],
  )

  const porDia = useMemo(() => {
    const mapa = new Map<number, EventoPago[]>()
    for (const e of eventos) mapa.set(e.fecha.getDate(), [...(mapa.get(e.fecha.getDate()) ?? []), e])
    return mapa
  }, [eventos])

  const sale = eventos.filter((e) => (e.monto ?? 0) < 0 && !e.pasado).reduce((s, e) => s - e.monto!, 0)
  const entra = eventos.filter((e) => (e.monto ?? 0) > 0 && !e.pasado).reduce((s, e) => s + e.monto!, 0)
  const diasDelMes = new Date(mes.getFullYear(), mes.getMonth() + 1, 0).getDate()
  const desfase = (mes.getDay() + 6) % 7 // lunes = 0
  const esMesActual = mes.getFullYear() === hoy.getFullYear() && mes.getMonth() === hoy.getMonth()
  const nombreMes = new Intl.DateTimeFormat('es-PE', { month: 'long', year: 'numeric' }).format(mes)
  const lista = diaElegido ? (porDia.get(diaElegido) ?? []) : eventos

  function cambiarMes(delta: number) {
    setMes(new Date(mes.getFullYear(), mes.getMonth() + delta, 1))
    setDiaElegido(null)
  }

  return (
    <>
      <div className="rejilla-kpi dos">
        <div className="kpi ui segment">
          <span className="etiqueta"><i className="arrow up icon" />{esMesActual ? 'Por pagar este mes' : 'Por pagar'}</span>
          <strong className="texto-gasto">{formatearMoneda(sale)}</strong>
          <span className="nota">Fijos, cuotas, tarjetas y deudas</span>
        </div>
        <div className="kpi ui segment">
          <span className="etiqueta"><i className="arrow down icon" />Por cobrar</span>
          <strong className="texto-ingreso">{formatearMoneda(entra)}</strong>
          <span className="nota">Ingresos fijos y lo que te deben</span>
        </div>
      </div>

      <div className="ui segment">
        <div className="navegador-mes">
          <button type="button" className="ui basic icon button" aria-label="Mes anterior" onClick={() => cambiarMes(-1)}>
            <i className="chevron left icon" />
          </button>
          <strong className="nombre-mes">{nombreMes.charAt(0).toUpperCase() + nombreMes.slice(1)}</strong>
          <button type="button" className="ui basic icon button" aria-label="Mes siguiente" onClick={() => cambiarMes(1)}>
            <i className="chevron right icon" />
          </button>
        </div>

        <div className="rejilla-pagos" role="grid" aria-label={`Pagos de ${nombreMes}`}>
          {DIAS_SEMANA.map((d) => (
            <div key={d} className="cabecera-dia-pago" role="columnheader">
              {d}
            </div>
          ))}
          {Array.from({ length: desfase }, (_, i) => (
            <div key={`v${i}`} className="dia-pago vacio" />
          ))}
          {Array.from({ length: diasDelMes }, (_, i) => {
            const dia = i + 1
            const delDia = porDia.get(dia) ?? []
            const salida = delDia.reduce((s, e) => s + Math.min(0, e.monto ?? 0), 0)
            const entrada = delDia.reduce((s, e) => s + Math.max(0, e.monto ?? 0), 0)
            const esHoy = esMesActual && dia === hoy.getDate()
            return (
              <button
                key={dia}
                type="button"
                role="gridcell"
                aria-selected={diaElegido === dia}
                aria-label={`${dia}: ${delDia.length} evento${delDia.length === 1 ? '' : 's'}`}
                className={`dia-pago ${esHoy ? 'hoy' : ''} ${diaElegido === dia ? 'elegido' : ''} ${delDia.length ? 'con-eventos' : ''}`}
                onClick={() => setDiaElegido(diaElegido === dia ? null : dia)}
              >
                <span className="numero">{dia}</span>
                {delDia.length > 0 && (
                  <span className="iconos">
                    {[...new Set(delDia.map((e) => e.tipo))].slice(0, 3).map((t) => (
                      <i key={t} className={`${TIPOS[t].icono} icon tipo-${t}`} />
                    ))}
                  </span>
                )}
                {salida < 0 && <span className="monto texto-gasto">−{formatearMonedaCorta(-salida).replace('S/ ', '')}</span>}
                {entrada > 0 && <span className="monto texto-ingreso">+{formatearMonedaCorta(entrada).replace('S/ ', '')}</span>}
              </button>
            )
          })}
        </div>
      </div>

      <div className="ui segment">
        <div className="titulo-bloque">
          <h3 className="ui header">
            <i className="calendar alternate outline icon" />
            <div className="content">
              {diaElegido ? `${diaElegido} de ${nombreMes.split(' ')[0]}` : 'Todo el mes'}
              <div className="sub header">
                {lista.length} evento{lista.length === 1 ? '' : 's'}
              </div>
            </div>
          </h3>
          {diaElegido && (
            <button type="button" className="enlace-sugerencia" onClick={() => setDiaElegido(null)}>
              Ver todo el mes
            </button>
          )}
        </div>
        {lista.length === 0 ? (
          <p className="texto-suave">
            Nada programado. Agrega pagos fijos en Recurrentes, compras en Cuotas o fechas de pago a tus tarjetas.
          </p>
        ) : (
          <div className="lista-transacciones ui divided list">
            {lista.map((e, i) => (
              <div key={i} className={`item ${e.pasado ? 'pausado' : ''}`}>
                <span className={`icono-circulo fondo-evento tipo-${e.tipo}`}>
                  <i className={`${TIPOS[e.tipo].icono} icon`} />
                </span>
                <div className="detalle">
                  <div className="header">{e.titulo}</div>
                  <div className="description">
                    {formatearFecha(e.fecha)} · {TIPOS[e.tipo].etiqueta}
                    {e.pasado ? ' · ya pasó' : ''}
                  </div>
                </div>
                <div className="monto">
                  {e.monto !== undefined ? (
                    <strong className={e.monto >= 0 ? 'texto-ingreso' : 'texto-gasto'}>
                      {e.monto >= 0 ? '+' : '−'}
                      {formatearMoneda(Math.abs(e.monto))}
                    </strong>
                  ) : (
                    <span className="texto-suave">Recordatorio</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  )
}

export default PanelCalendarioPagos
