import { useMemo, useState } from 'react'
import type { Categoria, Cuenta, Transaccion } from '../types'
import { esMovimientoReal } from '../utils/analisis'
import { formatearMoneda, formatearMonedaCorta } from '../utils/formato'
import ListaTransacciones from './ListaTransacciones'

interface CalendarioGastosProps {
  transacciones: Transaccion[]
  categorias: Categoria[]
  cuentas: Cuenta[]
  onSeleccionar?: (t: Transaccion) => void
}

const DIAS_SEMANA = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']
/** Intensidades de la escala secuencial (un solo tono, de claro a oscuro). */
const NIVELES = [14, 30, 48, 68, 88]
const formateadorMes = new Intl.DateTimeFormat('es-PE', { month: 'long', year: 'numeric' })
const formateadorDia = new Intl.DateTimeFormat('es-PE', { weekday: 'long', day: 'numeric', month: 'long' })

const claveDia = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`

function CalendarioGastos({ transacciones, categorias, cuentas, onSeleccionar }: CalendarioGastosProps) {
  const [hoy] = useState(() => new Date())
  const [mesVisto, setMesVisto] = useState(() => ({ anio: hoy.getFullYear(), mes: hoy.getMonth() }))
  const [diaElegido, setDiaElegido] = useState<number | null>(hoy.getDate())

  const { anio, mes } = mesVisto
  const diasDelMes = new Date(anio, mes + 1, 0).getDate()
  // Lunes = 0 … Domingo = 6
  const desfase = (new Date(anio, mes, 1).getDay() + 6) % 7

  const porDia = useMemo(() => {
    const mapa = new Map<string, { gasto: number; ingreso: number; cantidad: number }>()
    for (const t of transacciones) {
      if (t.fecha.getFullYear() !== anio || t.fecha.getMonth() !== mes) continue
      const clave = claveDia(t.fecha)
      const dia = mapa.get(clave) ?? { gasto: 0, ingreso: 0, cantidad: 0 }
      dia.cantidad++
      if (esMovimientoReal(t)) {
        if (t.tipo === 'gasto') dia.gasto += t.monto
        else dia.ingreso += t.monto
      }
      mapa.set(clave, dia)
    }
    return mapa
  }, [transacciones, anio, mes])

  const valores = [...porDia.values()]
  const maxGasto = Math.max(0, ...valores.map((v) => v.gasto))
  const totalGasto = valores.reduce((s, v) => s + v.gasto, 0)
  const diasConGasto = valores.filter((v) => v.gasto > 0).length
  const esMesActual = anio === hoy.getFullYear() && mes === hoy.getMonth()
  const diasTranscurridos = esMesActual ? hoy.getDate() : diasDelMes
  const diaMayor = [...porDia.entries()].sort((a, b) => b[1].gasto - a[1].gasto)[0]

  const nivel = (gasto: number) =>
    gasto <= 0 || maxGasto <= 0 ? -1 : Math.min(NIVELES.length - 1, Math.floor((gasto / maxGasto) * NIVELES.length - 1e-9))

  const movimientosDelDia = useMemo(
    () =>
      diaElegido === null
        ? []
        : transacciones.filter(
            (t) => t.fecha.getFullYear() === anio && t.fecha.getMonth() === mes && t.fecha.getDate() === diaElegido,
          ),
    [transacciones, anio, mes, diaElegido],
  )

  function moverMes(delta: number) {
    const d = new Date(anio, mes + delta, 1)
    setMesVisto({ anio: d.getFullYear(), mes: d.getMonth() })
    setDiaElegido(null)
  }

  const nombreMes = formateadorMes.format(new Date(anio, mes, 1))

  return (
    <>
      <div className="ui segment calendario">
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
          <div className="leyenda-calendario" aria-hidden="true">
            <span>Menos</span>
            {NIVELES.map((n) => (
              <span key={n} className="muestra" style={{ background: `color-mix(in srgb, var(--serie-gasto) ${n}%, var(--color-superficie))` }} />
            ))}
            <span>Más gasto</span>
          </div>
        </div>

        <div className="resumen-calendario">
          <div>
            <span>Gastado</span>
            <strong className="texto-gasto">{formatearMoneda(totalGasto)}</strong>
          </div>
          <div>
            <span>Promedio diario</span>
            <strong>{formatearMoneda(diasTranscurridos ? totalGasto / diasTranscurridos : 0)}</strong>
          </div>
          <div>
            <span>Días con gastos</span>
            <strong>
              {diasConGasto} de {diasTranscurridos}
            </strong>
          </div>
          <div>
            <span>Día de mayor gasto</span>
            <strong>{diaMayor && diaMayor[1].gasto > 0 ? `${diaMayor[0].split('-')[2]} · ${formatearMonedaCorta(diaMayor[1].gasto)}` : '—'}</strong>
          </div>
        </div>

        <div className="rejilla-calendario" role="grid" aria-label={`Gastos de ${nombreMes}`}>
          {DIAS_SEMANA.map((d) => (
            <div key={d} className="nombre-dia" role="columnheader">
              {d}
            </div>
          ))}
          {Array.from({ length: desfase }, (_, i) => (
            <div key={`vacio-${i}`} className="celda vacia" />
          ))}
          {Array.from({ length: diasDelMes }, (_, i) => {
            const dia = i + 1
            const datos = porDia.get(claveDia(new Date(anio, mes, dia)))
            const n = nivel(datos?.gasto ?? 0)
            const esHoy = esMesActual && dia === hoy.getDate()
            const futuro = esMesActual && dia > hoy.getDate()
            return (
              <button
                key={dia}
                type="button"
                role="gridcell"
                aria-selected={diaElegido === dia}
                className={`celda ${esHoy ? 'hoy' : ''} ${diaElegido === dia ? 'elegida' : ''} ${futuro ? 'futuro' : ''}`}
                style={n >= 0 ? { background: `color-mix(in srgb, var(--serie-gasto) ${NIVELES[n]}%, var(--color-superficie))` } : undefined}
                title={
                  datos
                    ? `${dia}: gastos ${formatearMoneda(datos.gasto)}${datos.ingreso ? `, ingresos ${formatearMoneda(datos.ingreso)}` : ''}`
                    : `${dia}: sin movimientos`
                }
                onClick={() => setDiaElegido(diaElegido === dia ? null : dia)}
              >
                <span className="numero">{dia}</span>
                {datos && datos.gasto > 0 && <span className="monto-dia">{formatearMonedaCorta(datos.gasto)}</span>}
                {datos && datos.ingreso > 0 && <span className="punto-ingreso" aria-label="Con ingresos" />}
              </button>
            )
          })}
        </div>
        <div className="nota-calendario texto-suave">
          <span className="punto-ingreso" /> Día con ingresos · toca un día para ver sus movimientos
        </div>
      </div>

      {diaElegido !== null && (
        <ListaTransacciones
          transacciones={movimientosDelDia}
          categorias={categorias}
          cuentas={cuentas}
          titulo={(() => {
            const t = formateadorDia.format(new Date(anio, mes, diaElegido))
            return t.charAt(0).toUpperCase() + t.slice(1)
          })()}
          limite={100}
          mostrarTotales
          onSeleccionar={onSeleccionar}
          vacio="Sin movimientos este día."
        />
      )}
    </>
  )
}

export default CalendarioGastos
