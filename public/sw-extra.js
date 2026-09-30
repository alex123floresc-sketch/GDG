/*
 * Código propio del Service Worker (lo importa el SW generado por Workbox
 * con workbox.importScripts en vite.config.ts):
 *   1. Web Share Target (abajo) y 2. notificaciones push (al final).
 *
 * 1. Web Share Target: "Compartir → Gestor de Gastos" desde otra app (una foto
 * de la boleta o el texto de una notificación de Yape). El manifest manda
 * un POST multipart a /compartir; aquí se guarda lo recibido en la caché
 * 'gg-compartido' y se redirige a /?compartido=1, donde Dashboard lo lee
 * (utils/compartir.ts) y abre el registro con eso.
 * Workbox solo enruta GET, así que este POST no choca.
 */
const CACHE_COMPARTIDO = 'gg-compartido'

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url)
  if (event.request.method !== 'POST' || url.origin !== self.location.origin || url.pathname !== '/compartir') return

  event.respondWith(
    (async () => {
      try {
        const datos = await event.request.formData()
        const cache = await caches.open(CACHE_COMPARTIDO)
        await cache.delete('/compartido/imagen')
        const texto = ['title', 'text', 'url']
          .map((k) => datos.get(k))
          .filter((v) => typeof v === 'string' && v.trim())
          .join('\n')
        await cache.put(
          '/compartido/texto',
          new Response(JSON.stringify({ texto, fecha: Date.now() }), {
            headers: { 'Content-Type': 'application/json' },
          }),
        )
        const archivo = datos.getAll('imagen').find((f) => f && typeof f !== 'string' && f.type.startsWith('image/'))
        if (archivo) {
          await cache.put('/compartido/imagen', new Response(archivo, { headers: { 'Content-Type': archivo.type } }))
        }
      } catch (e) {
        console.error('[compartir]', e)
      }
      return Response.redirect(new URL('/?compartido=1', self.location.origin).href, 303)
    })(),
  )
})

/*
 * 2. Recordatorios push (Edge Function supabase/functions/recordatorios).
 * El mensaje es JSON { title, body, url, tag }.
 */
self.addEventListener('push', (event) => {
  let datos = {}
  try {
    datos = event.data ? event.data.json() : {}
  } catch {
    datos = { body: event.data ? event.data.text() : '' }
  }
  event.waitUntil(
    self.registration.showNotification(datos.title || 'Gestor de Gastos', {
      body: datos.body || '',
      icon: '/pwa-192x192.png',
      badge: '/pwa-64x64.png',
      tag: datos.tag || 'recordatorio',
      data: { url: datos.url || '/' },
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const destino = new URL(event.notification.data?.url || '/', self.location.origin).href
  event.waitUntil(
    (async () => {
      const ventanas = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      const abierta = ventanas.find((c) => new URL(c.url).origin === self.location.origin)
      if (abierta) {
        await abierta.focus()
        if ('navigate' in abierta) await abierta.navigate(destino).catch(() => {})
        return
      }
      await self.clients.openWindow(destino)
    })(),
  )
})
