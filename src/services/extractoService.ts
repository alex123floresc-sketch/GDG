import * as XLSX from 'xlsx'
import { db } from '../db/database'
import type { Regla, Transaccion } from '../types'
import type { MovimientoExtracto } from '../utils/extracto'
import { reglaPara } from '../utils/reglas'
import { uuidDeterminista } from './sincronizable'

/*
 * Importar extractos bancarios (Más → Importar → Extracto del banco). Se
 * carga con React.lazy junto con xlsx (igual que el importador de Yape).
 * La interpretación está en utils/extracto.ts.
 */

/** Texto de un CSV: UTF-8 o, si no lo es, Windows-1252 (lo usual en Excel/bancos). */
async function textoDe(archivo: File): Promise<string> {
  const bytes = await archivo.arrayBuffer()
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    return new TextDecoder('windows-1252').decode(bytes)
  }
}

/** Lee un Excel o CSV y devuelve la primera hoja como filas de celdas. */
export async function leerArchivoExtracto(archivo: File): Promise<unknown[][]> {
  const esTexto = /\.(csv|txt|tsv)$/i.test(archivo.name)
  const libro = esTexto
    ? // CSV: sin convertir valores (las fechas/montos los interpreta utils/extracto).
      XLSX.read(await textoDe(archivo), { type: 'string', raw: true })
    : XLSX.read(await archivo.arrayBuffer(), { cellDates: true })
  const hoja = libro.Sheets[libro.SheetNames[0]]
  if (!hoja) throw new Error('El archivo no tiene hojas con datos.')
  return XLSX.utils.sheet_to_json<unknown[]>(hoja, { header: 1, raw: true, defval: '' })
}

/** Id estable: reimportar el mismo extracto no duplica nada. */
function idMovimiento(usuarioId: string, cuentaId: string, m: MovimientoExtracto): Promise<string> {
  return uuidDeterminista(`${usuarioId}|extracto|${cuentaId}|${m.clave}`)
}

const mismoDia = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()

export interface RevisionExtracto {
  /** Ya importados antes (mismo extracto o uno que se solapa). */
  yaImportados: Set<string>
  /** Parecen registrados a mano: misma cuenta, día, tipo y monto. */
  posiblesRepetidos: Set<string>
}

/** Marca qué movimientos ya están en la app (por clave). */
export async function revisarExtracto(
  movimientos: MovimientoExtracto[],
  usuarioId: string,
  cuentaId: string,
): Promise<RevisionExtracto> {
  const ids = await Promise.all(movimientos.map((m) => idMovimiento(usuarioId, cuentaId, m)))
  const existentes = await db.transacciones.bulkGet(ids)
  const deLaCuenta = await db.transacciones.where('cuentaId').equals(cuentaId).toArray()
  const importados = new Set(ids)
  const usados = new Set<string>()
  const yaImportados = new Set<string>()
  const posiblesRepetidos = new Set<string>()

  movimientos.forEach((m, i) => {
    if (existentes[i]) {
      yaImportados.add(m.clave)
      return
    }
    // Cada movimiento manual "tapa" a uno solo del extracto.
    const par = deLaCuenta.find(
      (t) =>
        !importados.has(t.id) &&
        !usados.has(t.id) &&
        t.tipo === m.tipo &&
        Math.abs(t.monto - m.monto) < 0.005 &&
        mismoDia(t.fecha, m.fecha),
    )
    if (par) {
      usados.add(par.id)
      posiblesRepetidos.add(m.clave)
    }
  })
  return { yaImportados, posiblesRepetidos }
}

export interface OpcionesImportacion {
  usuarioId: string
  cuentaId: string
  categoriaGasto: string
  categoriaIngreso: string
  reglas: Regla[]
}

/**
 * Registra los movimientos elegidos (la categoría de una regla automática
 * manda; la cuenta no: es la del extracto). Los que ya existen se omiten,
 * para no pisar lo que el usuario editó después de importarlos.
 */
export async function importarExtracto(movimientos: MovimientoExtracto[], o: OpcionesImportacion): Promise<number> {
  const ahora = new Date()
  const ids = await Promise.all(movimientos.map((m) => idMovimiento(o.usuarioId, o.cuentaId, m)))
  const existentes = await db.transacciones.bulkGet(ids)
  const nuevas: Transaccion[] = []
  for (const [i, m] of movimientos.entries()) {
    if (existentes[i] || nuevas.some((t) => t.id === ids[i])) continue
    const regla = reglaPara(m.concepto, m.tipo, o.reglas)
    nuevas.push({
      id: ids[i],
      usuarioId: o.usuarioId,
      cuentaId: o.cuentaId,
      categoriaId: regla?.categoriaId ?? (m.tipo === 'gasto' ? o.categoriaGasto : o.categoriaIngreso),
      etiquetas: regla?.etiquetas?.length ? regla.etiquetas : undefined,
      monto: m.monto,
      tipo: m.tipo,
      fecha: m.fecha,
      concepto: m.concepto || undefined,
      origen: 'manual',
      sincronizado: false,
      fechaActualizacion: ahora,
    })
  }
  const nuevosIds = new Set(nuevas.map((t) => t.id))
  await db.transaction('rw', db.transacciones, db.eliminacionesPendientes, async () => {
    // Reimportar algo que se había borrado: ya no hay que borrarlo en Supabase.
    await db.eliminacionesPendientes
      .where('usuarioId')
      .equals(o.usuarioId)
      .filter((e) => e.tabla === 'transacciones' && nuevosIds.has(e.registroId))
      .delete()
    await db.transacciones.bulkAdd(nuevas)
  })
  return nuevas.length
}
