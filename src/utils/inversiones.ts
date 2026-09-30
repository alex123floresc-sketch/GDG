import type { Inversion, OperacionInversion, TipoInversion } from '../types'

/*
 * Cálculos de las inversiones en bolsa (Planificar → Inversiones). Costo
 * promedio ponderado: al vender, lo vendido "se lleva" el costo promedio
 * y la diferencia con lo cobrado es la ganancia realizada.
 */

export const TIPOS_INVERSION: { id: TipoInversion; etiqueta: string; icono: string }[] = [
  { id: 'accion', etiqueta: 'Acción', icono: 'building outline' },
  { id: 'etf', etiqueta: 'ETF', icono: 'layer group' },
  { id: 'fondo', etiqueta: 'Fondo mutuo', icono: 'chart pie' },
  { id: 'bono', etiqueta: 'Bono', icono: 'file alternate outline' },
  { id: 'cripto', etiqueta: 'Cripto', icono: 'bitcoin' },
  { id: 'otro', etiqueta: 'Otro', icono: 'chartline' },
]

export const infoTipoInversion = (tipo: TipoInversion) =>
  TIPOS_INVERSION.find((t) => t.id === tipo) ?? TIPOS_INVERSION[TIPOS_INVERSION.length - 1]

const redondear = (n: number, decimales = 2) => {
  const f = 10 ** decimales
  return Math.round(n * f) / f
}

export interface EstadoInversion {
  /** Unidades que tienes hoy. */
  cantidad: number
  /** Costo por unidad de lo que tienes (incluye comisiones de compra). */
  costoPromedio: number
  /** Costo de lo que tienes hoy. */
  invertido: number
  /** Todo lo que pusiste en compras (histórico). */
  aportado: number
  /** Precio usado para valorizar: el anotado o, si no hay, el de la última compra. */
  precio: number
  /** El precio viene de una compra, no de una actualización. */
  precioEstimado: boolean
  valorActual: number
  /** Valor actual − invertido. */
  gananciaNoRealizada: number
  /** De las ventas (ya descontado el costo y las comisiones). */
  gananciaRealizada: number
  dividendos: number
  /** No realizada + realizada + dividendos. */
  gananciaTotal: number
  /** Ganancia total ÷ lo aportado (null sin compras). */
  rentabilidad: number | null
  /** Ganancia no realizada ÷ invertido (null sin posición). */
  rentabilidadPosicion: number | null
}

export const ordenarOperaciones = (ops: OperacionInversion[]) =>
  [...ops].sort((a, b) => a.fecha.getTime() - b.fecha.getTime())

export function estadoInversion(inv: Inversion): EstadoInversion {
  let cantidad = 0
  let costo = 0
  let aportado = 0
  let realizada = 0
  let dividendos = 0
  let ultimoPrecio = 0

  for (const op of ordenarOperaciones(inv.operaciones)) {
    const comision = op.comision ?? 0
    if (op.tipo === 'compra') {
      costo += op.cantidad * op.precio + comision
      aportado += op.cantidad * op.precio + comision
      cantidad += op.cantidad
      ultimoPrecio = op.precio
    } else if (op.tipo === 'venta') {
      const vendida = Math.min(op.cantidad, cantidad)
      const costoVendido = cantidad > 0 ? (costo / cantidad) * vendida : 0
      realizada += vendida * op.precio - comision - costoVendido
      costo -= costoVendido
      cantidad -= vendida
      ultimoPrecio = op.precio
    } else {
      dividendos += op.precio
    }
  }

  // Restos por redondeo (vender "todo" deja 1e-12).
  if (Math.abs(cantidad) < 1e-9) {
    cantidad = 0
    costo = 0
  }
  const precio = inv.precioActual ?? ultimoPrecio
  const valorActual = cantidad * precio
  const gananciaNoRealizada = valorActual - costo
  const gananciaTotal = gananciaNoRealizada + realizada + dividendos
  return {
    cantidad: redondear(cantidad, 8),
    costoPromedio: cantidad > 0 ? costo / cantidad : 0,
    invertido: redondear(costo),
    aportado: redondear(aportado),
    precio,
    precioEstimado: inv.precioActual === undefined,
    valorActual: redondear(valorActual),
    gananciaNoRealizada: redondear(gananciaNoRealizada),
    gananciaRealizada: redondear(realizada),
    dividendos: redondear(dividendos),
    gananciaTotal: redondear(gananciaTotal),
    rentabilidad: aportado > 0 ? gananciaTotal / aportado : null,
    rentabilidadPosicion: costo > 0 ? gananciaNoRealizada / costo : null,
  }
}

/** Unidades disponibles para vender en una fecha (para validar una venta). */
export function cantidadAlDia(inv: Inversion, fecha: Date, excluirId?: string): number {
  let cantidad = 0
  for (const op of ordenarOperaciones(inv.operaciones)) {
    if (op.id === excluirId || op.fecha > fecha) continue
    if (op.tipo === 'compra') cantidad += op.cantidad
    else if (op.tipo === 'venta') cantidad -= op.cantidad
  }
  return Math.max(0, cantidad)
}

export interface ResumenPortafolio {
  /** Todo en soles. */
  valorActual: number
  invertido: number
  gananciaNoRealizada: number
  gananciaRealizada: number
  dividendos: number
  gananciaTotal: number
  rentabilidadPosicion: number | null
  /** Valor actual por tipo de instrumento (en soles). */
  porTipo: { tipo: TipoInversion; valor: number }[]
  /** Hay posiciones en dólares (los totales dependen del tipo de cambio). */
  conDolares: boolean
}

/** Totales del portafolio en soles (lo que está en US$ × `tipoCambio`). */
export function resumenPortafolio(inversiones: Inversion[], tipoCambio: number): ResumenPortafolio {
  const r = {
    valorActual: 0,
    invertido: 0,
    gananciaNoRealizada: 0,
    gananciaRealizada: 0,
    dividendos: 0,
    gananciaTotal: 0,
  }
  const porTipo = new Map<TipoInversion, number>()
  let conDolares = false
  for (const inv of inversiones) {
    if (inv.archivada) continue
    const e = estadoInversion(inv)
    const f = inv.moneda === 'USD' ? tipoCambio : 1
    if (inv.moneda === 'USD' && (e.cantidad > 0 || e.gananciaTotal !== 0)) conDolares = true
    r.valorActual += e.valorActual * f
    r.invertido += e.invertido * f
    r.gananciaNoRealizada += e.gananciaNoRealizada * f
    r.gananciaRealizada += e.gananciaRealizada * f
    r.dividendos += e.dividendos * f
    r.gananciaTotal += e.gananciaTotal * f
    if (e.valorActual > 0) porTipo.set(inv.tipo, (porTipo.get(inv.tipo) ?? 0) + e.valorActual * f)
  }
  return {
    valorActual: redondear(r.valorActual),
    invertido: redondear(r.invertido),
    gananciaNoRealizada: redondear(r.gananciaNoRealizada),
    gananciaRealizada: redondear(r.gananciaRealizada),
    dividendos: redondear(r.dividendos),
    gananciaTotal: redondear(r.gananciaTotal),
    rentabilidadPosicion: r.invertido > 0 ? r.gananciaNoRealizada / r.invertido : null,
    porTipo: [...porTipo.entries()].map(([tipo, valor]) => ({ tipo, valor: redondear(valor) })).sort((a, b) => b.valor - a.valor),
    conDolares,
  }
}

/** Cantidad legible: 10 · 2.5 · 0.00125 (cripto). */
export function formatearCantidad(n: number): string {
  return new Intl.NumberFormat('es-PE', { maximumFractionDigits: n !== 0 && Math.abs(n) < 1 ? 8 : 4 }).format(n)
}
