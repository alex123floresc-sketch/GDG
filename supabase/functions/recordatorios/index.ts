// Edge Function "recordatorios" (Deno). La llama pg_cron una vez por hora
// (sección 4 de BASE_DE_DATOS.sql). Para cada dispositivo suscrito cuya hora
// elegida es la hora actual en su zona, y que hoy aún no recibió aviso,
// envía una notificación push con lo que vence hoy o mañana.
// Instrucciones de despliegue: LEEME.md (en esta carpeta).
import { createClient } from 'npm:@supabase/supabase-js@2'
import webpush from 'npm:web-push@3.6.7'
import { ahoraEnZona, armarMensaje, eventosProximos, type DatosUsuario } from './eventos.ts'

interface Suscripcion {
  id: string
  user_id: string
  endpoint: string
  p256dh: string
  auth: string
  hora: number
  zona: string
  ultimo_envio: string | null
}

const env = (nombre: string) => {
  const valor = Deno.env.get(nombre)
  if (!valor) throw new Error(`Falta el secreto ${nombre}`)
  return valor
}

Deno.serve(async (req) => {
  // Solo el cron (o quien tenga el secreto) puede dispararla.
  if (req.headers.get('x-cron-secret') !== env('CRON_SECRET')) {
    return new Response('No autorizado', { status: 401 })
  }
  // { "forzar": true } ignora la hora y el "ya se envió hoy" (para probar).
  const { forzar = false } = await req.json().catch(() => ({}))

  webpush.setVapidDetails(env('VAPID_SUBJECT'), env('VAPID_PUBLIC_KEY'), env('VAPID_PRIVATE_KEY'))
  // Clave de servicio: lee los datos de todos los usuarios (sin RLS).
  const db = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { persistSession: false },
  })

  const { data: suscripciones, error } = await db.from('suscripciones_push').select('*')
  if (error) return Response.json({ error: error.message }, { status: 500 })

  const datosPorUsuario = new Map<string, Promise<DatosUsuario>>()
  const cargar = (userId: string) => {
    if (!datosPorUsuario.has(userId)) {
      datosPorUsuario.set(
        userId,
        (async () => {
          const [r, q, c, d] = await Promise.all([
            db.from('recurrentes').select('tipo, monto, moneda, concepto, proxima_fecha, activa').eq('user_id', userId),
            db.from('cuotas').select('descripcion, numero_cuotas, monto_cuota, primera_cuota').eq('user_id', userId),
            db.from('cuentas').select('nombre, tipo, dia_pago').eq('user_id', userId),
            db.from('deudas').select('persona, tipo, monto, concepto, fecha_limite, abonos').eq('user_id', userId),
          ])
          // Una tabla que aún no existe (SQL viejo) simplemente no aporta avisos.
          return {
            recurrentes: r.data ?? [],
            cuotas: q.data ?? [],
            cuentas: c.data ?? [],
            deudas: d.data ?? [],
          }
        })(),
      )
    }
    return datosPorUsuario.get(userId)!
  }

  const resumen = { revisadas: 0, enviadas: 0, sinNovedades: 0, eliminadas: 0, errores: 0 }
  for (const s of (suscripciones ?? []) as Suscripcion[]) {
    const { fecha: hoy, hora } = ahoraEnZona(s.zona)
    if (!forzar && (hora !== s.hora || s.ultimo_envio === hoy)) continue
    resumen.revisadas++

    const mensaje = armarMensaje(eventosProximos(await cargar(s.user_id), hoy), hoy)
    if (!mensaje) {
      resumen.sinNovedades++
      await db.from('suscripciones_push').update({ ultimo_envio: hoy }).eq('id', s.id)
      continue
    }
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        JSON.stringify(mensaje),
        { TTL: 12 * 60 * 60, urgency: 'normal' },
      )
      resumen.enviadas++
      await db.from('suscripciones_push').update({ ultimo_envio: hoy }).eq('id', s.id)
    } catch (e) {
      const estado = (e as { statusCode?: number }).statusCode
      // 404/410: el navegador anuló la suscripción (app desinstalada, etc.).
      if (estado === 404 || estado === 410) {
        resumen.eliminadas++
        await db.from('suscripciones_push').delete().eq('id', s.id)
      } else {
        resumen.errores++
        console.error('push', estado, (e as Error).message)
      }
    }
  }

  return Response.json(resumen)
})
