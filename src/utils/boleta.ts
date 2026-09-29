/*
 * Interpreta el texto (OCR) de una boleta o factura peruana: total, fecha,
 * comercio y RUC. Los reportes de OCR traen errores (O por 0, comas por
 * puntos), así que todo es tolerante y el usuario revisa antes de guardar.
 */

export interface DatosBoleta {
  total?: number
  fecha?: Date
  comercio?: string
  ruc?: string
}

const RE_IMPORTE = /(\d{1,3}(?:[.,\s]\d{3})*[.,]\d{2}|\d+[.,]\d{2})(?!\d)/g

/** "1,234.50" / "1.234,50" / "12,50" → número. */
export function importeDeTexto(texto: string): number | null {
  let t = texto.replace(/\s/g, '')
  const coma = t.lastIndexOf(',')
  const punto = t.lastIndexOf('.')
  if (coma > punto) t = t.replace(/\./g, '').replace(',', '.')
  else t = t.replace(/,/g, '')
  const n = Number(t)
  return Number.isFinite(n) && n > 0 ? n : null
}

/** Corrige confusiones típicas del OCR dentro de los números (O→0, l→1, S→5). */
function corregirDigitos(linea: string): string {
  return linea.replace(/(?<=[\d.,\s])[Oo](?=[\d.,])|(?<=\d)[Oo]\b/g, '0').replace(/(?<=\d)[lI](?=\d)/g, '1')
}

export function interpretarBoleta(texto: string): DatosBoleta {
  const lineas = texto
    .split(/\r?\n/)
    .map((l) => corregirDigitos(l.trim()))
    .filter(Boolean)
  const datos: DatosBoleta = {}

  // Total: la línea que dice TOTAL (preferir "importe total"/"total a pagar"
  // y descartar "sub total", "op. gravada", "IGV", "vuelto", "total dscto").
  const candidatos: { valor: number; peso: number }[] = []
  for (const [i, linea] of lineas.entries()) {
    const baja = linea.toLowerCase()
    if (!/total|importe|a pagar|monto/.test(baja)) continue
    if (/sub\s*-?\s*total|gravad|igv|vuelto|descuento|dscto|exonerad|inafect|cantidad|items?\b/.test(baja)) continue
    const importes = [...linea.matchAll(RE_IMPORTE)].map((m) => importeDeTexto(m[1])).filter((n): n is number => n !== null)
    // A veces el monto está en la línea siguiente.
    if (importes.length === 0 && lineas[i + 1]) {
      importes.push(...[...lineas[i + 1].matchAll(RE_IMPORTE)].map((m) => importeDeTexto(m[1])).filter((n): n is number => n !== null))
    }
    if (importes.length === 0) continue
    const peso = /importe total|total a pagar|total s\/|total venta|total:/.test(baja) ? 3 : /^total\b/.test(baja) ? 2 : 1
    candidatos.push({ valor: Math.max(...importes), peso })
  }
  if (candidatos.length > 0) {
    candidatos.sort((a, b) => b.peso - a.peso || b.valor - a.valor)
    datos.total = candidatos[0].valor
  } else {
    // Sin la palabra TOTAL: el mayor importe con "S/".
    const conSoles = texto.match(/s\/\.?\s*\d[\d.,]*/gi) ?? []
    const valores = conSoles.map((m) => importeDeTexto(m.replace(/s\/\.?/i, ''))).filter((n): n is number => n !== null)
    if (valores.length) datos.total = Math.max(...valores)
  }

  // Fecha: dd/mm/aaaa, dd-mm-aaaa o aaaa-mm-dd.
  const fecha = /(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})/.exec(texto) ?? null
  const iso = /(\d{4})-(\d{2})-(\d{2})/.exec(texto)
  if (iso) datos.fecha = new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]), 12)
  else if (fecha) {
    const anio = fecha[3].length === 2 ? 2000 + Number(fecha[3]) : Number(fecha[3])
    const f = new Date(anio, Number(fecha[2]) - 1, Number(fecha[1]), 12)
    if (!Number.isNaN(f.getTime()) && f.getMonth() === Number(fecha[2]) - 1 && anio > 2000) datos.fecha = f
  }

  const ruc = /\b(10|15|17|20)\d{9}\b/.exec(texto.replace(/\s/g, ' '))
  if (ruc) datos.ruc = ruc[0]

  // Comercio: la primera línea "de texto" (sin números largos ni palabras de trámite).
  datos.comercio = lineas
    .slice(0, 8)
    .find(
      (l) =>
        /[a-záéíóúñ]{3}/i.test(l) &&
        !/ruc|boleta|factura|electr|ticket|fecha|direcc|av\.|jr\.|calle|telf|tel[eé]f|www|http|@/i.test(l) &&
        !/\d{5,}/.test(l) &&
        l.replace(/[^a-záéíóúñ]/gi, '').length >= 4,
    )
    ?.replace(/\s+/g, ' ')
    .slice(0, 60)
  return datos
}
