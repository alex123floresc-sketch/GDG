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
