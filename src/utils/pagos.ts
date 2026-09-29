import type { CompraCuotas, Cuenta, Deuda, Meta, Recurrente, Transaccion } from '../types'
import { esMovimientoReal } from './analisis'
import { fechaCuota, pagoTarjetaEstimado } from './cuotas'
import { estadoDeuda, estadoMeta } from './planificacion'
import { normalizarTexto } from './reglas'
import { ocurrenciasRecurrentes } from './salud'

const DIA = 86_400_000
const inicioDelDia = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate())
const redondear = (n: number) => Math.round(n * 100) / 100

// ---------------------------------------------------------------------------
// Suscripciones detectadas
// ---------------------------------------------------------------------------

export interface Suscripcion {
  /** Concepto normalizado (sirve para descartarla). */
  clave: string
  concepto: string
  categoriaId: string
  cuentaId: string
  montoPromedio: number
  ultima: Date
  proxima: Date
  veces: number
}

/** Servicios conocidos: bastan 2 cobros mensuales para sugerirlos. */
const RE_SERVICIO =
  /netflix|spotify|disney|hbo|\bmax\b|prime video|amazon prime|youtube|apple|icloud|google one|chatgpt|openai|crunchyroll|paramount|star ?\+|deezer|tidal|gimnasio|\bgym\b|smart ?fit|office|microsoft|adobe|canva|dropbox|notion|duolingo|xbox|playstation|nintendo/

const mesSiguiente = (d: Date, n = 1) => {
  const ultimo = new Date(d.getFullYear(), d.getMonth() + n + 1, 0).getDate()
  return new Date(d.getFullYear(), d.getMonth() + n, Math.min(d.getDate(), ultimo))
}

/**
 * Gastos que se repiten cada mes por un monto parecido y que aún no son
 * un movimiento recurrente: probables suscripciones.
 */
export function detectarSuscripciones(
  transacciones: Transaccion[],
  recurrentes: Recurrente[],
  ignoradas: string[] = [],
  hoy: Date = new Date(),
): Suscripcion[] {
  const grupos = new Map<string, Transaccion[]>()
  for (const t of transacciones) {
    if (t.tipo !== 'gasto' || !esMovimientoReal(t) || t.origen === 'recurrente' || !t.concepto) continue
    const clave = normalizarTexto(t.concepto)
    if (clave.length < 3) continue
    grupos.set(clave, [...(grupos.get(clave) ?? []), t])
  }

  const cubiertas = recurrentes.map((r) => normalizarTexto(r.concepto)).filter(Boolean)
  const ignorar = new Set(ignoradas)
  const limite = new Date(inicioDelDia(hoy).getTime() - 45 * DIA)
  const resultado: Suscripcion[] = []

  for (const [clave, lista] of grupos) {
    if (ignorar.has(clave) || cubiertas.some((c) => c.includes(clave) || clave.includes(c))) continue
    const conocida = RE_SERVICIO.test(clave)
    if (lista.length < (conocida ? 2 : 3)) continue
    const orden = [...lista].sort((a, b) => a.fecha.getTime() - b.fecha.getTime())
    const ultima = orden[orden.length - 1]
    if (ultima.fecha < limite) continue

    // Un cobro por mes: meses distintos y separaciones de ~1 mes.
    const meses = new Set(orden.map((t) => `${t.fecha.getFullYear()}-${t.fecha.getMonth()}`))
    if (meses.size !== orden.length) continue
    const separaciones = orden.slice(1).map((t, i) => (t.fecha.getTime() - orden[i].fecha.getTime()) / DIA)
    const mediana = [...separaciones].sort((a, b) => a - b)[Math.floor(separaciones.length / 2)]
    if (mediana < 25 || mediana > 35) continue

    const montos = orden.map((t) => t.monto)
    if (Math.max(...montos) > Math.min(...montos) * 1.2) continue

    // Cuenta y categoría más usadas.
    const moda = (valores: string[]) =>
      [...valores.reduce((m, v) => m.set(v, (m.get(v) ?? 0) + 1), new Map<string, number>())].sort((a, b) => b[1] - a[1])[0][0]

    let proxima = mesSiguiente(ultima.fecha)
    while (proxima < inicioDelDia(hoy)) proxima = mesSiguiente(proxima)

    resultado.push({
      clave,
      concepto: ultima.concepto!.trim(),
      categoriaId: moda(orden.map((t) => t.categoriaId)),
      cuentaId: moda(orden.map((t) => t.cuentaId)),
      montoPromedio: redondear(montos.reduce((s, m) => s + m, 0) / montos.length),
      ultima: ultima.fecha,
      proxima,
      veces: orden.length,
    })
  }
  return resultado.sort((a, b) => b.montoPromedio - a.montoPromedio)
}

// ---------------------------------------------------------------------------
// Calendario de pagos
// ---------------------------------------------------------------------------

export type TipoEventoPago = 'fijo-gasto' | 'fijo-ingreso' | 'tarjeta' | 'cuota' | 'debo' | 'me-deben' | 'meta'

export interface EventoPago {
  fecha: Date
  titulo: string
  /** Positivo = entra, negativo = sale; sin monto = solo recordatorio. */
  monto?: number
  tipo: TipoEventoPago
  /** Ya ocurrió (fecha pasada). */
  pasado: boolean
}

interface DatosCalendario {
  anio: number
  /** 0–11 */
  mes: number
  recurrentes: Recurrente[]
  transacciones: Transaccion[]
  cuentas: Cuenta[]
  cuotas: CompraCuotas[]
  deudas: Deuda[]
  metas: Meta[]
  hoy?: Date
}

/** Todo lo que vence o se cobra en un mes, ordenado por fecha. */
export function eventosDelMes({ anio, mes, recurrentes, transacciones, cuentas, cuotas, deudas, metas, hoy = new Date() }: DatosCalendario): EventoPago[] {
  const inicio = new Date(anio, mes, 1)
  const fin = new Date(anio, mes + 1, 1)
  const hoy0 = inicioDelDia(hoy)
  const eventos: EventoPago[] = []
  const enMes = (d: Date) => d >= inicio && d < fin

  // Recurrentes: lo que falta (desde hoy) según la regla; lo que ya pasó, según lo registrado.
  const desde = hoy0 > inicio ? hoy0 : inicio
  if (desde < fin) {
    for (const e of ocurrenciasRecurrentes(recurrentes, desde, new Date(fin.getTime() - 1))) {
      if (e.fecha < hoy0) continue
      eventos.push({ fecha: e.fecha, titulo: e.concepto, monto: redondear(e.monto), tipo: e.monto >= 0 ? 'fijo-ingreso' : 'fijo-gasto', pasado: false })
    }
  }
  const idsRecurrentes = new Set(recurrentes.map((r) => r.id))
  for (const t of transacciones) {
    if (t.origen !== 'recurrente' || !t.recurrenteId || !idsRecurrentes.has(t.recurrenteId) || !enMes(t.fecha) || t.fecha >= hoy0) continue
    eventos.push({
      fecha: t.fecha,
      titulo: t.concepto ?? 'Pago fijo',
      monto: t.tipo === 'ingreso' ? t.monto : -t.monto,
      tipo: t.tipo === 'ingreso' ? 'fijo-ingreso' : 'fijo-gasto',
      pasado: true,
    })
  }

  // Cuotas.
  for (const c of cuotas) {
    for (let k = 0; k < c.numeroCuotas; k++) {
      const f = fechaCuota(c, k)
      if (enMes(f)) {
        eventos.push({ fecha: f, titulo: `${c.descripcion} — cuota ${k + 1}/${c.numeroCuotas}`, monto: -c.montoCuota, tipo: 'cuota', pasado: f < hoy0 })
      }
    }
  }

  // Tarjetas: fecha de pago del mes (con monto solo si es el próximo pago).
  for (const tarjeta of cuentas.filter((c) => c.tipo === 'tarjeta_credito' && c.diaPago)) {
    const ultimo = new Date(anio, mes + 1, 0).getDate()
    const fecha = new Date(anio, mes, Math.min(tarjeta.diaPago!, ultimo))
    const proximo = pagoTarjetaEstimado(tarjeta, transacciones, cuotas, hoy)
    const esProximo = proximo.fecha?.getTime() === fecha.getTime()
    eventos.push({
      fecha,
      titulo: `Pago de ${tarjeta.nombre}`,
      monto: esProximo && proximo.monto > 0 ? -proximo.monto : undefined,
      tipo: 'tarjeta',
      pasado: fecha < hoy0,
    })
  }

  // Deudas con fecha límite.
  for (const d of deudas) {
    if (!d.fechaLimite || !enMes(d.fechaLimite)) continue
    const e = estadoDeuda(d, hoy)
    if (e.saldada) continue
    eventos.push({
      fecha: d.fechaLimite,
      titulo: d.tipo === 'debo' ? `Pagarle a ${d.persona}` : `${d.persona} te paga`,
      monto: d.tipo === 'debo' ? -e.pendiente : e.pendiente,
      tipo: d.tipo === 'debo' ? 'debo' : 'me-deben',
      pasado: d.fechaLimite < hoy0,
    })
  }

  // Metas con fecha límite (recordatorio).
  for (const m of metas) {
    if (!m.fechaLimite || !enMes(m.fechaLimite) || estadoMeta(m, hoy).completada) continue
    eventos.push({ fecha: m.fechaLimite, titulo: `Fecha límite de "${m.nombre}"`, tipo: 'meta', pasado: m.fechaLimite < hoy0 })
  }

  return eventos.sort((a, b) => a.fecha.getTime() - b.fecha.getTime())
}
