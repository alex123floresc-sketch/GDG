import { leerColor, leerCompacto, leerLetra, leerTema, type Tema } from './preferencias'

const consultaOscuro = () => window.matchMedia?.('(prefers-color-scheme: dark)')

/** Tema que se ve realmente: resuelve "auto" con la preferencia del sistema. */
export function temaEfectivo(tema: Tema): 'claro' | 'oscuro' {
  if (tema !== 'auto') return tema
  return consultaOscuro()?.matches ? 'oscuro' : 'claro'
}

/**
 * Aplica el tema en `<html data-theme>` (lo usan los estilos de
 * index.css), junto con el color de la app (`data-color`), el tamaño de
 * letra (`data-letra`) y el modo compacto (`data-compacto`), y pinta la
 * barra del navegador/PWA con el color del encabezado.
 */
export function aplicarTema(tema: Tema = leerTema()): void {
  const efectivo = temaEfectivo(tema)
  const raiz = document.documentElement
  raiz.dataset.theme = efectivo === 'oscuro' ? 'dark' : 'light'
  raiz.style.colorScheme = efectivo === 'oscuro' ? 'dark' : 'light'
  raiz.dataset.color = leerColor()
  raiz.dataset.letra = leerLetra()
  raiz.dataset.compacto = leerCompacto() ? 'si' : 'no'
  const barra = getComputedStyle(raiz).getPropertyValue('--color-header-1').trim()
  if (barra) document.querySelector('meta[name="theme-color"]')?.setAttribute('content', barra)
}

/** Reaplica el tema si cambia la preferencia del sistema (modo "auto"). */
export function escucharTemaSistema(): () => void {
  const consulta = consultaOscuro()
  if (!consulta) return () => {}
  const manejar = () => {
    if (leerTema() === 'auto') aplicarTema('auto')
  }
  consulta.addEventListener('change', manejar)
  return () => consulta.removeEventListener('change', manejar)
}
