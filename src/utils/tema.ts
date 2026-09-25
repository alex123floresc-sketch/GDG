import { leerTema, type Tema } from './preferencias'

const consultaOscuro = () => window.matchMedia?.('(prefers-color-scheme: dark)')

/** Tema que se ve realmente: resuelve "auto" con la preferencia del sistema. */
export function temaEfectivo(tema: Tema): 'claro' | 'oscuro' {
  if (tema !== 'auto') return tema
  return consultaOscuro()?.matches ? 'oscuro' : 'claro'
}

const COLOR_BARRA = { claro: '#1e1b4b', oscuro: '#0f0e1f' }

/**
 * Aplica el tema en `<html data-theme>` (lo usan los estilos de
 * index.css) y en el color de la barra del navegador/PWA.
 */
export function aplicarTema(tema: Tema = leerTema()): void {
  const efectivo = temaEfectivo(tema)
  document.documentElement.dataset.theme = efectivo === 'oscuro' ? 'dark' : 'light'
  document.documentElement.style.colorScheme = efectivo === 'oscuro' ? 'dark' : 'light'
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', COLOR_BARRA[efectivo])
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
