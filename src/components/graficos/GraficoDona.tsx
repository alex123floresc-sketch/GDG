import { useMemo, useState } from 'react'
import { COLOR_SIN_CATEGORIA, type ResumenCategoria } from '../../utils/analisis'
import { formatearMoneda, formatearPorcentaje } from '../../utils/formato'
import { SinDatos } from './comun'

interface GraficoDonaProps {
  datos: ResumenCategoria[]
  /** Texto bajo el total del centro, p. ej. "Gastos". */
  titulo: string
  /** A partir de cuántas categorías se agrupa el resto en "Otras". */
  maxPorciones?: number
}

const TAMANO = 180
const GROSOR = 28
const RADIO = TAMANO / 2
const RADIO_INTERNO = RADIO - GROSOR

function arco(inicio: number, fin: number): string {
  // Un círculo completo no se puede trazar con un solo arco SVG.
  if (fin - inicio >= Math.PI * 2 - 1e-6) fin = inicio + Math.PI * 2 - 1e-4

  const punto = (r: number, a: number) =>
    `${RADIO + r * Math.sin(a)},${RADIO - r * Math.cos(a)}`
  const grande = fin - inicio > Math.PI ? 1 : 0

  return [
    `M${punto(RADIO, inicio)}`,
    `A${RADIO},${RADIO} 0 ${grande} 1 ${punto(RADIO, fin)}`,
    `L${punto(RADIO_INTERNO, fin)}`,
    `A${RADIO_INTERNO},${RADIO_INTERNO} 0 ${grande} 0 ${punto(RADIO_INTERNO, inicio)}`,
    'Z',
  ].join(' ')
}

/** Dona de reparto por categoría con leyenda (icono, monto y %). */
function GraficoDona({ datos, titulo, maxPorciones = 6 }: GraficoDonaProps) {
  const [activa, setActiva] = useState<string | null>(null)

  const porciones = useMemo(() => {
    if (datos.length <= maxPorciones) return datos

    const principales = datos.slice(0, maxPorciones - 1)
    const resto = datos.slice(maxPorciones - 1)
    return [
      ...principales,
      {
        categoriaId: '__otras__',
        nombre: `Otras (${resto.length})`,
        icono: 'ellipsis horizontal',
        color: COLOR_SIN_CATEGORIA,
        total: resto.reduce((s, d) => s + d.total, 0),
        cantidad: resto.reduce((s, d) => s + d.cantidad, 0),
        porcentaje: resto.reduce((s, d) => s + d.porcentaje, 0),
      },
    ]
  }, [datos, maxPorciones])

  const total = porciones.reduce((s, d) => s + d.total, 0)

  if (total <= 0) {
    return <SinDatos>Sin {titulo.toLowerCase()} en este rango</SinDatos>
  }

  // Ángulo inicial de cada porción = suma de las anteriores.
  const inicios = porciones.map((_, i) =>
    porciones.slice(0, i).reduce((s, p) => s + p.total, 0),
  )
  const arcos = porciones.map((p, i) => ({
    ...p,
    d: arco(
      (inicios[i] / total) * Math.PI * 2,
      ((inicios[i] + p.total) / total) * Math.PI * 2,
    ),
  }))

  const seleccionada = porciones.find((p) => p.categoriaId === activa)

  return (
    <div className="grafico-dona">
      <div className="dona">
        <svg
          width={TAMANO}
          height={TAMANO}
          viewBox={`0 0 ${TAMANO} ${TAMANO}`}
          role="img"
          aria-label={`${titulo} por categoría`}
          onMouseLeave={() => setActiva(null)}
        >
          {arcos.map((a) => (
            <path
              key={a.categoriaId}
              d={a.d}
              fill={a.color}
              className={`porcion ${activa && activa !== a.categoriaId ? 'atenuado' : ''}`}
              onMouseEnter={() => setActiva(a.categoriaId)}
            >
              <title>{`${a.nombre}: ${formatearMoneda(a.total)}`}</title>
            </path>
          ))}
        </svg>
        <div className="centro">
          <strong>{formatearMoneda(seleccionada?.total ?? total)}</strong>
          <span>{seleccionada ? seleccionada.nombre : titulo}</span>
        </div>
      </div>

      <div className="leyenda-dona ui middle aligned list">
        {porciones.map((p) => (
          <div
            key={p.categoriaId}
            className={`item ${activa === p.categoriaId ? 'activa' : ''}`}
            onMouseEnter={() => setActiva(p.categoriaId)}
            onMouseLeave={() => setActiva(null)}
          >
            <span className="icono-circulo mini" style={{ background: p.color }}>
              <i className={`${p.icono} icon`} />
            </span>
            <div className="content">
              <div className="nombre">{p.nombre}</div>
              <div className="ui tiny progress">
                <div
                  className="bar"
                  style={{ width: `${Math.max(2, p.porcentaje * 100)}%`, background: p.color }}
                />
              </div>
            </div>
            <div className="cifras">
              <strong>{formatearMoneda(p.total)}</strong>
              <span>{formatearPorcentaje(p.porcentaje)}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export default GraficoDona
