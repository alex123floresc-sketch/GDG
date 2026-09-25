interface BarraProgresoProps {
  /** 0–1 (se recorta a 1 para dibujar). */
  valor: number
  color?: string
  /** Texto para lectores de pantalla. */
  etiqueta: string
  grosor?: number
}

/** Barra de progreso fina con el mismo estilo en toda la app. */
function BarraProgreso({ valor, color = 'var(--color-marca)', etiqueta, grosor = 8 }: BarraProgresoProps) {
  const pct = Math.max(0, Math.min(1, valor)) * 100
  return (
    <div
      className="barra-progreso"
      style={{ height: grosor }}
      role="progressbar"
      aria-label={etiqueta}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(pct)}
    >
      <div className="relleno" style={{ width: `${pct}%`, background: color }} />
    </div>
  )
}

export default BarraProgreso
