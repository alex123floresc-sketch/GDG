import { useSyncExternalStore } from 'react'

/*
 * "Ocultar montos": cambia todos los importes por "S/ •••" (para usar la
 * app en público o mostrarla sin revelar cifras). Es una preferencia de
 * este dispositivo; los formateadores de utils/formato.ts la consultan.
 */

const CLAVE = 'gg:montosOcultos'
const oyentes = new Set<() => void>()

let ocultos = (() => {
  try {
    return localStorage.getItem(CLAVE) === '1'
  } catch {
    return false
  }
})()

export function montosOcultos(): boolean {
  return ocultos
}

export function alternarMontosOcultos(): void {
  ocultos = !ocultos
  try {
    localStorage.setItem(CLAVE, ocultos ? '1' : '0')
  } catch {
    // Sin almacenamiento: dura solo esta sesión.
  }
  oyentes.forEach((o) => o())
}

function suscribir(oyente: () => void): () => void {
  oyentes.add(oyente)
  return () => oyentes.delete(oyente)
}

/**
 * Estado del modo privado. Los componentes que lo usan se vuelven a
 * pintar al cambiarlo (App lo usa arriba del todo, así se repinta todo).
 */
export function useMontosOcultos(): boolean {
  return useSyncExternalStore(suscribir, montosOcultos)
}
