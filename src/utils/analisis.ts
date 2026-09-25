import type { Categoria, Transaccion } from '../types'

/** Agrupación temporal del análisis. */
export type Granularidad = 'mes' | 'trimestre'

export interface ResumenPeriodo {
  /** Clave estable: `2026-03` (mes) o `2026-T1` (trimestre). */
  clave: string
  /** Etiqueta corta para ejes: `Mar` / `T1`. */
  etiqueta: string
  /** Etiqueta larga para tablas/exportación: `Marzo 2026` / `T1 2026 (Ene–Mar)`. */
  etiquetaLarga: string
  ingresos: number
  gastos: number
  balance: number
  cantidad: number
}

export interface ResumenCategoria {
  categoriaId: string
  nombre: string
  icono: string
  color: string
  total: number
  cantidad: number
  /** 0–1 respecto al total del mismo tipo en el rango. */
  porcentaje: number
}

const MESES_CORTOS = [
  'Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun',
  'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic',
]

const MESES_LARGOS = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
]

export const COLOR_SIN_CATEGORIA = '#898781'

export function trimestreDe(fecha: Date): number {
  return Math.floor(fecha.getMonth() / 3) + 1
}

/** Clave del periodo al que pertenece una fecha (hora local). */
export function clavePeriodo(fecha: Date, granularidad: Granularidad): string {
  const anio = fecha.getFullYear()
  return granularidad === 'mes'
    ? `${anio}-${String(fecha.getMonth() + 1).padStart(2, '0')}`
    : `${anio}-T${trimestreDe(fecha)}`
}

/** Periodos vacíos de un año completo (12 meses o 4 trimestres), en orden. */
function periodosDelAnio(anio: number, granularidad: Granularidad): ResumenPeriodo[] {
  const vacio = { ingresos: 0, gastos: 0, balance: 0, cantidad: 0 }

  if (granularidad === 'mes') {
    return MESES_CORTOS.map((corto, i) => ({
      clave: `${anio}-${String(i + 1).padStart(2, '0')}`,
      etiqueta: corto,
      etiquetaLarga: `${MESES_LARGOS[i]} ${anio}`,
      ...vacio,
    }))
  }

  return [1, 2, 3, 4].map((t) => ({
    clave: `${anio}-T${t}`,
    etiqueta: `T${t}`,
    etiquetaLarga: `T${t} ${anio} (${MESES_CORTOS[(t - 1) * 3]}–${MESES_CORTOS[(t - 1) * 3 + 2]})`,
    ...vacio,
  }))
}

/** Ingresos, gastos y balance por mes o trimestre del año indicado. */
export function resumenPorPeriodo(
  transacciones: Transaccion[],
  anio: number,
  granularidad: Granularidad,
): ResumenPeriodo[] {
  const periodos = periodosDelAnio(anio, granularidad)
  const porClave = new Map(periodos.map((p) => [p.clave, p]))

  for (const t of transacciones) {
    if (t.fecha.getFullYear() !== anio) continue
    const periodo = porClave.get(clavePeriodo(t.fecha, granularidad))
    if (!periodo) continue

    if (t.tipo === 'ingreso') periodo.ingresos += t.monto
    else periodo.gastos += t.monto
    periodo.cantidad++
  }

  for (const p of periodos) p.balance = p.ingresos - p.gastos

  return periodos
}

/** Los últimos `n` meses hasta `hasta` (incluido), para gráficos de tendencia. */
export function resumenUltimosMeses(
  transacciones: Transaccion[],
  n: number,
  hasta: Date = new Date(),
): ResumenPeriodo[] {
  const periodos: ResumenPeriodo[] = []

  for (let i = n - 1; i >= 0; i--) {
    const fecha = new Date(hasta.getFullYear(), hasta.getMonth() - i, 1)
    const mes = fecha.getMonth()
    periodos.push({
      clave: clavePeriodo(fecha, 'mes'),
      etiqueta: MESES_CORTOS[mes],
      etiquetaLarga: `${MESES_LARGOS[mes]} ${fecha.getFullYear()}`,
      ingresos: 0,
      gastos: 0,
      balance: 0,
      cantidad: 0,
    })
  }

  const porClave = new Map(periodos.map((p) => [p.clave, p]))

  for (const t of transacciones) {
    const periodo = porClave.get(clavePeriodo(t.fecha, 'mes'))
    if (!periodo) continue
    if (t.tipo === 'ingreso') periodo.ingresos += t.monto
    else periodo.gastos += t.monto
    periodo.cantidad++
  }

  for (const p of periodos) p.balance = p.ingresos - p.gastos

  return periodos
}

/** Total por categoría de un tipo (ingreso/gasto), de mayor a menor. */
export function resumenPorCategoria(
  transacciones: Transaccion[],
  categorias: Categoria[],
  tipo: Transaccion['tipo'],
): ResumenCategoria[] {
  const categoriasPorId = new Map(categorias.map((c) => [c.id, c]))
  const acumulado = new Map<string, { total: number; cantidad: number }>()
  let totalGeneral = 0

  for (const t of transacciones) {
    if (t.tipo !== tipo) continue
    const actual = acumulado.get(t.categoriaId) ?? { total: 0, cantidad: 0 }
    actual.total += t.monto
    actual.cantidad++
    acumulado.set(t.categoriaId, actual)
    totalGeneral += t.monto
  }

  return [...acumulado.entries()]
    .map(([categoriaId, { total, cantidad }]) => {
      const categoria = categoriasPorId.get(categoriaId)
      return {
        categoriaId,
        nombre: categoria?.nombre ?? 'Sin categoría',
        icono: categoria?.icono ?? 'tag',
        color: categoria?.color ?? COLOR_SIN_CATEGORIA,
        total,
        cantidad,
        porcentaje: totalGeneral > 0 ? total / totalGeneral : 0,
      }
    })
    .sort((a, b) => b.total - a.total)
}

/** ¿La transacción cae dentro del periodo con esa clave? */
export function enPeriodo(
  t: Transaccion,
  clave: string,
  granularidad: Granularidad,
): boolean {
  return clavePeriodo(t.fecha, granularidad) === clave
}

/** Años con movimientos (más el actual), del más reciente al más antiguo. */
export function aniosDisponibles(transacciones: Transaccion[]): number[] {
  const anios = new Set<number>([new Date().getFullYear()])
  for (const t of transacciones) anios.add(t.fecha.getFullYear())
  return [...anios].sort((a, b) => b - a)
}

/** Variación relativa entre dos valores (null si no hay base de comparación). */
export function variacion(actual: number, anterior: number): number | null {
  if (anterior === 0) return null
  return (actual - anterior) / anterior
}
