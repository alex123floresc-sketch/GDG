import type { Categoria, Deseo, Meta, Transaccion } from '../types'
import { esMovimientoReal, resumenPorCategoria, variacion, type ResumenCategoria } from './analisis'
import { calcularRacha } from './logros'
import { normalizarTexto } from './reglas'

const MESES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
]
const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']

export interface ResumenAnual {
  anio: number
  ingresos: number
  gastos: number
  ahorro: number
  /** Ahorro / ingresos (null sin ingresos). */
  tasaAhorro: number | null
  movimientos: number
  mesMasGasto?: { nombre: string; monto: number }
  mesMasAhorro?: { nombre: string; monto: number }
  categorias: ResumenCategoria[]
  conceptoFrecuente?: { texto: string; veces: number; total: number }
  diaSemana?: { nombre: string; total: number }
  mayorGasto?: Transaccion
  /** Gasto promedio por día del año (o de lo que va del año). */
  promedioDiario: number
  mejorRacha: number
  metasCompletadas: number
  /** Lo que "ahorraste" descartando deseos este año. */
  deseosDescartados: number
  /** Variación de gastos vs. el año anterior (null si no hay datos). */
  vsAnterior: number | null
}

/** Todo lo destacado de un año ("tu año en números"). */
export function resumenAnual(
  transacciones: Transaccion[],
  categorias: Categoria[],
  metas: Meta[],
  deseos: Deseo[],
  anio: number,
  hoy: Date = new Date(),
): ResumenAnual {
  const delAnio = transacciones.filter((t) => esMovimientoReal(t) && t.fecha.getFullYear() === anio)
  const gastos = delAnio.filter((t) => t.tipo === 'gasto')
  const totalIngresos = delAnio.filter((t) => t.tipo === 'ingreso').reduce((s, t) => s + t.monto, 0)
  const totalGastos = gastos.reduce((s, t) => s + t.monto, 0)

  const porMes = Array.from({ length: 12 }, () => ({ ingresos: 0, gastos: 0 }))
  for (const t of delAnio) porMes[t.fecha.getMonth()][t.tipo === 'ingreso' ? 'ingresos' : 'gastos'] += t.monto
  const conGasto = porMes.map((m, i) => ({ i, ...m })).filter((m) => m.gastos > 0 || m.ingresos > 0)
  const mesGasto = [...conGasto].sort((a, b) => b.gastos - a.gastos)[0]
  const mesAhorro = [...conGasto].filter((m) => m.ingresos > 0).sort((a, b) => b.ingresos - b.gastos - (a.ingresos - a.gastos))[0]

  const conceptos = new Map<string, { texto: string; veces: number; total: number }>()
  for (const t of gastos) {
    if (!t.concepto) continue
    const clave = normalizarTexto(t.concepto)
    const c = conceptos.get(clave) ?? { texto: t.concepto.trim(), veces: 0, total: 0 }
    c.veces++
    c.total += t.monto
    conceptos.set(clave, c)
  }
  const conceptoFrecuente = [...conceptos.values()].sort((a, b) => b.veces - a.veces || b.total - a.total)[0]

  const porDia = Array(7).fill(0) as number[]
  for (const t of gastos) porDia[t.fecha.getDay()] += t.monto
  const diaTop = porDia.map((total, i) => ({ i, total })).sort((a, b) => b.total - a.total)[0]

  const finAnio = new Date(anio, 11, 31, 23, 59, 59)
  const hasta = hoy < finAnio && hoy.getFullYear() === anio ? hoy : finAnio
  const diasTranscurridos = Math.max(1, Math.round((hasta.getTime() - new Date(anio, 0, 1).getTime()) / 86_400_000) + 1)

  const anterior = transacciones
    .filter((t) => esMovimientoReal(t) && t.tipo === 'gasto' && t.fecha.getFullYear() === anio - 1)
    .reduce((s, t) => s + t.monto, 0)

  const metasCompletadas = metas.filter((m) => {
    const ahorrado = m.aportes.reduce((s, a) => s + a.monto, 0)
    const ultimo = m.aportes.reduce<Date | null>((u, a) => (!u || a.fecha > u ? a.fecha : u), null)
    return ahorrado >= m.montoObjetivo && ultimo?.getFullYear() === anio
  }).length

  return {
    anio,
    ingresos: totalIngresos,
    gastos: totalGastos,
    ahorro: totalIngresos - totalGastos,
    tasaAhorro: totalIngresos > 0 ? (totalIngresos - totalGastos) / totalIngresos : null,
    movimientos: delAnio.length,
    mesMasGasto: mesGasto ? { nombre: MESES[mesGasto.i], monto: mesGasto.gastos } : undefined,
    mesMasAhorro: mesAhorro ? { nombre: MESES[mesAhorro.i], monto: mesAhorro.ingresos - mesAhorro.gastos } : undefined,
    categorias: resumenPorCategoria(delAnio, categorias, 'gasto'),
    conceptoFrecuente,
    diaSemana: diaTop && diaTop.total > 0 ? { nombre: DIAS[diaTop.i], total: diaTop.total } : undefined,
    mayorGasto: [...gastos].sort((a, b) => b.monto - a.monto)[0],
    promedioDiario: totalGastos / diasTranscurridos,
    mejorRacha: calcularRacha(transacciones.filter((t) => t.fecha.getFullYear() === anio), hasta).mejor,
    metasCompletadas,
    deseosDescartados: deseos
      .filter((d) => d.estado === 'descartado' && d.fechaEstado?.getFullYear() === anio)
      .reduce((s, d) => s + d.precio, 0),
    vsAnterior: variacion(totalGastos, anterior),
  }
}
