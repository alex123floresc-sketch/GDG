/**
 * Evalúa sumas y restas simples del teclado numérico ("12.50+30-5").
 * Solo admite números con hasta 2 decimales y los operadores + y -; nunca
 * usa eval(). Devuelve null si la expresión está incompleta o no es válida.
 */
export function evaluarExpresion(texto: string): number | null {
  const limpio = texto.replace(/\s/g, '').replace(/,/g, '.')
  if (!limpio) return null
  if (!/^\d*\.?\d*([+-]\d*\.?\d*)*$/.test(limpio)) return null
  // Operador colgando ("12+"): la expresión aún no está completa.
  if (/[+-]$/.test(limpio)) return null

  const partes = limpio.match(/[+-]?[^+-]+/g)
  if (!partes) return null

  let total = 0
  for (const parte of partes) {
    const numero = Number(parte)
    if (!Number.isFinite(numero) || parte === '+' || parte === '-' || parte === '.') return null
    total += numero
  }
  return Math.round(total * 100) / 100
}

/** ¿El texto tiene alguna operación (para mostrar el resultado aparte)? */
export function tieneOperacion(texto: string): boolean {
  return /\d[+-]/.test(texto)
}
