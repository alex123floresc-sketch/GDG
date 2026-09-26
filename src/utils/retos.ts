import type { RetoAhorro, TipoReto } from '../types'

export const TIPOS_RETO: { id: TipoReto; nombre: string; descripcion: string; montoSugerido: number }[] = [
  {
    id: 'semanas52',
    nombre: 'Reto de 52 semanas',
    descripcion: 'La semana 1 guardas S/ 1, la 2 S/ 2… hasta la 52. Al final: S/ 1,378.',
    montoSugerido: 1,
  },
  {
    id: 'diario',
    nombre: 'Un monto cada día',
    descripcion: 'Guardas lo mismo todos los días durante el tiempo que elijas.',
    montoSugerido: 5,
  },
  {
    id: 'monedas',
    nombre: 'Guarda cada moneda',
    descripcion: 'Cada vez que te llega una moneda o billete de ese valor, va al chanchito.',
    montoSugerido: 5,
  },
]

export const NOMBRE_RETO: Record<TipoReto, string> = Object.fromEntries(
  TIPOS_RETO.map((t) => [t.id, t.nombre]),
) as Record<TipoReto, string>

const MS_DIA = 86_400_000

/** Fecha local como clave 'AAAA-MM-DD'. */
export function claveDia(fecha: Date): string {
  const m = String(fecha.getMonth() + 1).padStart(2, '0')
  const d = String(fecha.getDate()).padStart(2, '0')
  return `${fecha.getFullYear()}-${m}-${d}`
}

/** Días enteros entre dos fechas (por calendario, sin horas). */
function diasEntre(desde: Date, hasta: Date): number {
  const a = Date.UTC(desde.getFullYear(), desde.getMonth(), desde.getDate())
  const b = Date.UTC(hasta.getFullYear(), hasta.getMonth(), hasta.getDate())
  return Math.round((b - a) / MS_DIA)
}

export interface EstadoReto {
  /** Lo que toca ahora (clave y monto); undefined si el reto terminó o no empezó. */
  actual?: { clave: string; monto: number; etiqueta: string; cumplido: boolean }
  /** Pasos anteriores que quedaron sin cumplir (para ponerse al día). */
  atrasados: { clave: string; monto: number; etiqueta: string }[]
  cumplidos: number
  /** Total de pasos (undefined en `monedas`: no tiene fin). */
  total?: number
  /** Lo ahorrado con el reto. */
  ahorrado: number
  /** Lo que se ahorra si se cumple completo. */
  meta?: number
  terminado: boolean
}

/** Monto del paso `clave` de un reto. */
export function montoPaso(reto: RetoAhorro, clave: string): number {
  if (reto.tipo === 'semanas52') return Number(clave.slice(1)) * reto.montoBase
  return reto.montoBase
}

export function estadoReto(reto: RetoAhorro, hoy = new Date()): EstadoReto {
  const hechos = new Set(reto.cumplidos)
  const ahorrado = reto.cumplidos.reduce((s, c) => s + montoPaso(reto, c), 0)
  const transcurridos = diasEntre(reto.inicio, hoy)

  if (reto.tipo === 'monedas') {
    return {
      actual: { clave: `m${hoy.getTime()}`, monto: reto.montoBase, etiqueta: 'Guardar una más', cumplido: false },
      atrasados: [],
      cumplidos: reto.cumplidos.length,
      ahorrado,
      terminado: false,
    }
  }

  const semanal = reto.tipo === 'semanas52'
  const total = semanal ? 52 : Math.max(1, reto.duracion ?? 30)
  const meta = semanal ? (reto.montoBase * total * (total + 1)) / 2 : reto.montoBase * total
  // Índice (0-based) del paso de hoy.
  const indice = semanal ? Math.floor(transcurridos / 7) : transcurridos

  const paso = (i: number) => {
    if (semanal) {
      const clave = `s${i + 1}`
      return { clave, monto: montoPaso(reto, clave), etiqueta: `Semana ${i + 1}` }
    }
    const fecha = new Date(reto.inicio.getFullYear(), reto.inicio.getMonth(), reto.inicio.getDate() + i)
    return { clave: claveDia(fecha), monto: reto.montoBase, etiqueta: `Día ${i + 1}` }
  }

  const atrasados = []
  for (let i = Math.max(0, indice - 60); i < Math.min(indice, total); i++) {
    const p = paso(i)
    if (!hechos.has(p.clave)) atrasados.push(p)
  }

  const enCurso = indice >= 0 && indice < total
  return {
    actual: enCurso ? { ...paso(indice), cumplido: hechos.has(paso(indice).clave) } : undefined,
    atrasados,
    cumplidos: hechos.size,
    total,
    ahorrado,
    meta,
    terminado: indice >= total || hechos.size >= total,
  }
}
