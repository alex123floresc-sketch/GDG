const formateadorMoneda = new Intl.NumberFormat('es-PE', {
  style: 'currency',
  currency: 'PEN',
})

export function formatearMoneda(monto: number): string {
  return formateadorMoneda.format(monto)
}

const formateadorFecha = new Intl.DateTimeFormat('es-PE', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
})

export function formatearFecha(fecha: Date): string {
  return formateadorFecha.format(fecha)
}

const formateadorCompacto = new Intl.NumberFormat('es-PE', {
  notation: 'compact',
  maximumFractionDigits: 1,
})

/** Monto abreviado para ejes de gráficos: `S/ 1.2 mil`. */
export function formatearMonedaCorta(monto: number): string {
  return `S/ ${formateadorCompacto.format(monto)}`
}

const formateadorPorcentaje = new Intl.NumberFormat('es-PE', {
  style: 'percent',
  maximumFractionDigits: 1,
})

export function formatearPorcentaje(fraccion: number): string {
  return formateadorPorcentaje.format(fraccion)
}
