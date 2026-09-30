import type { TipoTransaccion } from '../types'

/*
 * Extractos bancarios (BCP, Interbank, BBVA, Scotiabank…) en Excel o CSV.
 * Cada banco (y cada versión de su web) exporta columnas distintas, así que
 * no hay formatos fijos: se adivina el mapeo por los encabezados y el
 * usuario lo corrige en la vista previa. Lógica pura (se prueba con Node).
 */

export interface MapeoExtracto {
  /** Índice de la fila de encabezados. */
  filaEncabezado: number
  fecha: number
  descripcion: number
  /** Monto con signo (una sola columna). -1 si hay cargo/abono separados. */
  monto: number
  cargo: number
  abono: number
  /** Nº de operación (solo ayuda a distinguir movimientos iguales). */
  operacion: number
  /** Tarjetas de crédito: los consumos vienen en positivo. */
  invertirSigno: boolean
}

export interface MovimientoExtracto {
  fecha: Date
  concepto: string
  monto: number
  tipo: TipoTransaccion
  /** Clave estable del movimiento (evita importarlo dos veces). */
  clave: string
}

export interface ResultadoExtracto {
  movimientos: MovimientoExtracto[]
  /** Filas con datos que no se pudieron interpretar (sin fecha o monto). */
  omitidas: number
}

const RE_FECHA = /fecha|^f\.?\s*(operaci|proceso|valor)|^date$|^d[ií]a$/i
const RE_FECHA_VALOR = /valor|proceso|contable/i
const RE_DESCRIPCION = /descrip|concepto|detalle|glosa|movimiento|comercio|establecimiento|referencia|narrativa/i
const RE_CARGO = /cargo|d[eé]bito|retiro|salida|egreso|consumo/i
const RE_ABONO = /abono|cr[eé]dito|dep[oó]sito|entrada|ingreso/i
const RE_MONTO = /monto|importe|valor(?!.*fecha)|amount|soles|s\/\.?/i
const RE_OPERACION = /operaci[oó]n|n[°º]|nro|n[uú]mero|referencia/i

const texto = (v: unknown) => String(v ?? '').trim()

/** Primera fila (de las 30 primeras) que parece la cabecera de la tabla. */
export function detectarFilaEncabezado(filas: unknown[][]): number {
  const limite = Math.min(filas.length, 30)
  for (let i = 0; i < limite; i++) {
    const celdas = (filas[i] ?? []).map(texto)
    const fecha = celdas.some((c) => RE_FECHA.test(c) && c.length < 40)
    const importe = celdas.some((c) => (RE_MONTO.test(c) || RE_CARGO.test(c) || RE_ABONO.test(c)) && c.length < 40)
    if (fecha && importe) return i
  }
  return -1
}

/** Adivina qué columna es qué a partir de los encabezados. */
export function detectarMapeo(filas: unknown[][]): MapeoExtracto | null {
  const filaEncabezado = detectarFilaEncabezado(filas)
  if (filaEncabezado === -1) return null
  const enc = (filas[filaEncabezado] ?? []).map(texto)
  const usadas = new Set<number>()
  const buscar = (re: RegExp, evitar?: RegExp) => {
    let i = enc.findIndex((h, j) => !usadas.has(j) && re.test(h) && !(evitar && evitar.test(h)))
    if (i === -1 && evitar) i = enc.findIndex((h, j) => !usadas.has(j) && re.test(h))
    if (i !== -1) usadas.add(i)
    return i
  }
  // Fecha de operación antes que la "fecha valor/proceso".
  const fecha = buscar(RE_FECHA, RE_FECHA_VALOR)
  // Columnas de fecha extra no deben confundirse con otras.
  enc.forEach((h, j) => RE_FECHA.test(h) && usadas.add(j))
  const cargo = buscar(RE_CARGO)
  const abono = buscar(RE_ABONO)
  const separado = cargo !== -1 && abono !== -1
  const monto = separado ? -1 : buscar(RE_MONTO)
  const descripcion = buscar(RE_DESCRIPCION)
  const operacion = buscar(RE_OPERACION)
  return {
    filaEncabezado,
    fecha,
    descripcion,
    monto: separado ? -1 : monto !== -1 ? monto : cargo !== -1 ? cargo : abono,
    cargo: separado ? cargo : -1,
    abono: separado ? abono : -1,
    operacion,
    invertirSigno: false,
  }
}

/**
 * Importe escrito de cualquier forma: 1,234.56 · 1.234,56 · -45.00 ·
 * (45.00) · 45.00- · "S/ 45" · "US$ 12.50". null si no es un número.
 */
export function parsearImporte(valor: unknown): number | null {
  if (typeof valor === 'number') return Number.isFinite(valor) ? valor : null
  let s = texto(valor)
  if (!s) return null
  let negativo = false
  if (/^\(.*\)$/.test(s)) {
    negativo = true
    s = s.slice(1, -1)
  }
  if (/-\s*$/.test(s)) {
    negativo = true
    s = s.replace(/-\s*$/, '')
  }
  if (/^\s*-/.test(s) || /[a-z/$]\s*-/i.test(s)) negativo = true
  s = s.replace(/[^\d.,]/g, '')
  if (!s || !/\d/.test(s)) return null
  const coma = s.lastIndexOf(',')
  const punto = s.lastIndexOf('.')
  if (coma > punto) {
    // 1.234,56 o 45,5 (coma decimal) — salvo miles con coma: 1,234
    const decimales = s.length - coma - 1
    s = decimales === 3 && punto === -1 && s.indexOf(',') === coma ? s.replace(/,/g, '') : s.replace(/\./g, '').replace(',', '.')
  } else {
    s = s.replace(/,/g, '')
  }
  const n = Number(s)
  if (!Number.isFinite(n)) return null
  return negativo ? -Math.abs(n) : n
}

const MESES: Record<string, number> = {
  ene: 0, jan: 0, feb: 1, mar: 2, abr: 3, apr: 3, may: 4, jun: 5, jul: 6,
  ago: 7, aug: 7, set: 8, sep: 8, oct: 9, nov: 10, dic: 11, dec: 11,
}

/** Fecha de un extracto (dd/mm/aaaa, aaaa-mm-dd, "05 SET 2026", "05/09"…). */
export function parsearFechaExtracto(valor: unknown, anioPorDefecto: number): Date | null {
  if (valor instanceof Date) return Number.isNaN(valor.getTime()) ? null : valor
  if (typeof valor === 'number' && valor > 20000 && valor < 80000) {
    // Número de serie de Excel (días desde 1899-12-30).
    const d = new Date(Math.round((valor - 25569) * 86400 * 1000))
    return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
  }
  const s = texto(valor).toLowerCase()
  if (!s) return null
  const crear = (a: number, m: number, d: number) => {
    const f = new Date(a, m, d, 12)
    return f.getMonth() === m && f.getDate() === d ? f : null
  }
  let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/)
  if (m) return crear(+m[1], +m[2] - 1, +m[3])
  m = s.match(/^(\d{1,2})[-/.](\d{1,2})(?:[-/.](\d{2,4}))?(?!\d)/)
  if (m) {
    const a = m[3] ? (m[3].length === 2 ? 2000 + +m[3] : +m[3]) : anioPorDefecto
    return crear(a, +m[2] - 1, +m[1])
  }
  m = s.match(/^(\d{1,2})[\s-/.]*([a-zñ]{3})[a-zñ]*\.?(?:[\s-/.,]+(\d{2,4}))?/)
  if (m && MESES[m[2]] !== undefined) {
    const a = m[3] ? (m[3].length === 2 ? 2000 + +m[3] : +m[3]) : anioPorDefecto
    return crear(a, MESES[m[2]], +m[1])
  }
  return null
}

const normalizar = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()

const fechaCorta = (f: Date) =>
  `${f.getFullYear()}-${String(f.getMonth() + 1).padStart(2, '0')}-${String(f.getDate()).padStart(2, '0')}`

/** Filas del extracto → movimientos, según el mapeo. */
export function interpretarExtracto(
  filas: unknown[][],
  mapeo: MapeoExtracto,
  anioPorDefecto = new Date().getFullYear(),
): ResultadoExtracto {
  const movimientos: MovimientoExtracto[] = []
  const repetidas = new Map<string, number>()
  let omitidas = 0

  for (let i = mapeo.filaEncabezado + 1; i < filas.length; i++) {
    const fila = filas[i] ?? []
    if (fila.every((c) => texto(c) === '')) continue

    const fecha = mapeo.fecha >= 0 ? parsearFechaExtracto(fila[mapeo.fecha], anioPorDefecto) : null
    let importe: number | null = null
    if (mapeo.cargo >= 0 || mapeo.abono >= 0) {
      const cargo = mapeo.cargo >= 0 ? parsearImporte(fila[mapeo.cargo]) : null
      const abono = mapeo.abono >= 0 ? parsearImporte(fila[mapeo.abono]) : null
      if (cargo) importe = -Math.abs(cargo)
      else if (abono) importe = Math.abs(abono)
    } else if (mapeo.monto >= 0) {
      importe = parsearImporte(fila[mapeo.monto])
    }
    const concepto = mapeo.descripcion >= 0 ? texto(fila[mapeo.descripcion]).replace(/\s+/g, ' ') : ''

    // Filas de totales/saldos al pie ("Saldo final", "Total cargos"): sin fecha.
    // Montos en cero (comisiones exoneradas) no son movimientos.
    if (importe === 0) continue
    if (!fecha || importe === null) {
      if (fecha || importe !== null) omitidas++
      continue
    }
    if (mapeo.invertirSigno) importe = -importe

    const tipo: TipoTransaccion = importe < 0 ? 'gasto' : 'ingreso'
    const monto = Math.round(Math.abs(importe) * 100) / 100
    const operacion = mapeo.operacion >= 0 ? texto(fila[mapeo.operacion]) : ''
    const base = `${fechaCorta(fecha)}|${tipo}|${monto.toFixed(2)}|${normalizar(concepto)}|${operacion}`
    // Dos movimientos idénticos el mismo día (dos pasajes) son distintos.
    const n = (repetidas.get(base) ?? 0) + 1
    repetidas.set(base, n)
    movimientos.push({ fecha, concepto, monto, tipo, clave: `${base}|${n}` })
  }
  return { movimientos, omitidas }
}

/** Nombre corto de cada columna para los selectores ("C · Descripción"). */
export function nombresColumnas(filas: unknown[][], filaEncabezado: number): string[] {
  const enc = (filas[filaEncabezado] ?? []).map(texto)
  const ancho = Math.max(enc.length, ...filas.slice(filaEncabezado, filaEncabezado + 20).map((f) => f?.length ?? 0))
  return Array.from({ length: ancho }, (_, i) => {
    const letra = i < 26 ? String.fromCharCode(65 + i) : `${i + 1}`
    return enc[i] ? `${letra} · ${enc[i]}` : `Columna ${letra}`
  })
}
