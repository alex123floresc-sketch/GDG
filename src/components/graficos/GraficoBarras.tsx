import { useState } from 'react'
import type { ResumenPeriodo } from '../../utils/analisis'
import { formatearMoneda, formatearMonedaCorta } from '../../utils/formato'
import { Leyenda, SinDatos, Tooltip, type EstadoTooltip } from './comun'
import { COLORES, marcasEje, useAncho } from './utilidades'

interface GraficoBarrasProps {
  periodos: ResumenPeriodo[]
  alto?: number
  /** Clave del periodo resaltado (p. ej. el seleccionado en Análisis). */
  resaltado?: string
  onSeleccionar?: (clave: string) => void
}

const MARGEN = { arriba: 12, derecha: 8, abajo: 26, izquierda: 64 }
const ANCHO_MAX_BARRA = 24
const HUECO = 2
const RADIO = 4

/** Trazado de una columna con la punta redondeada y la base recta. */
function columna(x: number, y: number, ancho: number, alto: number): string {
  const r = Math.min(RADIO, ancho / 2, alto)
  return [
    `M${x},${y + alto}`,
    `V${y + r}`,
    `Q${x},${y} ${x + r},${y}`,
    `H${x + ancho - r}`,
    `Q${x + ancho},${y} ${x + ancho},${y + r}`,
    `V${y + alto}`,
    'Z',
  ].join(' ')
}

/** Columnas agrupadas de ingresos vs. gastos por periodo. */
function GraficoBarras({
  periodos,
  alto = 240,
  resaltado,
  onSeleccionar,
}: GraficoBarrasProps) {
  const [ref, ancho] = useAncho<HTMLDivElement>()
  const [tooltip, setTooltip] = useState<EstadoTooltip | null>(null)

  const maximo = Math.max(0, ...periodos.flatMap((p) => [p.ingresos, p.gastos]))
  const hayDatos = maximo > 0

  const marcas = marcasEje(maximo)
  const tope = marcas[marcas.length - 1] || 1
  const anchoPlot = Math.max(0, ancho - MARGEN.izquierda - MARGEN.derecha)
  const altoPlot = alto - MARGEN.arriba - MARGEN.abajo
  const banda = periodos.length > 0 ? anchoPlot / periodos.length : 0
  const anchoBarra = Math.max(4, Math.min(ANCHO_MAX_BARRA, (banda * 0.7 - HUECO) / 2))
  const y = (v: number) => MARGEN.arriba + altoPlot - (v / tope) * altoPlot

  function mostrar(p: ResumenPeriodo, cx: number) {
    setTooltip({
      x: cx,
      y: MARGEN.arriba + altoPlot / 2,
      titulo: p.etiquetaLarga,
      filas: [
        { color: COLORES.ingreso, etiqueta: 'Ingresos', valor: formatearMoneda(p.ingresos) },
        { color: COLORES.gasto, etiqueta: 'Gastos', valor: formatearMoneda(p.gastos) },
        { color: 'transparent', etiqueta: 'Balance', valor: formatearMoneda(p.balance) },
      ],
    })
  }

  return (
    <div className="grafico">
      <Leyenda
        series={[
          { color: COLORES.ingreso, etiqueta: 'Ingresos' },
          { color: COLORES.gasto, etiqueta: 'Gastos' },
        ]}
      />
      <div ref={ref} className="grafico-lienzo" style={{ height: alto }}>
        {!hayDatos ? (
          <SinDatos>Sin movimientos en este rango</SinDatos>
        ) : (
          ancho > 0 && (
            <svg
              width={ancho}
              height={alto}
              role="img"
              aria-label="Ingresos y gastos por periodo"
              onMouseLeave={() => setTooltip(null)}
            >
              {marcas.map((m) => (
                <g key={m}>
                  <line
                    className={m === 0 ? 'eje-base' : 'eje-grilla'}
                    x1={MARGEN.izquierda}
                    x2={ancho - MARGEN.derecha}
                    y1={y(m)}
                    y2={y(m)}
                  />
                  <text
                    className="eje-texto"
                    x={MARGEN.izquierda - 8}
                    y={y(m)}
                    textAnchor="end"
                    dominantBaseline="middle"
                  >
                    {formatearMonedaCorta(m)}
                  </text>
                </g>
              ))}

              {periodos.map((p, i) => {
                const cx = MARGEN.izquierda + banda * i + banda / 2
                const xIngreso = cx - anchoBarra - HUECO / 2
                const xGasto = cx + HUECO / 2
                const activo = resaltado === p.clave
                const atenuado = resaltado !== undefined && !activo

                return (
                  <g
                    key={p.clave}
                    className={`grupo-barras ${atenuado ? 'atenuado' : ''} ${onSeleccionar ? 'clicable' : ''}`}
                    tabIndex={0}
                    aria-label={`${p.etiquetaLarga}: ingresos ${formatearMoneda(p.ingresos)}, gastos ${formatearMoneda(p.gastos)}`}
                    onMouseMove={() => mostrar(p, cx)}
                    onFocus={() => mostrar(p, cx)}
                    onBlur={() => setTooltip(null)}
                    onClick={() => onSeleccionar?.(p.clave)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        onSeleccionar?.(p.clave)
                      }
                    }}
                  >
                    {/* Zona de impacto: toda la banda, no solo las barras. */}
                    <rect
                      className="zona-impacto"
                      x={MARGEN.izquierda + banda * i}
                      y={MARGEN.arriba}
                      width={banda}
                      height={altoPlot}
                    />
                    {p.ingresos > 0 && (
                      <path
                        d={columna(xIngreso, y(p.ingresos), anchoBarra, y(0) - y(p.ingresos))}
                        fill={COLORES.ingreso}
                      />
                    )}
                    {p.gastos > 0 && (
                      <path
                        d={columna(xGasto, y(p.gastos), anchoBarra, y(0) - y(p.gastos))}
                        fill={COLORES.gasto}
                      />
                    )}
                    <text
                      className={`eje-texto ${activo ? 'activo' : ''}`}
                      x={cx}
                      y={alto - 8}
                      textAnchor="middle"
                    >
                      {p.etiqueta}
                    </text>
                  </g>
                )
              })}
            </svg>
          )
        )}
        <Tooltip estado={tooltip} ancho={ancho} />
      </div>
    </div>
  )
}

export default GraficoBarras
