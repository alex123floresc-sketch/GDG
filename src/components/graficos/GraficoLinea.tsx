import { useState, type MouseEvent } from 'react'
import { formatearMoneda, formatearMonedaCorta } from '../../utils/formato'
import { SinDatos, Tooltip, type EstadoTooltip } from './comun'
import { COLORES, marcasEje, useAncho } from './utilidades'

export interface PuntoLinea {
  etiqueta: string
  etiquetaLarga: string
  valor: number
}

interface GraficoLineaProps {
  puntos: PuntoLinea[]
  /** Nombre de la serie (tooltip y lector de pantalla). */
  serie: string
  alto?: number
}

const MARGEN = { arriba: 16, derecha: 16, abajo: 26, izquierda: 64 }

/**
 * Línea con área suave y cruz que se ajusta al punto más cercano. Admite
 * valores negativos (p. ej. balance acumulado): el eje incluye siempre el 0.
 */
function GraficoLinea({ puntos, serie, alto = 220 }: GraficoLineaProps) {
  const [ref, ancho] = useAncho<HTMLDivElement>()
  const [indice, setIndice] = useState<number | null>(null)

  const valores = puntos.map((p) => p.valor)
  const hayDatos = valores.some((v) => v !== 0)

  // Eje simétrico en "marcas redondas" a ambos lados del 0.
  const marcasPos = marcasEje(Math.max(0, ...valores))
  const marcasNeg = marcasEje(Math.max(0, ...valores.map((v) => -v)))
  const topeSup = marcasPos[marcasPos.length - 1]
  const topeInf = -marcasNeg[marcasNeg.length - 1]
  const marcas = [...marcasNeg.slice(1).map((m) => -m).reverse(), ...marcasPos]
  const rango = topeSup - topeInf || 1

  const anchoPlot = Math.max(0, ancho - MARGEN.izquierda - MARGEN.derecha)
  const altoPlot = alto - MARGEN.arriba - MARGEN.abajo
  const paso = puntos.length > 1 ? anchoPlot / (puntos.length - 1) : 0
  const x = (i: number) => MARGEN.izquierda + (puntos.length > 1 ? paso * i : anchoPlot / 2)
  const y = (v: number) => MARGEN.arriba + ((topeSup - v) / rango) * altoPlot

  const trazo = puntos.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i)},${y(p.valor)}`).join(' ')
  const area = `${trazo} L${x(puntos.length - 1)},${y(0)} L${x(0)},${y(0)} Z`

  function manejarMovimiento(e: MouseEvent<SVGRectElement>) {
    const caja = e.currentTarget.getBoundingClientRect()
    const relativo = e.clientX - caja.left
    // La zona empieza medio paso antes del primer punto.
    const i = paso > 0 ? Math.round((relativo - paso / 2) / paso) : 0
    setIndice(Math.max(0, Math.min(puntos.length - 1, i)))
  }

  const tooltip: EstadoTooltip | null =
    indice !== null && puntos[indice]
      ? {
          x: x(indice),
          y: y(puntos[indice].valor),
          titulo: puntos[indice].etiquetaLarga,
          filas: [
            {
              color: COLORES.balance,
              etiqueta: serie,
              valor: formatearMoneda(puntos[indice].valor),
            },
          ],
        }
      : null

  // Solo se rotulan algunas etiquetas del eje X si no caben todas.
  const cadaCuanto = Math.max(1, Math.ceil(puntos.length / Math.max(1, anchoPlot / 44)))
  const ultimo = puntos[puntos.length - 1]

  return (
    <div className="grafico">
      <div ref={ref} className="grafico-lienzo" style={{ height: alto }}>
        {!hayDatos ? (
          <SinDatos>Sin movimientos en este rango</SinDatos>
        ) : (
          ancho > 0 && (
            <svg width={ancho} height={alto} role="img" aria-label={serie}>
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

              {puntos.map((p, i) =>
                i % cadaCuanto === 0 || i === puntos.length - 1 ? (
                  <text
                    key={p.etiquetaLarga}
                    className="eje-texto"
                    x={x(i)}
                    y={alto - 8}
                    textAnchor="middle"
                  >
                    {p.etiqueta}
                  </text>
                ) : null,
              )}

              <path d={area} fill={COLORES.balance} opacity={0.1} />
              <path
                d={trazo}
                fill="none"
                stroke={COLORES.balance}
                strokeWidth={2}
                strokeLinejoin="round"
                strokeLinecap="round"
              />

              {/* Valor rotulado solo en el último punto. */}
              <circle
                className="marcador"
                cx={x(puntos.length - 1)}
                cy={y(ultimo.valor)}
                r={4}
                fill={COLORES.balance}
              />

              {indice !== null && (
                <>
                  <line
                    className="cruz"
                    x1={x(indice)}
                    x2={x(indice)}
                    y1={MARGEN.arriba}
                    y2={MARGEN.arriba + altoPlot}
                  />
                  <circle
                    className="marcador"
                    cx={x(indice)}
                    cy={y(puntos[indice].valor)}
                    r={5}
                    fill={COLORES.balance}
                  />
                </>
              )}

              <rect
                className="zona-impacto"
                x={MARGEN.izquierda - paso / 2}
                y={MARGEN.arriba}
                width={anchoPlot + paso}
                height={altoPlot}
                onMouseMove={manejarMovimiento}
                onMouseLeave={() => setIndice(null)}
              />
            </svg>
          )
        )}
        <Tooltip estado={tooltip} ancho={ancho} />
      </div>
    </div>
  )
}

export default GraficoLinea
