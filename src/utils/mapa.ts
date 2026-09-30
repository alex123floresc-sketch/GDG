import type { Categoria, Transaccion } from '../types'
import { esMovimientoReal } from './analisis'
import { idRaiz } from './categorias'

/*
 * Vista de mapa (Análisis → Mapa): los gastos que tienen `ubicacion`,
 * agrupados por lugar para la tabla que acompaña al mapa.
 */

export type PeriodoMapa = 'mes' | 'tres' | 'anio' | 'todo'

export const PERIODOS_MAPA: { id: PeriodoMapa; etiqueta: string }[] = [
  { id: 'mes', etiqueta: 'Este mes' },
  { id: 'tres', etiqueta: '3 meses' },
  { id: 'anio', etiqueta: '12 meses' },
  { id: 'todo', etiqueta: 'Todo' },
]

export function desdeDePeriodo(periodo: PeriodoMapa, hoy = new Date()): Date | null {
  switch (periodo) {
    case 'mes':
      return new Date(hoy.getFullYear(), hoy.getMonth(), 1)
    case 'tres':
      return new Date(hoy.getFullYear(), hoy.getMonth() - 2, 1)
    case 'anio':
      return new Date(hoy.getFullYear(), hoy.getMonth() - 11, 1)
    default:
      return null
  }
}

/** Gastos reales con ubicación desde `desde` (null = todos). */
export function gastosConUbicacion(transacciones: Transaccion[], desde: Date | null): Transaccion[] {
  return transacciones.filter(
    (t) =>
      t.tipo === 'gasto' &&
      t.ubicacion &&
      Number.isFinite(t.ubicacion.lat) &&
      Number.isFinite(t.ubicacion.lng) &&
      esMovimientoReal(t) &&
      (!desde || t.fecha >= desde),
  )
}

export interface LugarMapa {
  clave: string
  nombre: string
  lat: number
  lng: number
  total: number
  veces: number
  /** Categoría (raíz) con más gasto en el lugar. */
  categoriaId: string
  ultima: Date
  transacciones: Transaccion[]
}

/** Distancia aproximada en metros (suficiente para agrupar puntos cercanos). */
function metros(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const rad = Math.PI / 180
  const x = (b.lng - a.lng) * rad * Math.cos(((a.lat + b.lat) / 2) * rad)
  const y = (b.lat - a.lat) * rad
  return Math.sqrt(x * x + y * y) * 6_371_000
}

const normalizar = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .toLowerCase()

/**
 * Agrupa por nombre del lugar (sin tildes/mayúsculas) o, sin nombre, por
 * cercanía (≤ 60 m). Ordenado por total gastado.
 */
export function agruparLugares(gastos: Transaccion[], categorias: Categoria[], radio = 60): LugarMapa[] {
  const porId = new Map(categorias.map((c) => [c.id, c]))
  const lugares: (LugarMapa & { porCategoria: Map<string, number> })[] = []
  const porNombre = new Map<string, (typeof lugares)[number]>()

  for (const t of [...gastos].sort((a, b) => a.fecha.getTime() - b.fecha.getTime())) {
    const u = t.ubicacion!
    const nombre = u.lugar?.trim()
    let lugar = nombre ? porNombre.get(normalizar(nombre)) : undefined
    if (!lugar && !nombre) lugar = lugares.find((l) => !l.clave.startsWith('n:') && metros(l, u) <= radio)
    if (!lugar) {
      lugar = {
        clave: nombre ? `n:${normalizar(nombre)}` : `p:${t.id}`,
        nombre: nombre || t.concepto?.trim() || 'Sin nombre',
        lat: u.lat,
        lng: u.lng,
        total: 0,
        veces: 0,
        categoriaId: '',
        ultima: t.fecha,
        transacciones: [],
        porCategoria: new Map(),
      }
      lugares.push(lugar)
      if (nombre) porNombre.set(normalizar(nombre), lugar)
    }
    // Centro del grupo = promedio de sus puntos.
    lugar.lat = (lugar.lat * lugar.veces + u.lat) / (lugar.veces + 1)
    lugar.lng = (lugar.lng * lugar.veces + u.lng) / (lugar.veces + 1)
    lugar.total += t.monto
    lugar.veces += 1
    lugar.ultima = t.fecha
    lugar.transacciones.push(t)
    const raiz = t.categoriaId ? idRaiz(t.categoriaId, porId) : ''
    lugar.porCategoria.set(raiz, (lugar.porCategoria.get(raiz) ?? 0) + t.monto)
  }

  return lugares
    .map(({ porCategoria, ...l }) => ({
      ...l,
      categoriaId: [...porCategoria.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? '',
    }))
    .sort((a, b) => b.total - a.total)
}
