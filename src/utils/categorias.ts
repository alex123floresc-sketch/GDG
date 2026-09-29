import type { Categoria } from '../types'

/*
 * Subcategorías: una categoría puede tener `padreId` (un solo nivel). En los
 * resúmenes lo de una subcategoría se suma a su categoría madre; en listas
 * se muestra "Madre › Sub".
 */

/** Id de la categoría madre (o la misma si es de primer nivel). */
export function idRaiz(id: string, porId: Map<string, Categoria>): string {
  const padre = porId.get(id)?.padreId
  return padre && porId.has(padre) ? padre : id
}

/** "Alimentación › Delivery" (o solo el nombre si no es subcategoría). */
export function nombreCompleto(categoria: Categoria | undefined, porId: Map<string, Categoria>): string {
  if (!categoria) return 'Sin categoría'
  const padre = categoria.padreId ? porId.get(categoria.padreId) : undefined
  return padre ? `${padre.nombre} › ${categoria.nombre}` : categoria.nombre
}

/** Subcategorías de una categoría, por nombre. */
export function hijasDe(id: string, categorias: Categoria[]): Categoria[] {
  return categorias
    .filter((c) => c.padreId === id)
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
}

/** Categorías de primer nivel (sin madre, o con una madre que ya no existe). */
export function categoriasRaiz(categorias: Categoria[]): Categoria[] {
  const ids = new Set(categorias.map((c) => c.id))
  return categorias.filter((c) => !c.padreId || !ids.has(c.padreId))
}

/**
 * Ordena para listas planas: cada madre seguida de sus subcategorías
 * (útil en <select>). Devuelve pares [categoría, esSub].
 */
export function ordenJerarquico(categorias: Categoria[]): [Categoria, boolean][] {
  const resultado: [Categoria, boolean][] = []
  const raices = categoriasRaiz(categorias).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
  for (const raiz of raices) {
    resultado.push([raiz, false])
    for (const hija of hijasDe(raiz.id, categorias)) resultado.push([hija, true])
  }
  return resultado
}
