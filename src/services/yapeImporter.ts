import * as XLSX from 'xlsx'
import { db } from '../db/database'
import type {
  FilaYapeParseada,
  ResultadoImportacionYape,
  ResultadoParseoYape,
  Transaccion,
  TipoTransaccion,
} from '../types'

const RE_FECHA = /fecha/i
const RE_MONTO = /monto|importe/i
const RE_CONCEPTO = /nombre|descripci|detalle|origen|destino|contacto/i
const RE_OPERACION = /operaci/i
const RE_TIPO = /^tipo/i

const RE_TEXTO_INGRESO = /recib|entrante|ingres|cobr/i
const RE_TEXTO_GASTO = /envi|salient|gast|pagast/i

/**
 * Busca, entre las primeras filas del archivo, la fila de encabezados de la
 * tabla de transacciones. Los reportes de Yape suelen traer unas filas de
 * resumen antes de la tabla real, así que no se asume que sea la fila 0.
 */
function encontrarFilaEncabezado(filas: unknown[][]): number {
  const limite = Math.min(filas.length, 15)

  for (let i = 0; i < limite; i++) {
    const celdas = (filas[i] ?? []).map((c) => String(c ?? '').trim())
    const tieneFecha = celdas.some((c) => RE_FECHA.test(c))
    const tieneMonto = celdas.some((c) => RE_MONTO.test(c))

    if (tieneFecha && tieneMonto) return i
  }

  return -1
}

function parsearMonto(valor: unknown): number | null {
  if (typeof valor === 'number') {
    return Number.isFinite(valor) ? valor : null
  }

  if (typeof valor === 'string') {
    const limpio = valor.replace(/[^\d.,-]/g, '').replace(/,/g, '')
    if (!limpio) return null
    const numero = Number(limpio)
    return Number.isFinite(numero) ? numero : null
  }

  return null
}

function parsearFecha(valor: unknown): Date | null {
  if (valor instanceof Date) {
    return Number.isNaN(valor.getTime()) ? null : valor
  }

  if (typeof valor === 'string') {
    const texto = valor.trim()

    // dd/mm/yyyy[ hh:mm[:ss]]
    const coincidencia = texto.match(
      /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})[ ,T]*(\d{1,2}:\d{2}(:\d{2})?)?/,
    )

    if (coincidencia) {
      const [, dia, mes, anio, hora] = coincidencia
      const anioCompleto = anio.length === 2 ? 2000 + Number(anio) : Number(anio)
      const fechaTexto = `${anioCompleto}-${mes.padStart(2, '0')}-${dia.padStart(2, '0')}T${
        hora ?? '00:00:00'
      }`
      const fecha = new Date(fechaTexto)
      if (!Number.isNaN(fecha.getTime())) return fecha
    }

    const fechaDirecta = new Date(texto)
    if (!Number.isNaN(fechaDirecta.getTime())) return fechaDirecta
  }

  return null
}

function inferirTipo(montoBruto: number, textoTipo: string | undefined): TipoTransaccion {
  if (textoTipo) {
    if (RE_TEXTO_INGRESO.test(textoTipo)) return 'ingreso'
    if (RE_TEXTO_GASTO.test(textoTipo)) return 'gasto'
  }

  return montoBruto >= 0 ? 'ingreso' : 'gasto'
}

/**
 * Interpreta las filas crudas (formato "array de arrays", como devuelve
 * `sheet_to_json` con `header: 1`) de un reporte de Yape.
 */
export function parsearFilasYape(filasCrudas: unknown[][]): ResultadoParseoYape {
  const idxEncabezado = encontrarFilaEncabezado(filasCrudas)

  if (idxEncabezado === -1) {
    throw new Error(
      'No se encontró una tabla de transacciones reconocible en el archivo. ' +
        'Verifica que sea un reporte de Yape (ReporteTransacciones*.xlsx).',
    )
  }

  const encabezados = (filasCrudas[idxEncabezado] ?? []).map((c) =>
    String(c ?? '').trim(),
  )

  const colFecha = encabezados.findIndex((h) => RE_FECHA.test(h))
  const colMonto = encabezados.findIndex((h) => RE_MONTO.test(h))
  const colConcepto = encabezados.findIndex((h) => RE_CONCEPTO.test(h))
  const colOperacion = encabezados.findIndex((h) => RE_OPERACION.test(h))
  const colTipo = encabezados.findIndex((h) => RE_TIPO.test(h))

  if (colFecha === -1 || colMonto === -1) {
    throw new Error(
      'No se pudieron identificar las columnas de fecha y monto en el archivo.',
    )
  }

  const filas: FilaYapeParseada[] = []
  let erroresFilas = 0

  for (let i = idxEncabezado + 1; i < filasCrudas.length; i++) {
    const fila = filasCrudas[i]

    if (!fila || fila.every((c) => c === '' || c == null)) continue

    const fecha = parsearFecha(fila[colFecha])
    const montoBruto = parsearMonto(fila[colMonto])
    const nroOperacion =
      colOperacion !== -1 ? String(fila[colOperacion] ?? '').trim() : ''

    if (!fecha || montoBruto === null || !nroOperacion) {
      erroresFilas++
      continue
    }

    filas.push({
      fecha,
      concepto: colConcepto !== -1 ? String(fila[colConcepto] ?? '').trim() : '',
      nroOperacion,
      monto: Math.abs(montoBruto),
      tipo: inferirTipo(
        montoBruto,
        colTipo !== -1 ? String(fila[colTipo] ?? '') : undefined,
      ),
    })
  }

  return { filas, erroresFilas }
}

/**
 * Lee un archivo .xlsx/.xls de Yape (File del input/drag&drop) y devuelve
 * las filas ya interpretadas, listas para previsualizar.
 */
export async function leerArchivoExcelYape(
  archivo: File,
): Promise<ResultadoParseoYape> {
  const buffer = await archivo.arrayBuffer()
  const libro = XLSX.read(buffer, { cellDates: true })
  const nombreHoja = libro.SheetNames[0]

  if (!nombreHoja) {
    throw new Error('El archivo Excel no tiene hojas con datos.')
  }

  const hoja = libro.Sheets[nombreHoja]
  const filasCrudas = XLSX.utils.sheet_to_json<unknown[]>(hoja, {
    header: 1,
    raw: true,
    defval: '',
  })

  return parsearFilasYape(filasCrudas)
}

/**
 * Inserta en Dexie las filas ya parseadas, aplicando la validación
 * anti-duplicados: si ya existe una transacción con el mismo nroOperacion
 * para este usuario (o se repite dentro del propio archivo), se ignora.
 */
export async function importarFilasYape(
  filas: FilaYapeParseada[],
  usuarioId: string,
  cuentaId: string,
  categoriaId: string,
): Promise<ResultadoImportacionYape> {
  const nuevas: Transaccion[] = []
  const nrosEnEsteLote = new Set<string>()
  let duplicadas = 0

  for (const fila of filas) {
    if (nrosEnEsteLote.has(fila.nroOperacion)) {
      duplicadas++
      continue
    }

    const yaExiste = await db.transacciones
      .where('[usuarioId+nroOperacion]')
      .equals([usuarioId, fila.nroOperacion])
      .count()

    if (yaExiste > 0) {
      duplicadas++
      continue
    }

    nrosEnEsteLote.add(fila.nroOperacion)

    nuevas.push({
      id: crypto.randomUUID(),
      usuarioId,
      cuentaId,
      categoriaId,
      monto: fila.monto,
      tipo: fila.tipo,
      fecha: fila.fecha,
      concepto: fila.concepto || undefined,
      nroOperacion: fila.nroOperacion,
      origen: 'yape',
      sincronizado: false,
      fechaActualizacion: new Date(),
    })
  }

  if (nuevas.length > 0) {
    await db.transacciones.bulkAdd(nuevas)
  }

  return {
    total: filas.length,
    nuevas: nuevas.length,
    duplicadas,
  }
}
