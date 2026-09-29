import type {
  Ajustes,
  Categoria,
  Chanchito,
  Cuenta,
  Deseo,
  Deuda,
  Meta,
  Plantilla,
  Presupuesto,
  Regla,
  Transaccion,
} from '../types'
import { esMovimientoReal } from './analisis'
import { saldoChanchito } from './chanchitos'
import { estadoDeuda, estadoMeta, estadoPresupuestos } from './planificacion'
import { claveDia } from './retos'
import { calcularReparto, estadoFondo, mesesCompletos } from './salud'

const DIA = 86_400_000

export interface Racha {
  /** Días seguidos registrando algo, hasta hoy (o hasta ayer si hoy aún no). */
  actual: number
  mejor: number
  /** Ya registraste algo hoy. */
  hoy: boolean
}

/**
 * Racha de días con al menos un movimiento registrado (sin
 * transferencias ni los generados solos por recurrentes/cuotas).
 */
export function calcularRacha(transacciones: Transaccion[], hoy: Date = new Date()): Racha {
  const dias = new Set<string>()
  for (const t of transacciones) {
    if (esMovimientoReal(t) && t.origen !== 'recurrente') dias.add(claveDia(t.fecha))
  }
  const registroHoy = dias.has(claveDia(hoy))
  const inicio = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() - (registroHoy ? 0 : 1))
  let actual = 0
  while (dias.has(claveDia(new Date(inicio.getFullYear(), inicio.getMonth(), inicio.getDate() - actual)))) actual++

  // Mejor racha: recorre los días ordenados.
  const ordenados = [...dias].sort()
  let mejor = 0
  let corrida = 0
  let anterior: number | null = null
  for (const clave of ordenados) {
    const [a, m, d] = clave.split('-').map(Number)
    const t = Date.UTC(a, m - 1, d)
    corrida = anterior !== null && t - anterior === DIA ? corrida + 1 : 1
    mejor = Math.max(mejor, corrida)
    anterior = t
  }
  return { actual, mejor: Math.max(mejor, actual), hoy: registroHoy }
}

export interface Logro {
  id: string
  nombre: string
  descripcion: string
  icono: string
  logrado: boolean
  /** Progreso hacia el logro (si aplica). */
  progreso?: { actual: number; meta: number }
}

export interface DatosLogros {
  transacciones: Transaccion[]
  categorias: Categoria[]
  cuentas: Cuenta[]
  presupuestos: Presupuesto[]
  metas: Meta[]
  deudas: Deuda[]
  chanchitos: Chanchito[]
  reglas: Regla[]
  plantillas: Plantilla[]
  deseos: Deseo[]
  ajustes: Ajustes
  hoy?: Date
}

const conProgreso = (actual: number, meta: number) => ({ logrado: actual >= meta, progreso: { actual: Math.min(actual, meta), meta } })

/** Los logros, en orden de dificultad aproximada. */
export function calcularLogros(d: DatosLogros): Logro[] {
  const hoy = d.hoy ?? new Date()
  const reales = d.transacciones.filter(esMovimientoReal)
  const racha = calcularRacha(d.transacciones, hoy)

  // Meses completos (hasta 24 atrás) con su ahorro.
  const meses = mesesCompletos(24, hoy).map(([a, b]) => calcularReparto(d.transacciones, d.categorias, a, b))
  const ahorroAlto = meses.some((r) => r.ingresos > 0 && r.ahorro / r.ingresos >= 0.2)
  let seguidos = 0
  let maxSeguidos = 0
  for (const r of meses) {
    seguidos = r.ingresos > 0 && r.ahorro > 0 ? seguidos + 1 : 0
    maxSeguidos = Math.max(maxSeguidos, seguidos)
  }

  const mesPasado = new Date(hoy.getFullYear(), hoy.getMonth() - 1, 1)
  const presupuestosMesPasado = estadoPresupuestos(d.presupuestos, d.categorias, d.transacciones, mesPasado.getFullYear(), mesPasado.getMonth(), hoy)
  const debo = d.deudas.filter((x) => x.tipo === 'debo')
  const fondo = estadoFondo({ ...d, hoy })
  const mesesUsados = new Set(reales.map((t) => `${t.fecha.getFullYear()}-${t.fecha.getMonth()}`)).size
  const mayorChanchito = Math.max(0, ...d.chanchitos.map((c) => saldoChanchito(c, d.cuentas, d.transacciones)))
  const retoTerminado = d.chanchitos.some((c) => c.reto && c.reto.tipo !== 'monedas' && c.reto.cumplidos.length >= (c.reto.tipo === 'semanas52' ? 52 : (c.reto.duracion ?? 30)))

  return [
    { id: 'primer-paso', nombre: 'Primer paso', descripcion: 'Registra tu primer movimiento', icono: 'flag checkered', ...conProgreso(reales.length, 1) },
    { id: 'racha-3', nombre: 'Buen comienzo', descripcion: 'Registra algo 3 días seguidos', icono: 'fire', ...conProgreso(racha.mejor, 3) },
    { id: 'racha-7', nombre: 'Una semana entera', descripcion: 'Racha de 7 días registrando', icono: 'fire', ...conProgreso(racha.mejor, 7) },
    { id: 'racha-30', nombre: 'Imparable', descripcion: 'Racha de 30 días registrando', icono: 'fire', ...conProgreso(racha.mejor, 30) },
    { id: 'cien', nombre: 'Centenario', descripcion: '100 movimientos registrados', icono: 'list ol', ...conProgreso(reales.length, 100) },
    { id: 'mil', nombre: 'Contador experto', descripcion: '1000 movimientos registrados', icono: 'trophy', ...conProgreso(reales.length, 1000) },
    { id: 'etiquetas', nombre: 'Ordenado', descripcion: 'Usa etiquetas en 10 movimientos', icono: 'hashtag', ...conProgreso(reales.filter((t) => t.etiquetas?.length).length, 10) },
    { id: 'automatico', nombre: 'Piloto automático', descripcion: 'Crea 3 reglas o plantillas', icono: 'magic', ...conProgreso(d.reglas.length + d.plantillas.length, 3) },
    { id: 'planificador', nombre: 'Planificador', descripcion: 'Ten 3 presupuestos', icono: 'chart pie', ...conProgreso(d.presupuestos.length, 3) },
    {
      id: 'presupuesto-cumplido',
      nombre: 'Palabra cumplida',
      descripcion: 'Termina un mes sin pasarte de ningún presupuesto',
      icono: 'check circle',
      logrado: presupuestosMesPasado.length > 0 && presupuestosMesPasado.every((e) => e.nivel !== 'excedido'),
    },
    { id: 'ahorrador', nombre: 'Ahorrador', descripcion: 'Ahorra el 20 % de tus ingresos en un mes', icono: 'piggy bank', logrado: ahorroAlto },
    { id: 'tres-seguidos', nombre: 'Racha verde', descripcion: '3 meses seguidos gastando menos de lo que ganas', icono: 'leaf', ...conProgreso(maxSeguidos, 3) },
    { id: 'meta', nombre: 'Meta cumplida', descripcion: 'Completa una meta de ahorro', icono: 'bullseye', logrado: d.metas.some((m) => estadoMeta(m, hoy).completada) },
    { id: 'chanchito', nombre: 'Chanchito gordito', descripcion: 'Junta S/ 500 en un chanchito', icono: 'piggy bank', ...conProgreso(Math.floor(mayorChanchito), 500) },
    { id: 'reto', nombre: 'Reto superado', descripcion: 'Completa un reto de ahorro', icono: 'star', logrado: retoTerminado },
    {
      id: 'sin-deudas',
      nombre: 'Libre de deudas',
      descripcion: 'Paga todo lo que debías a otras personas',
      icono: 'handshake',
      logrado: debo.length > 0 && debo.every((x) => estadoDeuda(x, hoy).saldada),
    },
    {
      id: 'fondo',
      nombre: 'Colchón de seguridad',
      descripcion: 'Fondo de emergencia de 3 meses',
      icono: 'life ring',
      ...conProgreso(Math.floor((fondo.mesesCubiertos ?? 0) * 10) / 10, 3),
    },
    { id: 'deseo', nombre: 'Fuerza de voluntad', descripcion: 'Descarta un deseo en vez de comprarlo', icono: 'hand paper', logrado: d.deseos.some((x) => x.estado === 'descartado') },
    { id: 'anio', nombre: 'Un año contigo', descripcion: 'Registra movimientos en 12 meses distintos', icono: 'calendar check', ...conProgreso(mesesUsados, 12) },
  ]
}
