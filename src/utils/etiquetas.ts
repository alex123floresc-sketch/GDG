import type { Transaccion } from '../types'
import { esMovimientoReal } from './analisis'

/** "#Viaje Cusco" → "viaje-cusco" (minúsculas, sin '#', espacios → '-'). */
export function normalizarEtiqueta(texto: string): string {
  return texto
    .trim()
    .replace(/^#+/, '')
    .toLocaleLowerCase('es')
    .replace(/\s+/g, '-')
    .replace(/[^\p{L}\p{N}_-]/gu, '')
    .slice(0, 30)
}

/** Etiquetas usadas, de la más a la menos frecuente. */
export function etiquetasUsadas(transacciones: Transaccion[]): string[] {
  const conteo = new Map<string, number>()
  for (const t of transacciones) {
    for (const e of t.etiquetas ?? []) conteo.set(e, (conteo.get(e) ?? 0) + 1)
  }
  return [...conteo].sort((a, b) => b[1] - a[1]).map(([e]) => e)
}

export interface ResumenEtiqueta {
  etiqueta: string
  gastos: number
  ingresos: number
  cantidad: number
  desde: Date
  hasta: Date
}

/** Totales por etiqueta (una transacción con 2 etiquetas suma en ambas). */
export function resumenPorEtiqueta(transacciones: Transaccion[]): ResumenEtiqueta[] {
  const mapa = new Map<string, ResumenEtiqueta>()
  for (const t of transacciones) {
    if (!esMovimientoReal(t)) continue
    for (const etiqueta of t.etiquetas ?? []) {
      const r = mapa.get(etiqueta) ?? { etiqueta, gastos: 0, ingresos: 0, cantidad: 0, desde: t.fecha, hasta: t.fecha }
      if (t.tipo === 'gasto') r.gastos += t.monto
      else r.ingresos += t.monto
      r.cantidad++
      if (t.fecha < r.desde) r.desde = t.fecha
      if (t.fecha > r.hasta) r.hasta = t.fecha
      mapa.set(etiqueta, r)
    }
  }
  return [...mapa.values()].sort((a, b) => b.gastos - a.gastos)
}
