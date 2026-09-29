/*
 * Preferencias de este dispositivo (no se sincronizan). localStorage puede
 * no estar disponible (modo privado, almacenamiento bloqueado): todo acceso
 * va en try/catch y cae a un valor por defecto.
 */

const CLAVE_TIPO_CAMBIO = 'gg:tipoCambioUSD'
const CLAVE_TEMA = 'gg:tema'
const CLAVE_COLOR = 'gg:color'
const CLAVE_LETRA = 'gg:letra'
const CLAVE_COMPACTO = 'gg:compacto'

export const TIPO_CAMBIO_POR_DEFECTO = 3.75

function leer(clave: string): string | null {
  try {
    return localStorage.getItem(clave)
  } catch {
    return null
  }
}

function guardar(clave: string, valor: string): void {
  try {
    localStorage.setItem(clave, valor)
  } catch {
    // Sin almacenamiento: la preferencia dura solo esta sesión.
  }
}

/** Último tipo de cambio USD→PEN usado al registrar en dólares. */
export function leerTipoCambio(): number {
  const valor = Number(leer(CLAVE_TIPO_CAMBIO))
  return Number.isFinite(valor) && valor > 0 ? valor : TIPO_CAMBIO_POR_DEFECTO
}

export function guardarTipoCambio(valor: number): void {
  if (Number.isFinite(valor) && valor > 0) guardar(CLAVE_TIPO_CAMBIO, String(valor))
}

export type Tema = 'auto' | 'claro' | 'oscuro'

export function leerTema(): Tema {
  const valor = leer(CLAVE_TEMA)
  return valor === 'claro' || valor === 'oscuro' ? valor : 'auto'
}

export function guardarTema(tema: Tema): void {
  guardar(CLAVE_TEMA, tema)
}

/** Color principal de la app (ver `:root[data-color]` en index.css). */
export type ColorApp = 'indigo' | 'azul' | 'verde' | 'rosa' | 'turquesa' | 'grafito'
export const COLORES_APP: { id: ColorApp; nombre: string; muestra: string }[] = [
  { id: 'indigo', nombre: 'Índigo', muestra: '#4f46e5' },
  { id: 'azul', nombre: 'Azul', muestra: '#1d6fd6' },
  { id: 'verde', nombre: 'Verde', muestra: '#0f7b5f' },
  { id: 'rosa', nombre: 'Rosa', muestra: '#c2185b' },
  { id: 'turquesa', nombre: 'Turquesa', muestra: '#0e7490' },
  { id: 'grafito', nombre: 'Grafito', muestra: '#374151' },
]

export function leerColor(): ColorApp {
  const valor = leer(CLAVE_COLOR)
  return COLORES_APP.some((c) => c.id === valor) ? (valor as ColorApp) : 'indigo'
}

export function guardarColor(color: ColorApp): void {
  guardar(CLAVE_COLOR, color)
}

export type TamanoLetra = 'pequena' | 'normal' | 'grande' | 'muy-grande'

export function leerLetra(): TamanoLetra {
  const valor = leer(CLAVE_LETRA)
  return valor === 'pequena' || valor === 'grande' || valor === 'muy-grande' ? valor : 'normal'
}

export function guardarLetra(letra: TamanoLetra): void {
  guardar(CLAVE_LETRA, letra)
}

export function leerCompacto(): boolean {
  return leer(CLAVE_COMPACTO) === 'si'
}

export function guardarCompacto(compacto: boolean): void {
  guardar(CLAVE_COMPACTO, compacto ? 'si' : 'no')
}
