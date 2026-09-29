import type { Cuenta, TipoCuenta, Transaccion } from '../types'

export const TIPOS_CUENTA: { id: TipoCuenta; etiqueta: string; icono: string }[] = [
  { id: 'efectivo', etiqueta: 'Efectivo', icono: 'money bill alternate outline' },
  { id: 'banco', etiqueta: 'Banco', icono: 'university' },
  { id: 'billetera_digital', etiqueta: 'Billetera digital', icono: 'mobile alternate' },
  { id: 'tarjeta_credito', etiqueta: 'Tarjeta de crédito', icono: 'credit card' },
  { id: 'otro', etiqueta: 'Otra', icono: 'wallet' },
]

/** Tipos de sistema: no se eligen al crear una cuenta. */
const TIPOS_SISTEMA: { id: TipoCuenta; etiqueta: string; icono: string }[] = [
  { id: 'chanchito', etiqueta: 'Chanchito', icono: 'piggy bank' },
]

export const ICONO_CUENTA: Record<TipoCuenta, string> = Object.fromEntries(
  [...TIPOS_CUENTA, ...TIPOS_SISTEMA].map((t) => [t.id, t.icono]),
) as Record<TipoCuenta, string>

export const ETIQUETA_CUENTA: Record<TipoCuenta, string> = Object.fromEntries(
  [...TIPOS_CUENTA, ...TIPOS_SISTEMA].map((t) => [t.id, t.etiqueta]),
) as Record<TipoCuenta, string>

/**
 * Cuentas donde se registran gastos/ingresos a mano: sin las de los
 * chanchitos (su dinero se mueve desde Planificar → Chanchitos).
 */
export function cuentasOperativas(cuentas: Cuenta[]): Cuenta[] {
  return cuentas.filter((c) => c.tipo !== 'chanchito')
}

/**
 * Saldo actual de una cuenta: saldo inicial + ingresos − gastos (incluye
 * transferencias). En una tarjeta de crédito un saldo negativo es deuda.
 */
export function saldoCuenta(cuenta: Cuenta, transacciones: Transaccion[]): number {
  return transacciones.reduce(
    (saldo, t) =>
      t.cuentaId !== cuenta.id ? saldo : saldo + (t.tipo === 'ingreso' ? t.monto : -t.monto),
    cuenta.saldoInicial,
  )
}

/** Saldo de todas las cuentas en una sola pasada. */
export function saldosPorCuenta(
  cuentas: Cuenta[],
  transacciones: Transaccion[],
): Map<string, number> {
  const saldos = new Map(cuentas.map((c) => [c.id, c.saldoInicial]))
  for (const t of transacciones) {
    const actual = saldos.get(t.cuentaId)
    if (actual === undefined) continue
    saldos.set(t.cuentaId, actual + (t.tipo === 'ingreso' ? t.monto : -t.monto))
  }
  return saldos
}

/** Fecha con el día `dia` del mes de `base` (se ajusta a meses más cortos). */
function diaDelMes(base: Date, dia: number, desplazamientoMeses = 0): Date {
  const anio = base.getFullYear()
  const mes = base.getMonth() + desplazamientoMeses
  const ultimoDia = new Date(anio, mes + 1, 0).getDate()
  return new Date(anio, mes, Math.min(dia, ultimoDia))
}

export interface EstadoTarjeta {
  /** Lo que se debe hoy (≥ 0). */
  deuda: number
  /** Línea disponible (si hay límite). */
  disponible?: number
  /** 0–1 de la línea usada. */
  uso?: number
  /** Gastos desde el último corte. */
  consumoCiclo: number
  ultimoCorte?: Date
  proximoPago?: Date
  diasParaPago?: number
}

/**
 * Estado de una tarjeta de crédito a la fecha `hoy`: deuda (saldo
 * negativo), línea disponible, consumo del ciclo actual y cuándo vence el
 * próximo pago.
 */
export function estadoTarjeta(
  cuenta: Cuenta,
  transacciones: Transaccion[],
  hoy: Date = new Date(),
): EstadoTarjeta {
  const saldo = saldoCuenta(cuenta, transacciones)
  const deuda = Math.max(0, -saldo)
  const inicioHoy = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate())

  let ultimoCorte: Date | undefined
  if (cuenta.diaCorte) {
    const corteEsteMes = diaDelMes(inicioHoy, cuenta.diaCorte)
    ultimoCorte = corteEsteMes < inicioHoy ? corteEsteMes : diaDelMes(inicioHoy, cuenta.diaCorte, -1)
  }

  let proximoPago: Date | undefined
  if (cuenta.diaPago) {
    const pagoEsteMes = diaDelMes(inicioHoy, cuenta.diaPago)
    proximoPago = pagoEsteMes >= inicioHoy ? pagoEsteMes : diaDelMes(inicioHoy, cuenta.diaPago, 1)
  }

  const desde = ultimoCorte ? new Date(ultimoCorte.getTime() + 86_400_000) : undefined
  const consumoCiclo = transacciones
    .filter(
      (t) =>
        t.cuentaId === cuenta.id &&
        t.tipo === 'gasto' &&
        t.origen !== 'transferencia' &&
        (!desde || t.fecha >= desde),
    )
    .reduce((suma, t) => suma + t.monto, 0)

  return {
    deuda,
    disponible: cuenta.limiteCredito ? Math.max(0, cuenta.limiteCredito - deuda) : undefined,
    uso: cuenta.limiteCredito ? Math.min(1, deuda / cuenta.limiteCredito) : undefined,
    consumoCiclo,
    ultimoCorte,
    proximoPago,
    diasParaPago: proximoPago
      ? Math.round((proximoPago.getTime() - inicioHoy.getTime()) / 86_400_000)
      : undefined,
  }
}

/**
 * "Logos" de bancos y billeteras de Perú: una sigla sobre el color de la
 * marca (no se usan las imágenes oficiales). `Cuenta.icono` los guarda
 * como 'logo:<id>'.
 */
export const LOGOS_CUENTA: { id: string; nombre: string; sigla: string; fondo: string; texto: string; claves: string[] }[] = [
  { id: 'bcp', nombre: 'BCP', sigla: 'BCP', fondo: '#0033a0', texto: '#ff7a00', claves: ['bcp', 'credito del peru'] },
  { id: 'interbank', nombre: 'Interbank', sigla: 'IB', fondo: '#00a94f', texto: '#ffffff', claves: ['interbank'] },
  { id: 'bbva', nombre: 'BBVA', sigla: 'BBVA', fondo: '#004481', texto: '#ffffff', claves: ['bbva', 'continental'] },
  { id: 'scotiabank', nombre: 'Scotiabank', sigla: 'S', fondo: '#ec111a', texto: '#ffffff', claves: ['scotia'] },
  { id: 'nacion', nombre: 'Banco de la Nación', sigla: 'BN', fondo: '#b3001b', texto: '#ffffff', claves: ['nacion', 'bn '] },
  { id: 'banbif', nombre: 'BanBif', sigla: 'BIF', fondo: '#00355f', texto: '#ffffff', claves: ['banbif'] },
  { id: 'pichincha', nombre: 'Pichincha', sigla: 'P', fondo: '#ffd100', texto: '#1f2033', claves: ['pichincha'] },
  { id: 'mibanco', nombre: 'Mibanco', sigla: 'Mi', fondo: '#00843d', texto: '#ffd100', claves: ['mibanco'] },
  { id: 'caja-arequipa', nombre: 'Caja Arequipa', sigla: 'CA', fondo: '#e30613', texto: '#ffffff', claves: ['caja arequipa'] },
  { id: 'falabella', nombre: 'Falabella', sigla: 'F', fondo: '#007a33', texto: '#ffffff', claves: ['falabella', 'cmr'] },
  { id: 'ripley', nombre: 'Ripley', sigla: 'R', fondo: '#5c2d91', texto: '#ffffff', claves: ['ripley'] },
  { id: 'yape', nombre: 'Yape', sigla: 'Y', fondo: '#742284', texto: '#00e0c6', claves: ['yape'] },
  { id: 'plin', nombre: 'Plin', sigla: 'P', fondo: '#00bfb3', texto: '#ffffff', claves: ['plin'] },
  { id: 'tunki', nombre: 'Tunki', sigla: 'T', fondo: '#ff6a13', texto: '#ffffff', claves: ['tunki'] },
  { id: 'agora', nombre: 'Agora', sigla: 'A', fondo: '#3d1f8f', texto: '#ffffff', claves: ['agora'] },
  { id: 'paypal', nombre: 'PayPal', sigla: 'PP', fondo: '#003087', texto: '#ffffff', claves: ['paypal'] },
]

/** Iconos genéricos que se ofrecen para una cuenta. */
export const ICONOS_CUENTA_OPCIONES = [
  'money bill alternate outline', 'wallet', 'university', 'mobile alternate', 'credit card',
  'piggy bank', 'briefcase', 'home', 'building', 'globe', 'coins', 'dollar sign', 'gem', 'lock', 'gift',
]

const sinTildes = (t: string) => t.toLocaleLowerCase('es').normalize('NFD').replace(/\p{Diacritic}/gu, '')

/** Logo que corresponde al nombre de la cuenta (p. ej. "Yape" → yape), si hay. */
export function logoSugerido(nombre: string): string | undefined {
  const texto = ` ${sinTildes(nombre)} `
  return LOGOS_CUENTA.find((l) => l.claves.some((c) => texto.includes(c)))?.id
}

export type AparienciaCuenta =
  | { tipo: 'logo'; sigla: string; fondo: string; texto: string; nombre: string }
  | { tipo: 'icono'; icono: string; fondo?: string }

/**
 * Cómo se dibuja una cuenta: su logo o icono elegido; si no eligió, el
 * logo que sugiere su nombre; y si no, el icono de su tipo.
 */
export function aparienciaCuenta(cuenta: Pick<Cuenta, 'icono' | 'color' | 'nombre' | 'tipo'>): AparienciaCuenta {
  const idLogo = cuenta.icono?.startsWith('logo:') ? cuenta.icono.slice(5) : cuenta.icono ? undefined : logoSugerido(cuenta.nombre)
  const logo = idLogo ? LOGOS_CUENTA.find((l) => l.id === idLogo) : undefined
  if (logo) return { tipo: 'logo', sigla: logo.sigla, fondo: logo.fondo, texto: logo.texto, nombre: logo.nombre }
  return { tipo: 'icono', icono: cuenta.icono && !cuenta.icono.startsWith('logo:') ? cuenta.icono : ICONO_CUENTA[cuenta.tipo], fondo: cuenta.color }
}
