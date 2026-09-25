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

/** Fecha local en formato `YYYY-MM-DD` (valor de `<input type="date">`). */
export function fechaParaInput(fecha: Date = new Date()): string {
  // No usar toISOString(): da la fecha en UTC, que en Perú (UTC-5) ya es
  // "mañana" desde las 7 p. m.
  const mes = String(fecha.getMonth() + 1).padStart(2, '0')
  const dia = String(fecha.getDate()).padStart(2, '0')
  return `${fecha.getFullYear()}-${mes}-${dia}`
}

/**
 * Convierte el `YYYY-MM-DD` de un input a fecha local, con la hora de
 * `hora` (por defecto, la actual). `new Date('YYYY-MM-DD')` lo
 * interpretaría como medianoche UTC (el día anterior en Perú); conservar
 * una hora mantiene el orden de lo registrado el mismo día.
 */
export function fechaDesdeInput(valor: string, hora: Date = new Date()): Date {
  const [anio, mes, dia] = valor.split('-').map(Number)
  return new Date(anio, mes - 1, dia, hora.getHours(), hora.getMinutes(), hora.getSeconds())
}

const formateadorUSD = new Intl.NumberFormat('es-PE', {
  style: 'currency',
  currency: 'USD',
  currencyDisplay: 'narrowSymbol',
})

/** `US$ 20.00` */
export function formatearDolares(monto: number): string {
  return `US${formateadorUSD.format(monto)}`
}
