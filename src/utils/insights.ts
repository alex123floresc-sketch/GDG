import type { Categoria, Cuenta, Deuda, Meta, Presupuesto, Recurrente, Transaccion } from '../types'
import { esMovimientoReal } from './analisis'
import { estadoTarjeta } from './cuentas'
import { formatearDolares, formatearFecha, formatearMoneda, formatearPorcentaje } from './formato'
import { leerTipoCambio } from './preferencias'
import { estadoDeuda, estadoMeta, estadoPresupuestos } from './planificacion'

export type TonoInsight = 'positivo' | 'alerta' | 'negativo' | 'info'

export interface Insight {
  id: string
  icono: string
  tono: TonoInsight
  texto: string
  /** Mayor = más importante (se muestran primero). */
  prioridad: number
  /** Sección a la que lleva al tocarlo. */
  destino?:
    | 'planificar:presupuestos'
    | 'planificar:deudas'
    | 'planificar:metas'
    | 'planificar:recurrentes'
    | 'mas:cuentas'
    | 'analisis'
    | 'analisis:reporte'
    | 'analisis:comparar'
}

interface DatosInsights {
  transacciones: Transaccion[]
  categorias: Categoria[]
  cuentas: Cuenta[]
  presupuestos: Presupuesto[]
  metas: Meta[]
  deudas: Deuda[]
  recurrentes: Recurrente[]
  hoy?: Date
}

const DIA = 86_400_000

/**
 * Observaciones automáticas sobre las finanzas del usuario ("resumen
 * inteligente"), ordenadas por importancia. Todo se calcula en el
 * dispositivo a partir de los datos locales.
 */
export function generarInsights({
  transacciones,
  categorias,
  cuentas,
  presupuestos,
  metas,
  deudas,
  recurrentes,
  hoy = new Date(),
}: DatosInsights): Insight[] {
  const insights: Insight[] = []
  const reales = transacciones.filter(esMovimientoReal)
  const anio = hoy.getFullYear()
  const mes = hoy.getMonth()
  const dia = hoy.getDate()
  const diasDelMes = new Date(anio, mes + 1, 0).getDate()
  const inicioMes = new Date(anio, mes, 1)
  const inicioHoy = new Date(anio, mes, dia)
  const categoriasPorId = new Map(categorias.map((c) => [c.id, c]))

  const delMes = reales.filter((t) => t.fecha >= inicioMes)
  const gastoMes = delMes.filter((t) => t.tipo === 'gasto').reduce((s, t) => s + t.monto, 0)
  const ingresoMes = delMes.filter((t) => t.tipo === 'ingreso').reduce((s, t) => s + t.monto, 0)

  // 1. Ritmo de gasto vs. el mismo punto del mes pasado.
  const inicioMesPasado = new Date(anio, mes - 1, 1)
  const mismoDiaMesPasado = new Date(anio, mes - 1, Math.min(dia, new Date(anio, mes, 0).getDate()), 23, 59, 59)
  const gastoMesPasadoAEstaFecha = reales
    .filter((t) => t.tipo === 'gasto' && t.fecha >= inicioMesPasado && t.fecha <= mismoDiaMesPasado)
    .reduce((s, t) => s + t.monto, 0)
  if (gastoMesPasadoAEstaFecha > 0 && gastoMes > 0) {
    const cambio = (gastoMes - gastoMesPasadoAEstaFecha) / gastoMesPasadoAEstaFecha
    if (Math.abs(cambio) >= 0.1) {
      insights.push({
        id: 'ritmo',
        icono: cambio > 0 ? 'arrow up' : 'arrow down',
        tono: cambio > 0 ? 'alerta' : 'positivo',
        texto:
          cambio > 0
            ? `Llevas ${formatearPorcentaje(cambio)} más de gasto que a estas alturas del mes pasado.`
            : `Vas ${formatearPorcentaje(-cambio)} por debajo de lo que gastaste a estas alturas del mes pasado. ¡Bien!`,
        prioridad: cambio > 0 ? 60 : 30,
        destino: 'analisis:comparar',
      })
    }
  }

  // 2. Proyección de cierre del mes.
  if (dia >= 5 && dia < diasDelMes && (gastoMes > 0 || ingresoMes > 0)) {
    const gastoProyectado = (gastoMes / dia) * diasDelMes
    const balance = ingresoMes - gastoProyectado
    if (ingresoMes > 0) {
      insights.push({
        id: 'proyeccion',
        icono: balance >= 0 ? 'chartline' : 'exclamation triangle',
        tono: balance >= 0 ? 'info' : 'negativo',
        texto:
          balance >= 0
            ? `Al ritmo actual cerrarías el mes gastando ${formatearMoneda(gastoProyectado)} y ahorrando ${formatearMoneda(balance)}.`
            : `Al ritmo actual gastarías ${formatearMoneda(gastoProyectado)} este mes: ${formatearMoneda(-balance)} más de lo que ingresó.`,
        prioridad: balance >= 0 ? 25 : 80,
      })
    }
  }

  // 3. Categoría que más creció vs. su promedio de los 3 meses anteriores.
  const desde3 = new Date(anio, mes - 3, 1)
  const promedio = new Map<string, number>()
  for (const t of reales) {
    if (t.tipo !== 'gasto' || t.fecha < desde3 || t.fecha >= inicioMes) continue
    promedio.set(t.categoriaId, (promedio.get(t.categoriaId) ?? 0) + t.monto / 3)
  }
  const esteMes = new Map<string, number>()
  for (const t of delMes) {
    if (t.tipo === 'gasto') esteMes.set(t.categoriaId, (esteMes.get(t.categoriaId) ?? 0) + t.monto)
  }
  let mayorSubida: { id: string; exceso: number; cambio: number } | null = null
  for (const [id, gasto] of esteMes) {
    const base = promedio.get(id) ?? 0
    // Se compara contra el promedio prorrateado al día de hoy.
    const baseAHoy = (base * dia) / diasDelMes
    if (baseAHoy < 20) continue
    const exceso = gasto - baseAHoy
    const cambio = exceso / baseAHoy
    if (cambio >= 0.3 && exceso >= 50 && (!mayorSubida || exceso > mayorSubida.exceso)) {
      mayorSubida = { id, exceso, cambio }
    }
  }
  if (mayorSubida) {
    const nombre = categoriasPorId.get(mayorSubida.id)?.nombre ?? 'una categoría'
    insights.push({
      id: 'subida-categoria',
      icono: categoriasPorId.get(mayorSubida.id)?.icono ?? 'tag',
      tono: 'alerta',
      texto: `Estás gastando ${formatearPorcentaje(mayorSubida.cambio)} más de lo habitual en ${nombre} este mes.`,
      prioridad: 55,
      destino: 'analisis',
    })
  }

  // 4. Mayor gasto individual del mes.
  const mayorGasto = delMes.filter((t) => t.tipo === 'gasto').sort((a, b) => b.monto - a.monto)[0]
  if (mayorGasto && gastoMes > 0 && mayorGasto.monto / gastoMes >= 0.15) {
    const nombre = mayorGasto.concepto || categoriasPorId.get(mayorGasto.categoriaId)?.nombre || 'un gasto'
    insights.push({
      id: 'mayor-gasto',
      icono: 'search dollar',
      tono: 'info',
      texto: `Tu mayor gasto del mes fue ${nombre} (${formatearMoneda(mayorGasto.monto)}, ${formatearPorcentaje(mayorGasto.monto / gastoMes)} del total).`,
      prioridad: 20,
    })
  }

  // 5. Presupuestos.
  const estados = estadoPresupuestos(presupuestos, categorias, transacciones, anio, mes, hoy)
  const excedidos = estados.filter((e) => e.nivel === 'excedido')
  const enAlerta = estados.filter((e) => e.nivel === 'alerta')
  if (excedidos.length > 0) {
    insights.push({
      id: 'presupuestos-excedidos',
      icono: 'exclamation circle',
      tono: 'negativo',
      texto:
        excedidos.length === 1
          ? `Te pasaste del presupuesto de ${excedidos[0].categoria?.nombre ?? 'una categoría'} por ${formatearMoneda(-excedidos[0].restante)}.`
          : `Te pasaste en ${excedidos.length} presupuestos este mes.`,
      prioridad: 90,
      destino: 'planificar:presupuestos',
    })
  }
  if (enAlerta.length > 0) {
    insights.push({
      id: 'presupuestos-alerta',
      icono: 'exclamation triangle',
      tono: 'alerta',
      texto:
        enAlerta.length === 1
          ? `Ya usaste ${formatearPorcentaje(enAlerta[0].porcentaje)} del presupuesto de ${enAlerta[0].categoria?.nombre ?? 'una categoría'}; te quedan ${formatearMoneda(enAlerta[0].restante)}.`
          : `${enAlerta.length} presupuestos están por encima del 80 %.`,
      prioridad: 70,
      destino: 'planificar:presupuestos',
    })
  }
  if (presupuestos.length > 0 && excedidos.length === 0 && enAlerta.length === 0 && dia >= 15) {
    insights.push({
      id: 'presupuestos-ok',
      icono: 'check circle',
      tono: 'positivo',
      texto: 'Vas dentro de todos tus presupuestos este mes. ¡Sigue así!',
      prioridad: 15,
      destino: 'planificar:presupuestos',
    })
  }

  // 6. Tarjetas con pago cercano.
  for (const cuenta of cuentas.filter((c) => c.tipo === 'tarjeta_credito')) {
    const e = estadoTarjeta(cuenta, transacciones, hoy)
    if (e.deuda > 0 && e.diasParaPago !== undefined && e.diasParaPago <= 5) {
      insights.push({
        id: `tarjeta-${cuenta.id}`,
        icono: 'credit card',
        tono: e.diasParaPago <= 1 ? 'negativo' : 'alerta',
        texto: `Paga tu ${cuenta.nombre}: debes ${formatearMoneda(e.deuda)} y ${e.diasParaPago === 0 ? 'vence hoy' : e.diasParaPago === 1 ? 'vence mañana' : `vence en ${e.diasParaPago} días`}.`,
        prioridad: 95 - (e.diasParaPago ?? 0),
        destino: 'mas:cuentas',
      })
    }
  }

  // 7. Deudas vencidas o por vencer.
  const deudasConEstado = deudas.map((d) => ({ d, e: estadoDeuda(d, hoy) })).filter((x) => !x.e.saldada)
  const vencidas = deudasConEstado.filter((x) => x.e.vencida)
  const porVencer = deudasConEstado.filter((x) => !x.e.vencida && x.e.diasParaVencer !== undefined && x.e.diasParaVencer <= 7)
  if (vencidas.length > 0) {
    const [primera] = vencidas
    insights.push({
      id: 'deudas-vencidas',
      icono: 'handshake',
      tono: 'negativo',
      texto:
        vencidas.length === 1
          ? primera.d.tipo === 'me_deben'
            ? `${primera.d.persona} te debe ${formatearMoneda(primera.e.pendiente)} y ya venció el plazo.`
            : `Tu deuda con ${primera.d.persona} (${formatearMoneda(primera.e.pendiente)}) ya venció.`
          : `Tienes ${vencidas.length} deudas o préstamos vencidos.`,
      prioridad: 75,
      destino: 'planificar:deudas',
    })
  }
  if (porVencer.length > 0) {
    const [primera] = porVencer
    insights.push({
      id: 'deudas-por-vencer',
      icono: 'calendar alternate outline',
      tono: 'alerta',
      texto:
        primera.d.tipo === 'me_deben'
          ? `${primera.d.persona} debe pagarte ${formatearMoneda(primera.e.pendiente)} el ${formatearFecha(primera.d.fechaLimite!)}.`
          : `Debes pagarle ${formatearMoneda(primera.e.pendiente)} a ${primera.d.persona} el ${formatearFecha(primera.d.fechaLimite!)}.`,
      prioridad: 50,
      destino: 'planificar:deudas',
    })
  }

  // 8. Próximos recurrentes (7 días).
  const proximos = recurrentes
    .filter((r) => r.activa && r.tipo === 'gasto' && r.proximaFecha.getTime() - inicioHoy.getTime() <= 7 * DIA)
    .sort((a, b) => a.proximaFecha.getTime() - b.proximaFecha.getTime())
  if (proximos.length > 0) {
    const enSoles = (r: Recurrente) => (r.moneda === 'USD' ? r.monto * leerTipoCambio() : r.monto)
    const montoTexto = (r: Recurrente) => (r.moneda === 'USD' ? formatearDolares(r.monto) : formatearMoneda(r.monto))
    const total = proximos.reduce((s, r) => s + enSoles(r), 0)
    insights.push({
      id: 'recurrentes-proximos',
      icono: 'redo alternate',
      tono: 'info',
      texto:
        proximos.length === 1
          ? `Se viene ${proximos[0].concepto} (${montoTexto(proximos[0])}) el ${formatearFecha(proximos[0].proximaFecha)}.`
          : `En los próximos 7 días se cobran ${proximos.length} pagos fijos por ${formatearMoneda(total)}.`,
      prioridad: 35,
      destino: 'planificar:recurrentes',
    })
  }

  // 9. Metas con fecha: recordatorio del aporte mensual.
  const metaUrgente = metas
    .map((m) => ({ m, e: estadoMeta(m, hoy) }))
    .filter((x) => x.e.ahorroMensualNecesario !== undefined && !x.e.vencida)
    .sort((a, b) => (a.e.mesesRestantes ?? 99) - (b.e.mesesRestantes ?? 99))[0]
  if (metaUrgente) {
    insights.push({
      id: 'meta',
      icono: metaUrgente.m.icono,
      tono: 'info',
      texto: `Para "${metaUrgente.m.nombre}" te conviene ahorrar ${formatearMoneda(metaUrgente.e.ahorroMensualNecesario!)} al mes.`,
      prioridad: 22,
      destino: 'planificar:metas',
    })
  }

  // 10. Primera semana del mes: el reporte del mes anterior está listo.
  if (dia <= 7) {
    const mesAnterior = new Date(anio, mes - 1, 1)
    const huboMovimientos = reales.some((t) => t.fecha >= mesAnterior && t.fecha < inicioMes)
    if (huboMovimientos) {
      const nombre = new Intl.DateTimeFormat('es-PE', { month: 'long' }).format(mesAnterior)
      insights.push({
        id: 'reporte-mensual',
        icono: 'file alternate outline',
        tono: 'info',
        texto: `Tu reporte de ${nombre} está listo: mira cómo te fue y descárgalo en PDF.`,
        prioridad: 45,
        destino: 'analisis:reporte',
      })
    }
  }

  // 11. Sin datos aún.
  if (reales.length === 0) {
    insights.push({
      id: 'bienvenida',
      icono: 'lightbulb',
      tono: 'info',
      texto: 'Registra tus gastos con el botón "+" y aquí verás consejos sobre tus finanzas.',
      prioridad: 1,
    })
  }

  return insights.sort((a, b) => b.prioridad - a.prioridad)
}
