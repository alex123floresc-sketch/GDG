import { useEffect, useRef, useState } from 'react'

const DURACION_MS = 600

/**
 * Devuelve `valor` animado desde el valor anterior (conteo suave). Si el
 * sistema pide reducir movimiento, devuelve el valor tal cual.
 */
export function useNumeroAnimado(valor: number): number {
  const [mostrado, setMostrado] = useState(valor)
  const anterior = useRef(valor)

  useEffect(() => {
    const desde = anterior.current
    anterior.current = valor
    const reducir = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    if (reducir || desde === valor) {
      setMostrado(valor)
      return
    }

    let marco = 0
    const inicio = performance.now()
    const paso = (ahora: number) => {
      const t = Math.min(1, (ahora - inicio) / DURACION_MS)
      const suavizado = 1 - (1 - t) ** 3
      setMostrado(desde + (valor - desde) * suavizado)
      if (t < 1) marco = requestAnimationFrame(paso)
    }
    marco = requestAnimationFrame(paso)
    return () => cancelAnimationFrame(marco)
  }, [valor])

  return mostrado
}
