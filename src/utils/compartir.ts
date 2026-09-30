/*
 * Lo compartido a la app (Web Share Target, ver public/sw-compartir.js): el
 * Service Worker lo deja en la caché 'gg-compartido' y abre /?compartido=1.
 */

const CACHE_COMPARTIDO = 'gg-compartido'
/** Lo compartido hace más de 10 minutos ya no se usa (quedó de una vez anterior). */
const VIGENCIA_MS = 10 * 60 * 1000

export interface Compartido {
  texto?: string
  imagen?: Blob
}

export function hayCompartidoEnUrl(): boolean {
  return new URLSearchParams(window.location.search).has('compartido')
}

let lectura: Promise<Compartido | null> | null = null

/**
 * Lee lo compartido y lo borra de la caché (se usa una sola vez). Llamadas
 * repetidas (doble efecto de StrictMode) reciben la misma lectura.
 */
export function leerCompartido(): Promise<Compartido | null> {
  lectura ??= leer()
  return lectura
}

async function leer(): Promise<Compartido | null> {
  if (typeof caches === 'undefined') return null
  try {
    const cache = await caches.open(CACHE_COMPARTIDO)
    const [resTexto, resImagen] = await Promise.all([
      cache.match('/compartido/texto'),
      cache.match('/compartido/imagen'),
    ])
    await Promise.all([cache.delete('/compartido/texto'), cache.delete('/compartido/imagen')])
    if (!resTexto && !resImagen) return null
    const datos = resTexto ? ((await resTexto.json()) as { texto?: string; fecha?: number }) : {}
    if (datos.fecha && Date.now() - datos.fecha > VIGENCIA_MS) return null
    const imagen = resImagen ? await resImagen.blob() : undefined
    const texto = datos.texto?.trim() || undefined
    return texto || imagen ? { texto, imagen } : null
  } catch {
    return null
  }
}
