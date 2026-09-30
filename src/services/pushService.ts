import { supabase } from './supabaseClient'

/*
 * Recordatorios push: este dispositivo se suscribe con Web Push y guarda la
 * suscripción en `suscripciones_push`. Una vez por hora la Edge Function
 * `recordatorios` (supabase/functions/recordatorios) revisa, para quien
 * esté en su hora elegida, lo que vence hoy o mañana y le envía la
 * notificación; la muestra public/sw-extra.js.
 */

export type EstadoPush =
  | 'no-soportado' // el navegador no tiene Push API (o no es la app instalada en iPhone)
  | 'sin-configurar' // falta VITE_VAPID_PUBLIC_KEY o Supabase
  | 'bloqueado' // el usuario negó el permiso de notificaciones
  | 'activo'
  | 'inactivo'

const CLAVE_PUBLICA = import.meta.env.VITE_VAPID_PUBLIC_KEY?.trim()

export function pushSoportado(): boolean {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
}

/** Clave VAPID en base64url → bytes (lo que pide pushManager.subscribe). */
function claveABytes(base64url: string): Uint8Array<ArrayBuffer> {
  const relleno = '='.repeat((4 - (base64url.length % 4)) % 4)
  const base64 = (base64url + relleno).replace(/-/g, '+').replace(/_/g, '/')
  const binario = atob(base64)
  const bytes = new Uint8Array(new ArrayBuffer(binario.length))
  for (let i = 0; i < binario.length; i++) bytes[i] = binario.charCodeAt(i)
  return bytes
}

async function suscripcionActual(): Promise<PushSubscription | null> {
  const registro = await navigator.serviceWorker.getRegistration()
  return (await registro?.pushManager.getSubscription()) ?? null
}

export async function estadoPush(): Promise<EstadoPush> {
  if (!pushSoportado()) return 'no-soportado'
  if (!CLAVE_PUBLICA || !supabase) return 'sin-configurar'
  if (Notification.permission === 'denied') return 'bloqueado'
  return (await suscripcionActual()) ? 'activo' : 'inactivo'
}

/** Pide permiso, suscribe este dispositivo y lo registra en Supabase. */
export async function activarPush(usuarioId: string, hora: number): Promise<void> {
  if (!pushSoportado()) throw new Error('Este navegador no admite notificaciones.')
  if (!CLAVE_PUBLICA || !supabase) throw new Error('Los recordatorios no están configurados en esta instalación.')

  const permiso = await Notification.requestPermission()
  if (permiso !== 'granted') throw new Error('Sin permiso de notificaciones no podemos avisarte.')

  const registro = await navigator.serviceWorker.ready
  const suscripcion =
    (await registro.pushManager.getSubscription()) ??
    (await registro.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: claveABytes(CLAVE_PUBLICA) }))

  const json = suscripcion.toJSON()
  const { error } = await supabase.from('suscripciones_push').upsert(
    {
      user_id: usuarioId,
      endpoint: suscripcion.endpoint,
      p256dh: json.keys?.p256dh ?? '',
      auth: json.keys?.auth ?? '',
      hora,
      zona: Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Lima',
    },
    { onConflict: 'user_id,endpoint' },
  )
  if (error) {
    await suscripcion.unsubscribe().catch(() => {})
    throw new Error(
      error.code === '42P01' || error.code === 'PGRST205'
        ? 'Falta ejecutar BASE_DE_DATOS.sql en Supabase para activar los recordatorios.'
        : `No se pudo activar: ${error.message}`,
    )
  }
}

/** Cambia la hora del aviso diario (0–23, hora local). */
export async function cambiarHoraPush(usuarioId: string, hora: number): Promise<void> {
  const suscripcion = await suscripcionActual()
  if (!supabase || !suscripcion) return
  const { error } = await supabase
    .from('suscripciones_push')
    .update({ hora })
    .eq('user_id', usuarioId)
    .eq('endpoint', suscripcion.endpoint)
  if (error) throw new Error(`No se pudo cambiar la hora: ${error.message}`)
}

/**
 * Da de baja este dispositivo (también al cerrar sesión: el siguiente
 * usuario no debe recibir los avisos del anterior). Mejor esfuerzo remoto.
 */
export async function desactivarPush(usuarioId: string): Promise<void> {
  if (!pushSoportado()) return
  const suscripcion = await suscripcionActual()
  if (!suscripcion) return
  if (supabase) {
    await supabase
      .from('suscripciones_push')
      .delete()
      .eq('user_id', usuarioId)
      .eq('endpoint', suscripcion.endpoint)
      .then(
        () => undefined,
        () => undefined,
      )
  }
  await suscripcion.unsubscribe().catch(() => {})
}

/** Notificación local de prueba (comprueba permiso y Service Worker). */
export async function probarNotificacion(): Promise<void> {
  const registro = await navigator.serviceWorker.ready
  await registro.showNotification('Gestor de Gastos', {
    body: 'Así te avisaremos de pagos y cobros próximos.',
    icon: '/pwa-192x192.png',
    badge: '/pwa-64x64.png',
    tag: 'prueba',
  })
}
