import { useEffect, useRef, useState, type RefObject } from 'react'

/**
 * Ancho actual (px) del contenedor. Los gráficos se dibujan en SVG a su
 * tamaño real en vez de escalar un viewBox fijo, para que el texto de los
 * ejes no se encoja en móvil.
 */
export function useAncho<T extends HTMLElement>(): [
  RefObject<T | null>,
  number,
] {
  const ref = useRef<T>(null)
  const [ancho, setAncho] = useState(0)

  useEffect(() => {
    const elemento = ref.current
    if (!elemento) return

    const observador = new ResizeObserver(([entrada]) => {
      setAncho(Math.floor(entrada.contentRect.width))
    })
    observador.observe(elemento)
    return () => observador.disconnect()
  }, [])

  return [ref, ancho]
}

/** Divide [0, max] en ~n marcas "redondas" (1, 2, 2.5, 5 × 10^k). */
export function marcasEje(maximo: number, n = 4): number[] {
  if (maximo <= 0) return [0]

  const pasoCrudo = maximo / n
  const magnitud = 10 ** Math.floor(Math.log10(pasoCrudo))
  const paso =
    [1, 2, 2.5, 5, 10].map((m) => m * magnitud).find((p) => p >= pasoCrudo) ??
    10 * magnitud

  const marcas: number[] = []
  for (let v = 0; v <= maximo + paso * 0.001; v += paso) marcas.push(v)
  if (marcas[marcas.length - 1] < maximo) marcas.push(marcas.length * paso)
  return marcas
}

/** Colores de las series de ingresos/gastos/balance (ver `index.css`). */
export const COLORES = {
  ingreso: 'var(--serie-ingreso)',
  gasto: 'var(--serie-gasto)',
  balance: 'var(--serie-balance)',
}
