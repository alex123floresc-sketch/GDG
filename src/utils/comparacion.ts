import type { Categoria, Transaccion } from '../types'
import { COLOR_SIN_CATEGORIA, esMovimientoReal } from './analisis'

export interface Rango {
  desde: Date
  /** Exclusivo. */
  hasta: Date
  etiqueta: string
}

export type ModoComparacion = 'mes' | 'anio' | 'personalizado'

const formateadorMes = new Intl.DateTimeFormat('es-PE', { month: 'long', year: 'numeric' })
const capitalizar = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

/** Rango de un mes (0-11). */
export function rangoMes(anio: number, mes: number): Rango {
  return {
    desde: new Date(anio, mes, 1),
    hasta: new Date(anio, mes + 1, 1),
    etiqueta: capitalizar(formateadorMes.format(new Date(anio, mes, 1))),
  }
}

export function rangoAnio(anio: number): Rango {
  return { desde: new Date(anio, 0, 1), hasta: new Date(anio + 1, 0, 1), etiqueta: String(anio) }
}

/**
 * Rangos por defecto para comparar: el mes (o año) actual contra el
 * anterior. Para que la comparación sea justa, si el periodo actual está
 * en curso el anterior se corta en el mismo día.
 */
export function rangosPorDefecto(modo: 'mes' | 'anio', hoy: Date = new Date()): { actual: Rango; anterior: Rango; parcial: boolean } {
  if (modo === 'mes') {
    const actual = rangoMes(hoy.getFullYear(), hoy.getMonth())
    const anterior = rangoMes(hoy.getFullYear(), hoy.getMonth() - 1)
    const dia = hoy.getDate()
    const diasMesAnterior = new Date(hoy.getFullYear(), hoy.getMonth(), 0).getDate()
    return {
      actual: { ...actual, hasta: new Date(hoy.getFullYear(), hoy.getMonth(), dia + 1) },
      anterior: {
        ...anterior,
        hasta: new Date(anterior.desde.getFullYear(), anterior.desde.getMonth(), Math.min(dia, diasMesAnterior) + 1),
      },
      parcial: true,
    }
  }
  const inicioHoy = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() + 1)
  return {
    actual: { ...rangoAnio(hoy.getFullYear()), hasta: inicioHoy },
    anterior: {
      ...rangoAnio(hoy.getFullYear() - 1),
      hasta: new Date(hoy.getFullYear() - 1, hoy.getMonth(), hoy.getDate() + 1),
    },
    parcial: true,
  }
}

export interface FilaComparacion {
  categoriaId: string
  nombre: string
  icono: string
  color: string
  a: number
  b: number
  diferencia: number
  /** (b − a) / a; null si a es 0. */
  cambio: number | null
}

export interface ResultadoComparacion {
  gastos: FilaComparacion[]
  ingresos: FilaComparacion[]
  totales: {
    ingresosA: number
    ingresosB: number
    gastosA: number
    gastosB: number
    ahorroA: number
    ahorroB: number
  }
}

/** Compara el periodo `a` (anterior) con el `b` (actual) por categoría. */
export function compararPeriodos(
  transacciones: Transaccion[],
  categorias: Categoria[],
  a: Rango,
  b: Rango,
): ResultadoComparacion {
  const categoriasPorId = new Map(categorias.map((c) => [c.id, c]))
  const acumulado = new Map<string, { a: number; b: number; tipo: Transaccion['tipo'] }>()

  for (const t of transacciones) {
    if (!esMovimientoReal(t)) continue
    const enA = t.fecha >= a.desde && t.fecha < a.hasta
    const enB = t.fecha >= b.desde && t.fecha < b.hasta
    if (!enA && !enB) continue
    const clave = `${t.tipo}|${t.categoriaId}`
    const fila = acumulado.get(clave) ?? { a: 0, b: 0, tipo: t.tipo }
    if (enA) fila.a += t.monto
    if (enB) fila.b += t.monto
    acumulado.set(clave, fila)
  }

  const filas = (tipo: Transaccion['tipo']) =>
    [...acumulado]
      .filter(([, f]) => f.tipo === tipo)
      .map(([clave, f]) => {
        const categoriaId = clave.split('|')[1]
        const categoria = categoriasPorId.get(categoriaId)
        return {
          categoriaId,
          nombre: categoria?.nombre ?? 'Sin categoría',
          icono: categoria?.icono ?? 'tag',
          color: categoria?.color ?? COLOR_SIN_CATEGORIA,
          a: f.a,
          b: f.b,
          diferencia: f.b - f.a,
          cambio: f.a > 0 ? (f.b - f.a) / f.a : null,
        }
      })
      .sort((x, y) => Math.max(y.a, y.b) - Math.max(x.a, x.b))

  const gastos = filas('gasto')
  const ingresos = filas('ingreso')
  const suma = (lista: FilaComparacion[], k: 'a' | 'b') => lista.reduce((s, f) => s + f[k], 0)
  const ingresosA = suma(ingresos, 'a')
  const ingresosB = suma(ingresos, 'b')
  const gastosA = suma(gastos, 'a')
  const gastosB = suma(gastos, 'b')

  return {
    gastos,
    ingresos,
    totales: { ingresosA, ingresosB, gastosA, gastosB, ahorroA: ingresosA - gastosA, ahorroB: ingresosB - gastosB },
  }
}
