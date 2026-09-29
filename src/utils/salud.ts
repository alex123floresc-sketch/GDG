import { NOMBRE_POR_COBRAR } from '../services/cuentaService'
import { siguienteFecha } from '../services/recurrenteService'
import type {
  Ajustes,
  Categoria,
  Chanchito,
  ClaseGasto,
  Cuenta,
  Deuda,
  Meta,
  Presupuesto,
  Recurrente,
  Transaccion,
} from '../types'
import { esMovimientoReal } from './analisis'
import { saldoChanchito } from './chanchitos'
import { estadoTarjeta, saldosPorCuenta } from './cuentas'
import { estadoDeuda, estadoMeta, estadoPresupuestos } from './planificacion'
import { leerTipoCambio } from './preferencias'
import { normalizarTexto } from './reglas'

/*
 * Salud financiera: regla 50/30/20, fondo de emergencia, proyección de
 * saldo, "¿cuánto puedo gastar hoy?" y un puntaje de 0 a 100. Todo se
 * calcula en el dispositivo; las transferencias no cuentan como
 * ingreso/gasto (`esMovimientoReal`).
 */

const DIA = 86_400_000
const inicioDelDia = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate())
const redondear = (n: number) => Math.round(n * 100) / 100

// ---------------------------------------------------------------------------
// Cuentas líquidas y promedios
// ---------------------------------------------------------------------------

/** Dinero disponible de inmediato: efectivo, bancos, billeteras y "otras" (sin "Por cobrar"). */
export function esLiquida(c: Cuenta): boolean {
  return (
    (c.tipo === 'efectivo' || c.tipo === 'banco' || c.tipo === 'billetera_digital' || c.tipo === 'otro') &&
    c.nombre !== NOMBRE_POR_COBRAR
  )
}

export function saldoLiquido(cuentas: Cuenta[], transacciones: Transaccion[]): number {
  const saldos = saldosPorCuenta(cuentas, transacciones)
  return redondear(cuentas.filter(esLiquida).reduce((s, c) => s + (saldos.get(c.id) ?? 0), 0))
}

/** Los `n` meses completos anteriores al de `hoy`: [inicio, fin). */
export function mesesCompletos(n: number, hoy: Date): [Date, Date][] {
  return Array.from({ length: n }, (_, i) => [
    new Date(hoy.getFullYear(), hoy.getMonth() - n + i, 1),
    new Date(hoy.getFullYear(), hoy.getMonth() - n + i + 1, 1),
  ])
}

// ---------------------------------------------------------------------------
// Regla 50/30/20
// ---------------------------------------------------------------------------

const RE_NECESIDAD =
  /aliment|super|mercado|bodega|comida|transporte|pasaje|movilidad|gasolina|combustible|vivienda|alquiler|hipoteca|luz|agua|gas\b|internet|telefon|celular|servicio|salud|medic|farmac|clinic|educa|colegio|universidad|pension|seguro|guarder|deuda|prestamo|credito/

/**
 * Clase de una categoría de gasto: la elegida por el usuario, la de su
 * madre o, si no hay, una estimación por el nombre (`estimada`).
 */
export function claseDeCategoria(
  categoria: Categoria | undefined,
  porId: Map<string, Categoria>,
): { clase: ClaseGasto; estimada: boolean } {
  if (!categoria) return { clase: 'deseo', estimada: true }
  if (categoria.clase) return { clase: categoria.clase, estimada: false }
  const padre = categoria.padreId ? porId.get(categoria.padreId) : undefined
  if (padre?.clase) return { clase: padre.clase, estimada: false }
  const nombre = normalizarTexto(`${categoria.nombre} ${padre?.nombre ?? ''}`)
  return { clase: RE_NECESIDAD.test(nombre) ? 'necesidad' : 'deseo', estimada: true }
}

export interface Reparto {
  ingresos: number
  gastos: number
  necesidades: number
  deseos: number
  /** Ingresos − gastos (negativo = déficit). */
  ahorro: number
  /** Hay categorías con clase estimada (no elegida). */
  hayEstimadas: boolean
}

/** Cómo se repartieron los ingresos entre necesidades, deseos y ahorro en [desde, hasta). */
export function calcularReparto(
  transacciones: Transaccion[],
  categorias: Categoria[],
  desde: Date,
  hasta: Date,
): Reparto {
  const porId = new Map(categorias.map((c) => [c.id, c]))
  const r: Reparto = { ingresos: 0, gastos: 0, necesidades: 0, deseos: 0, ahorro: 0, hayEstimadas: false }
  for (const t of transacciones) {
    if (!esMovimientoReal(t) || t.fecha < desde || t.fecha >= hasta) continue
    if (t.tipo === 'ingreso') {
      r.ingresos += t.monto
      continue
    }
    r.gastos += t.monto
    const { clase, estimada } = claseDeCategoria(porId.get(t.categoriaId), porId)
    if (estimada) r.hayEstimadas = true
    if (clase === 'necesidad') r.necesidades += t.monto
    else r.deseos += t.monto
  }
  r.ahorro = r.ingresos - r.gastos
  return r
}

// ---------------------------------------------------------------------------
// Fondo de emergencia
// ---------------------------------------------------------------------------

export interface EstadoFondo {
  disponible: number
  /** Gasto mensual de referencia (necesidades, o todos los gastos si no hay clases). */
  gastoMensual: number
  baseGasto: 'necesidades' | 'gastos'
  mesesCubiertos: number | null
  mesesObjetivo: number
  objetivo: number
  porcentaje: number
  /** Qué se está contando como fondo. */
  origen: string
}

interface DatosFondo {
  ajustes: Ajustes
  cuentas: Cuenta[]
  transacciones: Transaccion[]
  categorias: Categoria[]
  metas: Meta[]
  chanchitos: Chanchito[]
  hoy?: Date
}

export function estadoFondo({ ajustes, cuentas, transacciones, categorias, metas, chanchitos, hoy = new Date() }: DatosFondo): EstadoFondo {
  const mesesObjetivo = ajustes.fondoMeses ?? 6
  let disponible = 0
  let origen = 'Tu dinero disponible (efectivo, bancos y billeteras)'

  const elegido = ajustes.fondoId
  if (ajustes.fondoOrigen === 'cuenta' && elegido) {
    const cuenta = cuentas.find((c) => c.id === elegido)
    disponible = cuenta ? (saldosPorCuenta([cuenta], transacciones).get(cuenta.id) ?? 0) : 0
    origen = cuenta ? `La cuenta "${cuenta.nombre}"` : 'Una cuenta que ya no existe'
  } else if (ajustes.fondoOrigen === 'meta' && elegido) {
    const meta = metas.find((m) => m.id === elegido)
    disponible = meta ? estadoMeta(meta, hoy).ahorrado : 0
    origen = meta ? `La meta "${meta.nombre}"` : 'Una meta que ya no existe'
  } else if (ajustes.fondoOrigen === 'chanchito' && elegido) {
    const chanchito = chanchitos.find((c) => c.id === elegido)
    disponible = chanchito ? saldoChanchito(chanchito, cuentas, transacciones) : 0
    origen = chanchito ? `El chanchito "${chanchito.nombre}"` : 'Un chanchito que ya no existe'
  } else {
    disponible = saldoLiquido(cuentas, transacciones)
  }

  // Promedio de los 3 meses completos anteriores.
  const meses = mesesCompletos(3, hoy)
  const repartos = meses.map(([a, b]) => calcularReparto(transacciones, categorias, a, b))
  const conDatos = repartos.filter((r) => r.gastos > 0)
  const promedio = (f: (r: Reparto) => number) =>
    conDatos.length ? conDatos.reduce((s, r) => s + f(r), 0) / conDatos.length : 0
  const necesidades = promedio((r) => r.necesidades)
  const baseGasto = necesidades > 0 ? 'necesidades' : 'gastos'
  const gastoMensual = redondear(necesidades > 0 ? necesidades : promedio((r) => r.gastos))

  const objetivo = redondear(gastoMensual * mesesObjetivo)
  return {
    disponible: redondear(disponible),
    gastoMensual,
    baseGasto,
    mesesCubiertos: gastoMensual > 0 ? Math.max(0, disponible) / gastoMensual : null,
    mesesObjetivo,
    objetivo,
    porcentaje: objetivo > 0 ? Math.min(1, Math.max(0, disponible) / objetivo) : 0,
    origen,
  }
}

// ---------------------------------------------------------------------------
// Ocurrencias futuras de recurrentes
// ---------------------------------------------------------------------------

export interface EventoFuturo {
  fecha: Date
  concepto: string
  /** + entra, − sale (en soles). */
  monto: number
  tipo: 'recurrente' | 'tarjeta' | 'deuda'
}

const enSoles = (r: Recurrente) => (r.moneda === 'USD' ? r.monto * leerTipoCambio() : r.monto)

/** Ocurrencias de los recurrentes activos en [desde, hasta]. */
export function ocurrenciasRecurrentes(recurrentes: Recurrente[], desde: Date, hasta: Date): EventoFuturo[] {
  const eventos: EventoFuturo[] = []
  for (const r of recurrentes) {
    if (!r.activa) continue
    const dia = r.diaMes ?? r.proximaFecha.getDate()
    let fecha = r.proximaFecha
    for (let i = 0; fecha <= hasta && i < 400; i++) {
      if (fecha >= desde) {
        eventos.push({ fecha, concepto: r.concepto, monto: (r.tipo === 'ingreso' ? 1 : -1) * enSoles(r), tipo: 'recurrente' })
      }
      fecha = siguienteFecha(fecha, r.frecuencia, dia)
    }
  }
  return eventos
}

// ---------------------------------------------------------------------------
// ¿Cuánto puedo gastar hoy?
// ---------------------------------------------------------------------------

export interface GastoDiario {
  /** Lo que puedes gastar por día hasta fin de mes (contando hoy). */
  porDia: number
  /** Lo que te queda para hoy (porDia − lo ya gastado hoy). */
  hoyQuedan: number
  gastadoHoy: number
  /** Margen del mes (negativo = ya te pasaste). */
  disponibleMes: number
  diasRestantes: number
  /** Desglose del cálculo. */
  partes: { etiqueta: string; monto: number }[]
  /** Los ingresos del mes son un promedio (aún no registraste ninguno). */
  ingresosEstimados: boolean
}

interface DatosGastoDiario {
  transacciones: Transaccion[]
  recurrentes: Recurrente[]
  deudas: Deuda[]
  metas: Meta[]
  hoy?: Date
}

export function cuantoPuedoGastar({ transacciones, recurrentes, deudas, metas, hoy = new Date() }: DatosGastoDiario): GastoDiario {
  const inicioMes = new Date(hoy.getFullYear(), hoy.getMonth(), 1)
  const finMes = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 1)
  const manana = new Date(inicioDelDia(hoy).getTime() + DIA)
  const hoy0 = inicioDelDia(hoy)
  const reales = transacciones.filter(esMovimientoReal)

  const delMes = reales.filter((t) => t.fecha >= inicioMes && t.fecha < finMes)
  let ingresos = delMes.filter((t) => t.tipo === 'ingreso').reduce((s, t) => s + t.monto, 0)
  const gastos = delMes.filter((t) => t.tipo === 'gasto').reduce((s, t) => s + t.monto, 0)
  const gastadoHoy = delMes
    .filter((t) => t.tipo === 'gasto' && t.fecha >= hoy0 && t.fecha < manana)
    .reduce((s, t) => s + t.monto, 0)

  const futuros = ocurrenciasRecurrentes(recurrentes, manana, new Date(finMes.getTime() - 1))
  const ingresosPorLlegar = futuros.filter((e) => e.monto > 0).reduce((s, e) => s + e.monto, 0)
  const fijosPorPagar = -futuros.filter((e) => e.monto < 0).reduce((s, e) => s + e.monto, 0)

  let ingresosEstimados = false
  if (ingresos + ingresosPorLlegar === 0) {
    const meses = mesesCompletos(3, hoy)
    const porMes = meses.map(([a, b]) =>
      reales.filter((t) => t.tipo === 'ingreso' && t.fecha >= a && t.fecha < b).reduce((s, t) => s + t.monto, 0),
    )
    const conIngresos = porMes.filter((v) => v > 0)
    if (conIngresos.length) {
      ingresos = conIngresos.reduce((s, v) => s + v, 0) / conIngresos.length
      ingresosEstimados = true
    }
  }

  const deudasPorPagar = deudas
    .filter((d) => d.tipo === 'debo' && d.fechaLimite && d.fechaLimite < finMes)
    .reduce((s, d) => s + estadoDeuda(d, hoy).pendiente, 0)

  // Lo que conviene apartar este mes para las metas con fecha (menos lo ya aportado).
  const ahorroMetas = metas.reduce((s, m) => {
    const e = estadoMeta(m, hoy)
    if (!e.ahorroMensualNecesario || e.vencida) return s
    const aportado = m.aportes.filter((a) => a.fecha >= inicioMes && a.fecha < finMes).reduce((x, a) => x + a.monto, 0)
    return s + Math.max(0, e.ahorroMensualNecesario - aportado)
  }, 0)

  const disponibleMes = ingresos + ingresosPorLlegar - gastos - fijosPorPagar - deudasPorPagar - ahorroMetas
  const diasRestantes = Math.round((finMes.getTime() - hoy0.getTime()) / DIA)
  const porDia = Math.max(0, disponibleMes + gastadoHoy) / Math.max(1, diasRestantes)

  const partes = [
    { etiqueta: ingresosEstimados ? 'Ingresos (promedio de meses anteriores)' : 'Ingresos del mes', monto: ingresos },
    { etiqueta: 'Ingresos fijos por llegar', monto: ingresosPorLlegar },
    { etiqueta: 'Gastos del mes', monto: -gastos },
    { etiqueta: 'Pagos fijos por venir', monto: -fijosPorPagar },
    { etiqueta: 'Deudas que vencen este mes', monto: -deudasPorPagar },
    { etiqueta: 'Ahorro para tus metas', monto: -ahorroMetas },
  ]
    .filter((p) => Math.abs(p.monto) >= 0.005)
    .map((p) => ({ ...p, monto: redondear(p.monto) }))

  return {
    porDia: redondear(porDia),
    hoyQuedan: redondear(porDia - gastadoHoy),
    gastadoHoy: redondear(gastadoHoy),
    disponibleMes: redondear(disponibleMes),
    diasRestantes,
    partes,
    ingresosEstimados,
  }
}

// ---------------------------------------------------------------------------
// Proyección de saldo
// ---------------------------------------------------------------------------

export interface PuntoProyeccion {
  fecha: Date
  saldo: number
}

export interface Proyeccion {
  puntos: PuntoProyeccion[]
  eventos: EventoFuturo[]
  minimo: PuntoProyeccion
  final: number
  /** Promedio diario variable (ingresos − gastos no fijos) usado. */
  variableDiario: number
}

interface DatosProyeccion {
  cuentas: Cuenta[]
  transacciones: Transaccion[]
  recurrentes: Recurrente[]
  deudas: Deuda[]
  dias: number
  /** Incluir el promedio de ingresos/gastos variables (no recurrentes). */
  conVariables: boolean
  hoy?: Date
}

/**
 * Saldo disponible (cuentas líquidas) día a día durante los próximos
 * `dias`: recurrentes de cuentas líquidas, pago de tarjetas en su fecha,
 * deudas que debes pagar y, opcionalmente, el promedio de lo variable de
 * los últimos 90 días.
 */
export function proyectarSaldo({ cuentas, transacciones, recurrentes, deudas, dias, conVariables, hoy = new Date() }: DatosProyeccion): Proyeccion {
  const hoy0 = inicioDelDia(hoy)
  const manana = new Date(hoy0.getTime() + DIA)
  const fin = new Date(hoy0.getTime() + dias * DIA)
  const liquidas = new Set(cuentas.filter(esLiquida).map((c) => c.id))

  const eventos: EventoFuturo[] = ocurrenciasRecurrentes(
    recurrentes.filter((r) => liquidas.has(r.cuentaId)),
    manana,
    fin,
  )

  for (const tarjeta of cuentas.filter((c) => c.tipo === 'tarjeta_credito')) {
    const e = estadoTarjeta(tarjeta, transacciones, hoy)
    if (e.deuda > 0 && e.proximoPago && e.proximoPago >= hoy0 && e.proximoPago <= fin) {
      eventos.push({ fecha: e.proximoPago, concepto: `Pago de ${tarjeta.nombre}`, monto: -e.deuda, tipo: 'tarjeta' })
    }
  }

  for (const d of deudas) {
    if (d.tipo !== 'debo' || !d.fechaLimite) continue
    const pendiente = estadoDeuda(d, hoy).pendiente
    if (pendiente <= 0) continue
    const fecha = d.fechaLimite < hoy0 ? hoy0 : d.fechaLimite
    if (fecha <= fin) eventos.push({ fecha, concepto: `Pagar a ${d.persona}`, monto: -pendiente, tipo: 'deuda' })
  }

  eventos.sort((a, b) => a.fecha.getTime() - b.fecha.getTime())

  // Promedio diario de lo variable (sin recurrentes ni transferencias).
  const hace90 = new Date(hoy0.getTime() - 90 * DIA)
  const variables = transacciones.filter(
    (t) => esMovimientoReal(t) && t.origen !== 'recurrente' && t.fecha >= hace90 && t.fecha < hoy0,
  )
  const primera = variables.reduce((min, t) => (t.fecha < min ? t.fecha : min), hoy0)
  const diasHistoria = Math.max(30, Math.round((hoy0.getTime() - inicioDelDia(primera).getTime()) / DIA))
  const variableDiario = conVariables
    ? variables.reduce((s, t) => s + (t.tipo === 'ingreso' ? t.monto : -t.monto), 0) / diasHistoria
    : 0

  let saldo = saldoLiquido(cuentas, transacciones)
  const puntos: PuntoProyeccion[] = [{ fecha: hoy0, saldo: redondear(saldo) }]
  let i = 0
  for (let d = 1; d <= dias; d++) {
    const fecha = new Date(hoy0.getTime() + d * DIA)
    saldo += variableDiario
    while (i < eventos.length && eventos[i].fecha <= fecha) saldo += eventos[i++].monto
    puntos.push({ fecha, saldo: redondear(saldo) })
  }

  const minimo = puntos.reduce((m, p) => (p.saldo < m.saldo ? p : m), puntos[0])
  return { puntos, eventos, minimo, final: puntos[puntos.length - 1].saldo, variableDiario: redondear(variableDiario) }
}

// ---------------------------------------------------------------------------
// Puntaje de salud financiera
// ---------------------------------------------------------------------------

export type NivelSalud = 'excelente' | 'buena' | 'regular' | 'riesgo'

export interface ComponenteSalud {
  id: 'ahorro' | 'fondo' | 'deudas' | 'presupuestos' | 'constancia'
  nombre: string
  icono: string
  puntos: number
  maximo: number
  detalle: string
  consejo?: string
}

export interface PuntajeSalud {
  total: number
  nivel: NivelSalud
  componentes: ComponenteSalud[]
}

interface DatosPuntaje extends DatosFondo {
  presupuestos: Presupuesto[]
  deudas: Deuda[]
}

const porcentaje = (f: number) => `${Math.round(f * 100)} %`
const acotar = (v: number) => Math.max(0, Math.min(1, v))

/** Etiqueta, icono y clase CSS de cada nivel (el color nunca va solo). */
export const NIVELES_SALUD: Record<NivelSalud, { etiqueta: string; icono: string; clase: string }> = {
  excelente: { etiqueta: 'Excelente', icono: 'check circle', clase: 'nivel-bueno' },
  buena: { etiqueta: 'Buena', icono: 'thumbs up outline', clase: 'nivel-bueno' },
  regular: { etiqueta: 'Regular', icono: 'exclamation triangle', clase: 'nivel-alerta' },
  riesgo: { etiqueta: 'En riesgo', icono: 'exclamation circle', clase: 'nivel-malo' },
}

export function nivelSalud(total: number): NivelSalud {
  return total >= 80 ? 'excelente' : total >= 60 ? 'buena' : total >= 40 ? 'regular' : 'riesgo'
}

/**
 * Puntaje 0–100 con cinco componentes: ahorro (25), fondo de emergencia
 * (25), deudas (20), presupuestos (15) y constancia (15). `null` si aún no
 * hay movimientos en los últimos 3 meses completos.
 */
export function puntajeSalud(datos: DatosPuntaje): PuntajeSalud | null {
  const hoy = datos.hoy ?? new Date()
  const meses = mesesCompletos(3, hoy)
  const repartos = meses.map(([a, b]) => calcularReparto(datos.transacciones, datos.categorias, a, b))
  const conDatos = repartos.filter((r) => r.ingresos > 0 || r.gastos > 0)
  if (conDatos.length === 0) return null

  const ingresos = repartos.reduce((s, r) => s + r.ingresos, 0)
  const gastos = repartos.reduce((s, r) => s + r.gastos, 0)
  const ingresoMensual = ingresos / conDatos.length
  const componentes: ComponenteSalud[] = []

  // 1. Tasa de ahorro (meta: 20 %).
  const tasa = ingresos > 0 ? (ingresos - gastos) / ingresos : 0
  componentes.push({
    id: 'ahorro',
    nombre: 'Ahorro',
    icono: 'piggy bank',
    puntos: 25 * acotar(tasa / 0.2),
    maximo: 25,
    detalle: ingresos > 0 ? `Ahorras el ${porcentaje(Math.max(0, tasa))} de lo que ganas (últimos 3 meses)` : 'Sin ingresos registrados',
    consejo: tasa < 0.2 ? 'Apunta a guardar al menos el 20 % de tus ingresos; empieza por lo que puedas.' : undefined,
  })

  // 2. Fondo de emergencia.
  const fondo = estadoFondo({ ...datos, hoy })
  componentes.push({
    id: 'fondo',
    nombre: 'Fondo de emergencia',
    icono: 'life ring',
    puntos: 25 * (fondo.mesesCubiertos === null ? 0 : acotar(fondo.mesesCubiertos / fondo.mesesObjetivo)),
    maximo: 25,
    detalle:
      fondo.mesesCubiertos === null
        ? 'Aún no hay gastos para calcularlo'
        : `Cubre ${fondo.mesesCubiertos.toFixed(1)} de ${fondo.mesesObjetivo} meses de gastos`,
    consejo:
      fondo.mesesCubiertos !== null && fondo.mesesCubiertos < fondo.mesesObjetivo
        ? 'Aparta un poco cada mes (un chanchito o una meta) hasta cubrir varios meses de gastos.'
        : undefined,
  })

  // 3. Deudas vs. ingreso mensual.
  const deudaTarjetas = datos.cuentas
    .filter((c) => c.tipo === 'tarjeta_credito')
    .reduce((s, c) => s + estadoTarjeta(c, datos.transacciones, hoy).deuda, 0)
  const deudaPersonas = datos.deudas.filter((d) => d.tipo === 'debo').reduce((s, d) => s + estadoDeuda(d, hoy).pendiente, 0)
  const deuda = deudaTarjetas + deudaPersonas
  const ratio = deuda === 0 ? 0 : ingresoMensual > 0 ? deuda / ingresoMensual : Infinity
  componentes.push({
    id: 'deudas',
    nombre: 'Deudas',
    icono: 'credit card',
    puntos: 20 * acotar(1 - ratio / 2),
    maximo: 20,
    detalle:
      deuda === 0
        ? 'No tienes deudas pendientes'
        : ingresoMensual > 0
          ? `Debes el equivalente a ${ratio.toFixed(1)} meses de ingresos`
          : 'Tienes deudas y aún no registras ingresos',
    consejo: ratio > 0.5 ? 'Paga primero la deuda más cara (normalmente la tarjeta) y evita nuevas cuotas.' : undefined,
  })

  // 4. Presupuestos del mes pasado.
  const mesPasado = new Date(hoy.getFullYear(), hoy.getMonth() - 1, 1)
  const estados = estadoPresupuestos(datos.presupuestos, datos.categorias, datos.transacciones, mesPasado.getFullYear(), mesPasado.getMonth(), hoy)
  const cumplidos = estados.filter((e) => e.nivel !== 'excedido').length
  componentes.push({
    id: 'presupuestos',
    nombre: 'Presupuestos',
    icono: 'chart pie',
    puntos: estados.length ? 15 * (cumplidos / estados.length) : 5,
    maximo: 15,
    detalle: estados.length
      ? `Cumpliste ${cumplidos} de ${estados.length} el mes pasado`
      : 'Aún no tienes presupuestos',
    consejo: estados.length === 0 ? 'Ponle un límite a 2 o 3 categorías donde más gastas.' : cumplidos < estados.length ? 'Revisa los presupuestos que se pasaron y ajústalos a algo realista.' : undefined,
  })

  // 5. Constancia: meses sin gastar más de lo que entró.
  const mesesEnVerde = conDatos.filter((r) => r.ingresos >= r.gastos).length
  componentes.push({
    id: 'constancia',
    nombre: 'Constancia',
    icono: 'calendar check outline',
    puntos: 15 * (mesesEnVerde / 3),
    maximo: 15,
    detalle: `${mesesEnVerde} de los últimos 3 meses gastaste menos de lo que ganaste`,
    consejo: mesesEnVerde < 3 ? 'Revisa tus gastos hormiga: pequeños gastos diarios suman mucho a fin de mes.' : undefined,
  })

  for (const c of componentes) c.puntos = Math.round(c.puntos * 10) / 10
  const total = Math.round(componentes.reduce((s, c) => s + c.puntos, 0))
  return { total, nivel: nivelSalud(total), componentes }
}
