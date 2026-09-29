import type { Ajustes, Transaccion } from '../types'
import { esMovimientoReal } from './analisis'

/** Horas de trabajo por semana si no se configuró (jornada legal en Perú). */
export const HORAS_SEMANA_POR_DEFECTO = 48

export interface ValorHora {
  /** Soles que ganas por hora de trabajo. */
  valor: number
  /** Calculado con el promedio de ingresos (no configurado a mano). */
  estimado: boolean
  ingresoMensual: number
  horasSemana: number
}

/**
 * Cuánto vale tu hora de trabajo: ingreso mensual ÷ horas al mes
 * (horas por semana × 52 ÷ 12). Sin ingreso configurado usa el promedio
 * de los últimos 3 meses completos. `null` si no hay cómo calcularlo.
 */
export function valorHora(ajustes: Ajustes, transacciones: Transaccion[], hoy: Date = new Date()): ValorHora | null {
  const horasSemana = ajustes.horasSemana && ajustes.horasSemana > 0 ? ajustes.horasSemana : HORAS_SEMANA_POR_DEFECTO
  const horasMes = (horasSemana * 52) / 12
  let ingresoMensual = ajustes.ingresoMensual ?? 0
  let estimado = false

  if (!(ingresoMensual > 0)) {
    const desde = new Date(hoy.getFullYear(), hoy.getMonth() - 3, 1)
    const hasta = new Date(hoy.getFullYear(), hoy.getMonth(), 1)
    const porMes = new Map<number, number>()
    for (const t of transacciones) {
      if (t.tipo !== 'ingreso' || !esMovimientoReal(t) || t.fecha < desde || t.fecha >= hasta) continue
      porMes.set(t.fecha.getMonth(), (porMes.get(t.fecha.getMonth()) ?? 0) + t.monto)
    }
    if (porMes.size === 0) return null
    ingresoMensual = [...porMes.values()].reduce((s, v) => s + v, 0) / porMes.size
    estimado = true
  }

  return { valor: ingresoMensual / horasMes, estimado, ingresoMensual, horasSemana }
}

/** "2 h 15 min", "45 min", "3 días y 2 h" (días de 8 h). Quien lo usa agrega "de trabajo". */
export function textoHoras(monto: number, valor: number): string {
  if (!(valor > 0) || !(monto > 0)) return ''
  const minutos = Math.max(1, Math.round((monto / valor) * 60))
  if (minutos < 60) return `${minutos} min`
  const horas = Math.floor(minutos / 60)
  const resto = minutos % 60
  if (horas < 8) return resto ? `${horas} h ${resto} min` : `${horas} h`
  const dias = Math.floor(horas / 8)
  const horasResto = horas % 8
  return `${dias} día${dias === 1 ? '' : 's'}${horasResto ? ` y ${horasResto} h` : ''}`
}
