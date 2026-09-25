import type { ReactNode } from 'react'

export interface FilaTooltip {
  color: string
  etiqueta: string
  valor: string
}

export interface EstadoTooltip {
  x: number
  y: number
  titulo: string
  filas: FilaTooltip[]
}

/**
 * Tooltip HTML posicionado sobre el gráfico. El valor va primero y en
 * negrita; la serie se identifica con un trazo corto de su color.
 */
export function Tooltip({ estado, ancho }: { estado: EstadoTooltip | null; ancho: number }) {
  if (!estado) return null

  // Se voltea hacia la izquierda si no cabe a la derecha del puntero.
  const alLado = estado.x > ancho - 180
  return (
    <div
      className="grafico-tooltip"
      role="status"
      style={{
        left: estado.x,
        top: estado.y,
        transform: `translate(${alLado ? 'calc(-100% - 12px)' : '12px'}, -50%)`,
      }}
    >
      <div className="titulo">{estado.titulo}</div>
      {estado.filas.map((f) => (
        <div key={f.etiqueta} className="fila">
          <span className="trazo" style={{ background: f.color }} />
          <strong>{f.valor}</strong>
          <span className="serie">{f.etiqueta}</span>
        </div>
      ))}
    </div>
  )
}

export function Leyenda({
  series,
  forma = 'caja',
}: {
  series: { color: string; etiqueta: string }[]
  forma?: 'caja' | 'linea'
}) {
  return (
    <div className="grafico-leyenda">
      {series.map((s) => (
        <span key={s.etiqueta} className="item">
          <span className={`muestra ${forma}`} style={{ background: s.color }} />
          {s.etiqueta}
        </span>
      ))}
    </div>
  )
}

/** Estado vacío común a todos los gráficos. */
export function SinDatos({ children }: { children: ReactNode }) {
  return (
    <div className="grafico-vacio">
      <i className="chart area icon" />
      <span>{children}</span>
    </div>
  )
}
