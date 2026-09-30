/*
 * Web Share Target: "Compartir → Gestor de Gastos" desde otra app (una foto
 * de la boleta o el texto de una notificación de Yape). El manifest manda
 * un POST multipart a /compartir; aquí se guarda lo recibido en la caché
 * 'gg-compartido' y se redirige a /?compartido=1, donde Dashboard lo lee
 * (utils/compartir.ts) y abre el registro con eso.
 *
 * Lo importa el Service Worker generado por Workbox (workbox.importScripts
 * en vite.config.ts). Workbox solo enruta GET, así que este POST no choca.
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
