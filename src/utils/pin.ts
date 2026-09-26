/*
 * Bloqueo con PIN de este dispositivo (no se sincroniza).
 *
 * Es una barrera de privacidad (que nadie vea tus finanzas si toma tu
 * celular desbloqueado), NO cifrado: los datos siguen en IndexedDB. Por eso
 * nunca se guarda el PIN, solo un hash PBKDF2 con sal aleatoria. Si se
 * olvida, la salida es cerrar sesión (los datos están en Supabase).
 */

const CLAVE_PIN = 'gg:pin'
const CLAVE_INTENTOS = 'gg:pinIntentos'
const ITERACIONES = 150_000
const INTENTOS_ANTES_DE_ESPERAR = 5
const ESPERA_MS = 30_000

interface PinGuardado {
  sal: string
  hash: string
  /** Minutos en segundo plano antes de volver a pedir el PIN. */
  bloquearTras: number
}

const aBase64 = (bytes: ArrayBuffer | Uint8Array) =>
  btoa(String.fromCharCode(...new Uint8Array(bytes)))
const deBase64 = (texto: string) => Uint8Array.from(atob(texto), (c) => c.charCodeAt(0))

async function derivar(pin: string, sal: Uint8Array<ArrayBuffer>): Promise<string> {
  const clave = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: sal, iterations: ITERACIONES },
    clave,
    256,
  )
  return aBase64(bits)
}

function leer(): PinGuardado | null {
  try {
    const crudo = localStorage.getItem(CLAVE_PIN)
    return crudo ? (JSON.parse(crudo) as PinGuardado) : null
  } catch {
    return null
  }
}

export function pinActivo(): boolean {
  return leer() !== null
}

export function minutosParaBloquear(): number {
  return leer()?.bloquearTras ?? 1
}

export function validarFormatoPin(pin: string): string | null {
  if (!/^\d{4,6}$/.test(pin)) return 'El PIN debe tener de 4 a 6 números.'
  if (/^(\d)\1+$/.test(pin) || '0123456789'.includes(pin) || '9876543210'.includes(pin)) {
    return 'Elige un PIN menos obvio (no 1111 ni 1234).'
  }
  return null
}

export async function guardarPin(pin: string, bloquearTras = 1): Promise<void> {
  const error = validarFormatoPin(pin)
  if (error) throw new Error(error)
  const sal = crypto.getRandomValues(new Uint8Array(16))
  const datos: PinGuardado = { sal: aBase64(sal), hash: await derivar(pin, sal), bloquearTras }
  try {
    localStorage.setItem(CLAVE_PIN, JSON.stringify(datos))
    localStorage.removeItem(CLAVE_INTENTOS)
  } catch {
    throw new Error('Este navegador no permite guardar el PIN (¿modo privado?).')
  }
}

export function cambiarTiempoBloqueo(minutos: number): void {
  const actual = leer()
  if (!actual) return
  try {
    localStorage.setItem(CLAVE_PIN, JSON.stringify({ ...actual, bloquearTras: minutos }))
  } catch {
    // Sin almacenamiento: se mantiene el tiempo anterior.
  }
}

export function quitarPin(): void {
  try {
    localStorage.removeItem(CLAVE_PIN)
    localStorage.removeItem(CLAVE_INTENTOS)
  } catch {
    // Nada que hacer.
  }
}

interface Intentos {
  fallidos: number
  bloqueadoHasta: number
}

function leerIntentos(): Intentos {
  try {
    return JSON.parse(localStorage.getItem(CLAVE_INTENTOS) ?? '') as Intentos
  } catch {
    return { fallidos: 0, bloqueadoHasta: 0 }
  }
}

/** Milisegundos que faltan para poder volver a intentar (0 = ya se puede). */
export function esperaRestante(): number {
  return Math.max(0, leerIntentos().bloqueadoHasta - Date.now())
}

/**
 * Comprueba el PIN. Tras 5 intentos fallidos obliga a esperar 30 s antes
 * de cada nuevo intento.
 */
export async function verificarPin(pin: string): Promise<boolean> {
  const guardado = leer()
  if (!guardado) return true
  if (esperaRestante() > 0) return false

  const correcto = (await derivar(pin, deBase64(guardado.sal))) === guardado.hash
  const intentos = leerIntentos()
  const nuevos: Intentos = correcto
    ? { fallidos: 0, bloqueadoHasta: 0 }
    : {
        fallidos: intentos.fallidos + 1,
        bloqueadoHasta: intentos.fallidos + 1 >= INTENTOS_ANTES_DE_ESPERAR ? Date.now() + ESPERA_MS : 0,
      }
  try {
    localStorage.setItem(CLAVE_INTENTOS, JSON.stringify(nuevos))
  } catch {
    // Sin almacenamiento no se puede limitar intentos entre recargas.
  }
  return correcto
}
