/*
 * Preferencias de este dispositivo (no se sincronizan). localStorage puede
 * no estar disponible (modo privado, almacenamiento bloqueado): todo acceso
 * va en try/catch y cae a un valor por defecto.
 */

const CLAVE_TIPO_CAMBIO = 'gg:tipoCambioUSD'
const CLAVE_TEMA = 'gg:tema'

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
