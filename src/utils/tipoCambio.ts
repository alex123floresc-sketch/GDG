/*
 * Tipo de cambio USD→PEN del día desde ExchangeRate-API (gratis, sin clave,
 * permite CORS). Es el tipo de cambio de mercado, no el de un banco o casa
 * de cambio: se ofrece como sugerencia editable. Se guarda en localStorage
 * para no consultarlo en cada registro y para tenerlo sin conexión.
 */

const URL_API = 'https://open.er-api.com/v6/latest/USD'
const CLAVE = 'gg:tipoCambioDia'
const VIGENCIA_MS = 6 * 60 * 60 * 1000

export interface TipoCambioDia {
  valor: number
  /** Cuándo lo publicó la fuente. */
  fecha: Date
  fuente: string
}

function leerCache(): TipoCambioDia | null {
  try {
    const crudo = localStorage.getItem(CLAVE)
    if (!crudo) return null
    const { valor, fecha, fuente, guardado } = JSON.parse(crudo)
    if (!Number.isFinite(valor) || Date.now() - guardado > VIGENCIA_MS) return null
    return { valor, fecha: new Date(fecha), fuente }
  } catch {
    return null
  }
}

function guardarCache(t: TipoCambioDia): void {
  try {
    localStorage.setItem(CLAVE, JSON.stringify({ ...t, fecha: t.fecha.toISOString(), guardado: Date.now() }))
  } catch {
    // Sin almacenamiento: se volverá a consultar la próxima vez.
  }
}

/**
 * Tipo de cambio del día. Usa la caché si es reciente; si no hay red o la
 * fuente falla, devuelve null (la app sigue con el último que usó el
 * usuario).
 */
export async function obtenerTipoCambioDia(forzar = false): Promise<TipoCambioDia | null> {
  if (!forzar) {
    const cache = leerCache()
    if (cache) return cache
  }
  if (!navigator.onLine) return null

  try {
    const controlador = new AbortController()
    const limite = setTimeout(() => controlador.abort(), 6000)
    const respuesta = await fetch(URL_API, { signal: controlador.signal })
    clearTimeout(limite)
    if (!respuesta.ok) return null

    const datos = await respuesta.json()
    const valor = Number(datos?.rates?.PEN)
    if (datos?.result !== 'success' || !Number.isFinite(valor) || valor <= 0) return null

    const tipo: TipoCambioDia = {
      valor: Math.round(valor * 1000) / 1000,
      fecha: new Date(datos.time_last_update_utc ?? Date.now()),
      fuente: 'ExchangeRate-API',
    }
    guardarCache(tipo)
    return tipo
  } catch {
    return null
  }
}
