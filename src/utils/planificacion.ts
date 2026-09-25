import type { Categoria, Deuda, Meta, Presupuesto, Transaccion } from '../types'
import { esMovimientoReal } from './analisis'

/** Umbral de "vas por buen camino / cuidado / te pasaste". */
export const UMBRAL_ALERTA = 0.8

export type NivelPresupuesto = 'ok' | 'alerta' | 'excedido'

export interface EstadoPresupuesto {
  presupuesto: Presupuesto
  categoria?: Categoria
  gastado: number
  restante: number
  /** gastado / límite (puede pasar de 1). */
  porcentaje: number
  nivel: NivelPresupuesto
  /** Gasto estimado a fin de mes al ritmo actual (solo el mes en curso). */
  proyeccion?: number
}

/**
 * Estado de cada presupuesto en el mes `mes` (0-11) de `anio`: cuánto se
 * gastó en su categoría, cuánto queda y, si es el mes en curso, a cuánto
 * llegaría al ritmo actual.
 */
export function estadoPresupuestos(
  presupuestos: Presupuesto[],
  categorias: Categoria[],
  transacciones: Transaccion[],
  anio: number,
  mes: number,
  hoy: Date = new Date(),
): EstadoPresupuesto[] {
  const categoriasPorId = new Map(categorias.map((c) => [c.id, c]))
  const gastoPorCategoria = new Map<string, number>()

  for (const t of transacciones) {
    if (t.tipo !== 'gasto' || !esMovimientoReal(t)) continue
    if (t.fecha.getFullYear() !== anio || t.fecha.getMonth() !== mes) continue
    gastoPorCategoria.set(t.categoriaId, (gastoPorCategoria.get(t.categoriaId) ?? 0) + t.monto)
  }

  const esMesActual = hoy.getFullYear() === anio && hoy.getMonth() === mes
  const diasDelMes = new Date(anio, mes + 1, 0).getDate()
  const diaActual = hoy.getDate()

  return presupuestos
    .map((presupuesto) => {
      const gastado = gastoPorCategoria.get(presupuesto.categoriaId) ?? 0
      const porcentaje = presupuesto.montoLimite > 0 ? gastado / presupuesto.montoLimite : 0
      return {
        presupuesto,
        categoria: categoriasPorId.get(presupuesto.categoriaId),
        gastado,
        restante: presupuesto.montoLimite - gastado,
        porcentaje,
        nivel: (porcentaje >= 1 ? 'excedido' : porcentaje >= UMBRAL_ALERTA ? 'alerta' : 'ok') as NivelPresupuesto,
        proyeccion: esMesActual && diaActual > 0 ? (gastado / diaActual) * diasDelMes : undefined,
      }
    })
    .sort((a, b) => b.porcentaje - a.porcentaje)
}

export interface EstadoMeta {
  ahorrado: number
  restante: number
  porcentaje: number
  completada: boolean
  /** Meses que quedan hasta la fecha límite (mínimo 1). */
  mesesRestantes?: number
  /** Cuánto habría que ahorrar por mes para llegar a tiempo. */
  ahorroMensualNecesario?: number
  vencida: boolean
}

export function estadoMeta(meta: Meta, hoy: Date = new Date()): EstadoMeta {
  const ahorrado = meta.aportes.reduce((s, a) => s + a.monto, 0)
  const restante = Math.max(0, meta.montoObjetivo - ahorrado)
  const completada = ahorrado >= meta.montoObjetivo

  let mesesRestantes: number | undefined
  if (meta.fechaLimite) {
    const meses =
      (meta.fechaLimite.getFullYear() - hoy.getFullYear()) * 12 +
      (meta.fechaLimite.getMonth() - hoy.getMonth())
    mesesRestantes = Math.max(1, meses + (meta.fechaLimite.getDate() >= hoy.getDate() ? 1 : 0))
  }

  return {
    ahorrado,
    restante,
    porcentaje: meta.montoObjetivo > 0 ? Math.min(1, ahorrado / meta.montoObjetivo) : 0,
    completada,
    mesesRestantes,
    ahorroMensualNecesario: mesesRestantes && !completada ? restante / mesesRestantes : undefined,
    vencida: Boolean(meta.fechaLimite && !completada && meta.fechaLimite < hoy),
  }
}

export interface EstadoDeuda {
  pagado: number
  pendiente: number
  porcentaje: number
  saldada: boolean
  vencida: boolean
  diasParaVencer?: number
}

export function estadoDeuda(deuda: Deuda, hoy: Date = new Date()): EstadoDeuda {
  const pagado = deuda.abonos.reduce((s, a) => s + a.monto, 0)
  const pendiente = Math.max(0, deuda.monto - pagado)
  const saldada = pendiente < 0.005
  const inicioHoy = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate())
  const diasParaVencer = deuda.fechaLimite
    ? Math.round((deuda.fechaLimite.getTime() - inicioHoy.getTime()) / 86_400_000)
    : undefined

  return {
    pagado,
    pendiente,
    porcentaje: deuda.monto > 0 ? Math.min(1, pagado / deuda.monto) : 0,
    saldada,
    vencida: !saldada && diasParaVencer !== undefined && diasParaVencer < 0,
    diasParaVencer,
  }
}
