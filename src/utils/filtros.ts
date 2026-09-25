import type { Categoria, Cuenta, OrigenTransaccion, Transaccion } from '../types'
import { fechaParaInput, formatearFecha, formatearMoneda } from './formato'

export type Periodo = 'todo' | 'este_mes' | 'mes_pasado' | '3_meses' | 'este_anio' | 'personalizado'
export type TipoFiltro = 'todos' | 'gasto' | 'ingreso' | 'transferencia'

export interface FiltrosMovimientos {
  texto: string
  periodo: Periodo
  /** 'YYYY-MM-DD' (solo con periodo 'personalizado'). */
  desde: string
  hasta: string
  tipo: TipoFiltro
  categoriaId: string
  cuentaId: string
  origen: OrigenTransaccion | ''
  montoMin: string
  montoMax: string
}

export const FILTROS_VACIOS: FiltrosMovimientos = {
  texto: '',
  periodo: 'todo',
  desde: '',
  hasta: '',
  tipo: 'todos',
  categoriaId: '',
  cuentaId: '',
  origen: '',
  montoMin: '',
  montoMax: '',
}

export const PERIODOS: { id: Periodo; etiqueta: string }[] = [
  { id: 'todo', etiqueta: 'Todo' },
  { id: 'este_mes', etiqueta: 'Este mes' },
  { id: 'mes_pasado', etiqueta: 'Mes pasado' },
  { id: '3_meses', etiqueta: 'Últimos 3 meses' },
  { id: 'este_anio', etiqueta: 'Este año' },
  { id: 'personalizado', etiqueta: 'Personalizado' },
]

/** Rango [desde, hasta) del periodo, o null si no limita por fecha. */
export function rangoDelPeriodo(f: FiltrosMovimientos, hoy = new Date()): [Date, Date] | null {
  const a = hoy.getFullYear()
  const m = hoy.getMonth()
  switch (f.periodo) {
    case 'este_mes':
      return [new Date(a, m, 1), new Date(a, m + 1, 1)]
    case 'mes_pasado':
      return [new Date(a, m - 1, 1), new Date(a, m, 1)]
    case '3_meses':
      return [new Date(a, m - 2, 1), new Date(a, m + 1, 1)]
    case 'este_anio':
      return [new Date(a, 0, 1), new Date(a + 1, 0, 1)]
    case 'personalizado': {
      if (!f.desde && !f.hasta) return null
      const [dy, dm, dd] = (f.desde || '1970-01-01').split('-').map(Number)
      const [hy, hm, hd] = (f.hasta || fechaParaInput(new Date(2999, 0, 1))).split('-').map(Number)
      return [new Date(dy, dm - 1, dd), new Date(hy, hm - 1, hd + 1)]
    }
    default:
      return null
  }
}

const normalizar = (s: string) =>
  s.toLocaleLowerCase('es').normalize('NFD').replace(/\p{Diacritic}/gu, '')

/**
 * Aplica los filtros. Con `sinFechas` ignora el periodo (lo usa el
 * calendario, que navega por meses por su cuenta).
 */
export function aplicarFiltros(
  transacciones: Transaccion[],
  f: FiltrosMovimientos,
  categorias: Categoria[],
  { sinFechas = false, hoy = new Date() } = {},
): Transaccion[] {
  const rango = sinFechas ? null : rangoDelPeriodo(f, hoy)
  const texto = normalizar(f.texto.trim())
  const nombres = new Map(categorias.map((c) => [c.id, normalizar(c.nombre)]))
  const min = f.montoMin === '' ? null : Number(f.montoMin)
  const max = f.montoMax === '' ? null : Number(f.montoMax)

  return transacciones.filter((t) => {
    if (rango && (t.fecha < rango[0] || t.fecha >= rango[1])) return false
    if (f.tipo === 'transferencia' ? t.origen !== 'transferencia' : f.tipo !== 'todos' && (t.tipo !== f.tipo || t.origen === 'transferencia')) {
      return false
    }
    if (f.categoriaId && t.categoriaId !== f.categoriaId) return false
    if (f.cuentaId && t.cuentaId !== f.cuentaId) return false
    if (f.origen && t.origen !== f.origen) return false
    if (min !== null && t.monto < min) return false
    if (max !== null && t.monto > max) return false
    if (texto) {
      const enConcepto = normalizar(t.concepto ?? '').includes(texto)
      const enCategoria = (nombres.get(t.categoriaId) ?? '').includes(texto)
      const enOperacion = (t.nroOperacion ?? '').includes(texto)
      if (!enConcepto && !enCategoria && !enOperacion) return false
    }
    return true
  })
}

export interface ChipFiltro {
  clave: keyof FiltrosMovimientos | 'rango'
  texto: string
}

/** Filtros activos como etiquetas legibles (para mostrarlos y quitarlos). */
export function chipsDeFiltros(f: FiltrosMovimientos, categorias: Categoria[], cuentas: Cuenta[]): ChipFiltro[] {
  const chips: ChipFiltro[] = []
  if (f.periodo !== 'todo') {
    const rango = rangoDelPeriodo(f)
    chips.push({
      clave: 'rango',
      texto:
        f.periodo === 'personalizado' && rango
          ? `${f.desde ? formatearFecha(rango[0]) : '…'} – ${f.hasta ? formatearFecha(new Date(rango[1].getTime() - 1)) : '…'}`
          : PERIODOS.find((p) => p.id === f.periodo)!.etiqueta,
    })
  }
  if (f.tipo !== 'todos') {
    chips.push({ clave: 'tipo', texto: { gasto: 'Gastos', ingreso: 'Ingresos', transferencia: 'Transferencias' }[f.tipo] })
  }
  if (f.categoriaId) chips.push({ clave: 'categoriaId', texto: categorias.find((c) => c.id === f.categoriaId)?.nombre ?? 'Categoría' })
  if (f.cuentaId) chips.push({ clave: 'cuentaId', texto: cuentas.find((c) => c.id === f.cuentaId)?.nombre ?? 'Cuenta' })
  if (f.origen) {
    chips.push({ clave: 'origen', texto: { manual: 'Manuales', yape: 'De Yape', recurrente: 'Automáticos', transferencia: 'Transferencias' }[f.origen] })
  }
  if (f.montoMin) chips.push({ clave: 'montoMin', texto: `≥ ${formatearMoneda(Number(f.montoMin))}` })
  if (f.montoMax) chips.push({ clave: 'montoMax', texto: `≤ ${formatearMoneda(Number(f.montoMax))}` })
  return chips
}

/** Quita un filtro (vuelve a su valor vacío). */
export function quitarFiltro(f: FiltrosMovimientos, clave: ChipFiltro['clave']): FiltrosMovimientos {
  if (clave === 'rango') return { ...f, periodo: 'todo', desde: '', hasta: '' }
  return { ...f, [clave]: FILTROS_VACIOS[clave] }
}
