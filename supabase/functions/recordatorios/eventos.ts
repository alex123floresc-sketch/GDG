/*
 * Lógica pura de los recordatorios (sin Deno ni Supabase, para poder
 * probarla con Node). Trabaja con las filas remotas (snake_case) y fechas
 * 'AAAA-MM-DD' en la zona horaria del usuario.
 */

export interface FilaRecurrente {
  tipo: string
  monto: number | string
  moneda?: string | null
  concepto: string
  proxima_fecha: string
  activa: boolean
}

export interface FilaCuota {
  descripcion: string
  numero_cuotas: number
  monto_cuota: number | string
  primera_cuota: string
}

export interface FilaCuenta {
  nombre: string
  tipo: string
  dia_pago: number | null
}

export interface FilaDeuda {
  persona: string
  tipo: string
  monto: number | string
  concepto?: string | null
  fecha_limite: string | null
  abonos: { monto: number | string }[] | null
}

export interface DatosUsuario {
  recurrentes: FilaRecurrente[]
  cuotas: FilaCuota[]
  cuentas: FilaCuenta[]
  deudas: FilaDeuda[]
}

export interface Evento {
  cuando: 'hoy' | 'mañana'
  texto: string
  /** Sección de la app que abre la notificación. */
  seccion: 'planificar' | 'mas'
}

export interface Mensaje {
  title: string
  body: string
  url: string
  tag: string
}

const soles = new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN' })
const dolares = new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'USD' })
const dinero = (monto: number | string, moneda?: string | null) =>
  (moneda === 'USD' ? dolares : soles).format(Number(monto))

/** Fecha y hora local en una zona horaria ('AAAA-MM-DD' y 0–23). */
export function ahoraEnZona(zona: string, ahora = new Date()): { fecha: string; hora: number } {
  let partes: Intl.DateTimeFormatPart[]
  try {
    partes = new Intl.DateTimeFormat('en-CA', {
      timeZone: zona,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(ahora)
  } catch {
    return ahoraEnZona('America/Lima', ahora)
  }
  const v = (t: string) => partes.find((p) => p.type === t)?.value ?? '00'
  return { fecha: `${v('year')}-${v('month')}-${v('day')}`, hora: Number(v('hour')) % 24 }
}

/** 'AAAA-MM-DD' + n días. */
export function sumarDias(fecha: string, dias: number): string {
  const [a, m, d] = fecha.split('-').map(Number)
  return new Date(Date.UTC(a, m - 1, d + dias)).toISOString().slice(0, 10)
}

/** 'AAAA-MM-DD' + n meses, con el día recortado al último del mes (31 → 30). */
export function sumarMeses(fecha: string, meses: number): string {
  const [a, m, d] = fecha.slice(0, 10).split('-').map(Number)
  const ultimo = new Date(Date.UTC(a, m - 1 + meses + 1, 0)).getUTCDate()
  return new Date(Date.UTC(a, m - 1 + meses, Math.min(d, ultimo))).toISOString().slice(0, 10)
}

/** Día de pago `dia` en el mes de `fecha` (recortado al último día). */
function diaEnMes(fecha: string, dia: number): string {
  const [a, m] = fecha.split('-').map(Number)
  const ultimo = new Date(Date.UTC(a, m, 0)).getUTCDate()
  return `${a}-${String(m).padStart(2, '0')}-${String(Math.min(dia, ultimo)).padStart(2, '0')}`
}

/** Lo que vence hoy o mañana. */
export function eventosProximos(datos: DatosUsuario, hoy: string): Evento[] {
  const manana = sumarDias(hoy, 1)
  const cuando = (f: string | null | undefined): Evento['cuando'] | null =>
    !f ? null : f.slice(0, 10) === hoy ? 'hoy' : f.slice(0, 10) === manana ? 'mañana' : null
  const eventos: Evento[] = []

  for (const r of datos.recurrentes) {
    const c = r.activa ? cuando(r.proxima_fecha) : null
    if (!c) continue
    eventos.push({
      cuando: c,
      seccion: 'planificar',
      texto:
        r.tipo === 'ingreso'
          ? `Te llega ${r.concepto} (${dinero(r.monto, r.moneda)})`
          : `${r.concepto}: ${dinero(r.monto, r.moneda)}`,
    })
  }

  for (const q of datos.cuotas) {
    for (let k = 0; k < q.numero_cuotas; k++) {
      const c = cuando(sumarMeses(q.primera_cuota, k))
      if (!c) continue
      eventos.push({
        cuando: c,
        seccion: 'planificar',
        texto: `Cuota ${k + 1}/${q.numero_cuotas} de ${q.descripcion}: ${dinero(q.monto_cuota)}`,
      })
    }
  }

  for (const t of datos.cuentas) {
    if (t.tipo !== 'tarjeta_credito' || !t.dia_pago) continue
    // El día de pago de este mes o, si mañana ya es otro mes, el de ese.
    const c = cuando(diaEnMes(hoy, t.dia_pago)) ?? cuando(diaEnMes(manana, t.dia_pago))
    if (c) eventos.push({ cuando: c, seccion: 'mas', texto: `Pago de tu tarjeta ${t.nombre}` })
  }

  for (const d of datos.deudas) {
    const c = cuando(d.fecha_limite)
    if (!c) continue
    const pagado = (d.abonos ?? []).reduce((s, a) => s + Number(a.monto), 0)
    const pendiente = Number(d.monto) - pagado
    if (pendiente < 0.005) continue
    eventos.push({
      cuando: c,
      seccion: 'planificar',
      texto:
        d.tipo === 'debo'
          ? `Le debes ${dinero(pendiente)} a ${d.persona}`
          : `${d.persona} te debe ${dinero(pendiente)}`,
    })
  }

  // Primero lo de hoy.
  return eventos.sort((a, b) => (a.cuando === b.cuando ? 0 : a.cuando === 'hoy' ? -1 : 1))
}

/** Texto de la notificación (una sola por día y dispositivo). */
export function armarMensaje(eventos: Evento[], hoy: string): Mensaje | null {
  if (eventos.length === 0) return null
  const seccion = eventos.every((e) => e.seccion === 'mas') ? 'mas' : 'planificar'
  const url = `/?seccion=${seccion}`
  const tag = `recordatorio-${hoy}`
  if (eventos.length === 1) {
    const e = eventos[0]
    return { title: e.cuando === 'hoy' ? 'Para hoy' : 'Para mañana', body: e.texto, url, tag }
  }
  const lineas = eventos.slice(0, 4).map((e) => `${e.cuando === 'hoy' ? 'Hoy' : 'Mañana'}: ${e.texto}`)
  if (eventos.length > 4) lineas.push(`… y ${eventos.length - 4} más`)
  return { title: `Tienes ${eventos.length} pagos y cobros próximos`, body: lineas.join('\n'), url, tag }
}
