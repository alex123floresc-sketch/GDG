import type { Categoria, Cuenta, Moneda, Regla, TipoTransaccion } from '../types'
import { normalizarTexto, reglaPara } from './reglas'

/*
 * Convierte una frase ("gasté 25 soles en almuerzo con yape", o el texto
 * de una notificación de Yape que se compartió a la app) en los datos de
 * un movimiento. Todo es heurístico: lo que no se entiende queda vacío y
 * el usuario lo completa en el formulario.
 */

export interface Interpretacion {
  tipo?: TipoTransaccion
  monto?: number
  moneda?: Moneda
  concepto?: string
  categoriaId?: string
  cuentaId?: string
  fecha?: Date
}

const UNIDADES: Record<string, number> = {
  cero: 0, un: 1, uno: 1, una: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9,
  diez: 10, once: 11, doce: 12, trece: 13, catorce: 14, quince: 15, dieciseis: 16, diecisiete: 17,
  dieciocho: 18, diecinueve: 19, veinte: 20, veintiun: 21, veintiuno: 21, veintidos: 22, veintitres: 23,
  veinticuatro: 24, veinticinco: 25, veintiseis: 26, veintisiete: 27, veintiocho: 28, veintinueve: 29,
  treinta: 30, cuarenta: 40, cincuenta: 50, sesenta: 60, setenta: 70, ochenta: 80, noventa: 90,
  cien: 100, ciento: 100, doscientos: 200, trescientos: 300, cuatrocientos: 400, quinientos: 500,
  seiscientos: 600, setecientos: 700, ochocientos: 800, novecientos: 900,
}

/** "mil quinientos veinte" → 1520 (null si no hay número en palabras). */
export function numeroEnPalabras(texto: string): number | null {
  const palabras = normalizarTexto(texto).split(/[\s-]+/)
  let total = 0
  let actual = 0
  let hubo = false
  for (const p of palabras) {
    if (p === 'y') continue
    if (p in UNIDADES) {
      actual += UNIDADES[p]
      hubo = true
    } else if (p === 'mil') {
      total += (actual || 1) * 1000
      actual = 0
      hubo = true
    } else if (hubo) {
      break
    }
  }
  return hubo ? total + actual : null
}

const RE_MONTO = /(?:s\/\.?|us\$|\$)?\s*(\d{1,3}(?:[ ,]\d{3})+(?:\.\d{1,2})?|\d+(?:[.,]\d{1,2})?)(?:\s*con\s*(\d{1,2}))?/

/** Monto de la frase: "25", "25.50", "25 con 50", "1,200", "veinticinco". */
export function montoDeTexto(texto: string): number | undefined {
  const m = RE_MONTO.exec(texto.toLowerCase())
  if (m) {
    let entero = m[1]
    // "1,200" o "1 200" = miles; "25,50" = decimales.
    if (/^\d{1,3}([ ,]\d{3})+(\.\d{1,2})?$/.test(entero)) entero = entero.replace(/[ ,]/g, '')
    else entero = entero.replace(',', '.')
    const valor = Number(entero) + (m[2] ? Number(m[2].padEnd(2, '0')) / 100 : 0)
    if (Number.isFinite(valor) && valor > 0) return Math.round(valor * 100) / 100
  }
  const enPalabras = numeroEnPalabras(texto.replace(/.*?(gaste|pague|compre|cobre|recibi|gane|me pagaron)\s+/, ''))
  return enPalabras && enPalabras > 0 ? enPalabras : undefined
}

const RE_INGRESO = /\b(me pagaron|me pago|cobre|recibi|gane|ingreso|sueldo|salario|me yapearon|te yapeo|te plineo|me depositaron|me transfirieron|me devolvieron)\b/
const RE_GASTO = /\b(gaste|pague|compre|me costo|yapeaste|plineaste|pagaste|gasto)\b/

/** Palabras clave → patrón del nombre de categoría que suele corresponder. */
const PISTAS_CATEGORIA: [RegExp, RegExp][] = [
  [/almuerzo|desayuno|cena|comida|menu|pollo|pizza|hamburguesa|chifa|cafe|restaurante|mercado|supermercado|bodega|pan\b/, /aliment|comida|restaur|super/],
  [/taxi|uber|didi|cabify|indrive|pasaje|micro|bus|combi|metro|gasolina|combustible|peaje|estacionamiento/, /transp|movilidad/],
  [/alquiler|luz|agua|internet|cable|gas\b|telefono|celular|recibo/, /vivienda|servicio|casa|hogar/],
  [/farmacia|medicina|pastilla|doctor|medico|clinica|dentista|consulta/, /salud|medic/],
  [/cine|netflix|spotify|juego|concierto|fiesta|salida|trago|cerveza/, /entreten|ocio|diversion/],
  [/colegio|universidad|curso|libro|pension|matricula/, /educa|estudio/],
  [/ropa|zapatilla|polo|pantalon|vestido/, /ropa|vestim|compras/],
  [/sueldo|salario|quincena/, /salario|sueldo/],
]

interface DatosDictado {
  categorias: Categoria[]
  cuentas: Cuenta[]
  reglas: Regla[]
  hoy?: Date
}

function limpiarConcepto(texto: string): string {
  const limpio = texto
    .replace(RE_MONTO, ' ')
    .replace(/\b(soles?|dolares?|lucas?|mangos?|s\/\.?|us\$)\b/g, ' ')
    .replace(/\b(hoy|ayer|anteayer|antier)\b/g, ' ')
    .replace(/\b(gaste|pague|compre|me costo|cobre|recibi|gane|me pagaron|me pago|me yapearon|me depositaron|me transfirieron|registra|registrar|anota|un gasto|un ingreso|de|del|en|el|la|los|las|un|una|por|para|con|a|al|y)\b/g, ' ')
    .replace(/[¡!.,:;]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return limpio ? limpio.charAt(0).toUpperCase() + limpio.slice(1) : ''
}

export function interpretarTexto(texto: string, { categorias, cuentas, reglas, hoy = new Date() }: DatosDictado): Interpretacion {
  const original = texto.trim()
  const t = normalizarTexto(original)
  const r: Interpretacion = {}
  if (!t) return r

  r.monto = montoDeTexto(t)
  if (/\b(dolar|dolares|us\$)|\$/.test(t) && !/s\/\s*\d/.test(t)) r.moneda = 'USD'
  r.tipo = RE_INGRESO.test(t) && !RE_GASTO.test(t) ? 'ingreso' : 'gasto'

  if (/\banteayer|antier\b/.test(t)) r.fecha = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() - 2, 12)
  else if (/\bayer\b/.test(t)) r.fecha = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() - 1, 12)

  // Notificaciones de Yape/Plin: "Yapeaste S/ 25 a Juan Pérez", "Juan te yapeó S/ 20".
  let concepto: string | undefined
  const yapeaste = /(?:yapeaste|plineaste|pagaste)\s+(?:s\/\.?\s*)?[\d.,]+\s+a\s+(.+)/i.exec(original)
  const teYapeo = /^(.+?)\s+te\s+(?:yape[oó]|pline[oó]|envi[oó])/i.exec(original)
  if (yapeaste) concepto = yapeaste[1].replace(/[!.]+$/, '').trim()
  else if (teYapeo) {
    concepto = teYapeo[1].replace(/^[¡!]+/, '').trim()
    r.tipo = 'ingreso'
  }

  // Cuenta: la que se nombra ("con yape", "en efectivo", "con la tarjeta").
  const nombradas = cuentas
    .filter((c) => c.tipo !== 'chanchito' && normalizarTexto(c.nombre).length >= 3 && t.includes(normalizarTexto(c.nombre)))
    .sort((a, b) => b.nombre.length - a.nombre.length)
  let cuenta: Cuenta | undefined = nombradas[0]
  if (!cuenta && /yape|yapea/.test(t)) cuenta = cuentas.find((c) => /yape/i.test(c.nombre))
  if (!cuenta && /plin|plinea/.test(t)) cuenta = cuentas.find((c) => /plin/i.test(c.nombre))
  if (!cuenta && /efectivo|cash/.test(t)) cuenta = cuentas.find((c) => c.tipo === 'efectivo')
  if (!cuenta && /tarjeta|credito/.test(t)) cuenta = cuentas.find((c) => c.tipo === 'tarjeta_credito')
  r.cuentaId = cuenta?.id

  // Concepto: lo que queda sin monto, verbos ni la cuenta.
  if (!concepto) {
    let resto = t
    if (cuenta) resto = resto.replace(normalizarTexto(cuenta.nombre), ' ')
    resto = resto.replace(/\b(yape|plin|efectivo|cash|tarjeta( de credito)?)\b/g, ' ')
    concepto = limpiarConcepto(resto)
  }
  r.concepto = concepto || undefined

  // Categoría: regla automática, nombre de una categoría o pista conocida.
  const delTipo = categorias.filter((c) => c.tipo === r.tipo || c.tipo === 'ambos')
  const regla = reglaPara(r.concepto ?? original, r.tipo, reglas) ?? reglaPara(original, r.tipo, reglas)
  if (regla && delTipo.some((c) => c.id === regla.categoriaId)) {
    r.categoriaId = regla.categoriaId
    if (!r.cuentaId && regla.cuentaId) r.cuentaId = regla.cuentaId
  } else {
    const porNombre = delTipo
      .filter((c) => {
        const n = normalizarTexto(c.nombre)
        return n.length >= 3 && (t.includes(n) || t.includes(n.slice(0, Math.max(4, n.length - 2))))
      })
      .sort((a, b) => b.nombre.length - a.nombre.length)[0]
    if (porNombre) r.categoriaId = porNombre.id
    else {
      for (const [pista, patron] of PISTAS_CATEGORIA) {
        if (!pista.test(t)) continue
        const c = delTipo.find((x) => patron.test(normalizarTexto(x.nombre)))
        if (c) {
          r.categoriaId = c.id
          break
        }
      }
    }
  }
  return r
}
