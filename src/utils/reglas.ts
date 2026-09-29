import type { Regla, TipoTransaccion, Transaccion } from '../types'

/** Texto comparable: minúsculas, sin tildes ni espacios repetidos. */
export function normalizarTexto(texto: string): string {
  return texto
    .toLocaleLowerCase('es')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Regla que corresponde a un concepto: la de patrón más largo (la más
 * específica: "uber eats" gana a "uber"). `undefined` si ninguna aplica.
 */
export function reglaPara(
  concepto: string | undefined,
  tipo: TipoTransaccion,
  reglas: Regla[],
): Regla | undefined {
  if (!concepto) return undefined
  const texto = normalizarTexto(concepto)
  if (!texto) return undefined

  let mejor: Regla | undefined
  for (const regla of reglas) {
    if (regla.tipo && regla.tipo !== tipo) continue
    const patron = normalizarTexto(regla.patron)
    if (!patron || !texto.includes(patron)) continue
    if (!mejor || patron.length > normalizarTexto(mejor.patron).length) mejor = regla
  }
  return mejor
}

/**
 * Movimientos existentes a los que una regla cambiaría la categoría (para
 * "aplicar a lo ya registrado"). No toca transferencias.
 */
export function afectadasPorRegla(regla: Regla, transacciones: Transaccion[], reglas: Regla[]): Transaccion[] {
  return transacciones.filter(
    (t) =>
      t.origen !== 'transferencia' &&
      t.categoriaId !== regla.categoriaId &&
      reglaPara(t.concepto, t.tipo, reglas)?.id === regla.id,
  )
}

/**
 * Palabra clave sugerida para crear una regla a partir de un concepto:
 * el concepto completo si es corto, si no sus dos primeras palabras.
 */
export function patronSugerido(concepto: string): string {
  const limpio = concepto.trim().replace(/\s+/g, ' ')
  if (limpio.length <= 24) return limpio
  return limpio.split(' ').slice(0, 2).join(' ')
}
