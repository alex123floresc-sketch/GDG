import type { Table } from 'dexie'
import { db } from '../db/database'
import type { TablaSincronizable } from '../types'

/*
 * Respaldo de todos los datos del usuario en un archivo JSON, y su
 * restauración. Complementa a Supabase: sirve para guardar una copia
 * propia, pasar los datos a otra cuenta o recuperarlos tras borrar la base.
 */

const FORMATO = 'gestor-gastos-respaldo'
const VERSION = 1

const TABLAS: TablaSincronizable[] = [
  'categorias',
  'cuentas',
  'transacciones',
  'presupuestos',
  'metas',
  'deudas',
  'recurrentes',
  'chanchitos',
]

type Fila = Record<string, unknown> & { id: string; usuarioId: string }

const tabla = (nombre: TablaSincronizable) => db[nombre] as unknown as Table<Fila, string>

export interface Respaldo {
  formato: typeof FORMATO
  version: number
  exportado: string
  usuarioId: string
  email?: string
  datos: Partial<Record<TablaSincronizable, Fila[]>>
}

export interface ResumenRespaldo {
  exportado: Date
  email?: string
  mismoUsuario: boolean
  conteos: Partial<Record<TablaSincronizable, number>>
}

/** Reúne todos los datos del usuario en un objeto de respaldo. */
export async function generarRespaldo(usuarioId: string, email?: string): Promise<Respaldo> {
  const datos: Respaldo['datos'] = {}
  for (const nombre of TABLAS) {
    const filas = await tabla(nombre).where('usuarioId').equals(usuarioId).toArray()
    // `sincronizado` es estado de este dispositivo, no un dato.
    datos[nombre] = filas.map(({ sincronizado: _s, ...resto }) => resto as Fila)
  }
  return { formato: FORMATO, version: VERSION, exportado: new Date().toISOString(), usuarioId, email, datos }
}

/** Genera el respaldo y lo descarga como archivo .json. Devuelve cuántos registros tiene. */
export async function descargarRespaldo(usuarioId: string, email?: string): Promise<number> {
  const respaldo = await generarRespaldo(usuarioId, email)
  const total = Object.values(respaldo.datos).reduce((s, filas) => s + (filas?.length ?? 0), 0)

  const blob = new Blob([JSON.stringify(respaldo)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const enlace = document.createElement('a')
  enlace.href = url
  enlace.download = `respaldo-gestor-gastos-${new Date().toISOString().slice(0, 10)}.json`
  document.body.appendChild(enlace)
  enlace.click()
  enlace.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
  return total
}

// Las fechas viajan como texto ISO; al leer se vuelven Date.
const ES_FECHA = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/
const revivir = (_clave: string, valor: unknown) =>
  typeof valor === 'string' && ES_FECHA.test(valor) ? new Date(valor) : valor

/** Lee y valida un archivo de respaldo (sin guardar nada todavía). */
export async function leerRespaldo(archivo: File, usuarioId: string): Promise<{ respaldo: Respaldo; resumen: ResumenRespaldo }> {
  let respaldo: Respaldo
  try {
    respaldo = JSON.parse(await archivo.text(), revivir) as Respaldo
  } catch {
    throw new Error('El archivo no es un respaldo válido (no se pudo leer).')
  }
  if (respaldo?.formato !== FORMATO || typeof respaldo.datos !== 'object') {
    throw new Error('El archivo no es un respaldo del Gestor de Gastos.')
  }
  if (respaldo.version > VERSION) {
    throw new Error('El respaldo es de una versión más nueva de la app. Actualízala e inténtalo de nuevo.')
  }

  const conteos: ResumenRespaldo['conteos'] = {}
  for (const nombre of TABLAS) {
    const filas = respaldo.datos[nombre]
    if (filas !== undefined && !Array.isArray(filas)) throw new Error('El respaldo está dañado.')
    if (filas?.length) conteos[nombre] = filas.length
  }

  return {
    respaldo,
    resumen: {
      exportado: new Date(respaldo.exportado),
      email: respaldo.email,
      mismoUsuario: respaldo.usuarioId === usuarioId,
      conteos,
    },
  }
}

/** Campos que apuntan a otra fila (se re-mapean al cambiar de usuario). */
const REFERENCIAS = ['cuentaId', 'categoriaId', 'recurrenteId'] as const

/**
 * Restaura un respaldo en este dispositivo (luego se sube a Supabase):
 * agrega lo que falta y reemplaza lo que existe con el mismo id. No borra
 * nada que no esté en el respaldo.
 *
 * Si el respaldo es de otro usuario (p. ej. una cuenta nueva tras borrar
 * la base) todos los ids se renuevan y sus referencias se re-apuntan, para
 * no chocar con las filas del otro usuario en Supabase.
 */
export async function restaurarRespaldo(respaldo: Respaldo, usuarioId: string): Promise<number> {
  const mismoUsuario = respaldo.usuarioId === usuarioId
  const nuevosIds = new Map<string, string>()
  const idDe = (id: string) => {
    if (mismoUsuario || !id) return id
    if (!nuevosIds.has(id)) nuevosIds.set(id, crypto.randomUUID())
    return nuevosIds.get(id)!
  }

  const ahora = new Date()
  const porTabla = TABLAS.map((nombre) => {
    const filas = (respaldo.datos[nombre] ?? []).map((original) => {
      const fila: Fila = { ...original, id: idDe(original.id), usuarioId, sincronizado: false, fechaActualizacion: ahora }
      for (const campo of REFERENCIAS) {
        if (typeof fila[campo] === 'string') fila[campo] = idDe(fila[campo] as string)
      }
      if (typeof fila.transferenciaId === 'string') fila.transferenciaId = idDe(fila.transferenciaId)
      return fila
    })
    return { nombre, filas }
  })

  const tablas = [...TABLAS.map(tabla), db.eliminacionesPendientes]
  let total = 0
  await db.transaction('rw', tablas, async () => {
    for (const { nombre, filas } of porTabla) {
      if (filas.length === 0) continue
      await tabla(nombre).bulkPut(filas)
      total += filas.length
    }
    // Si alguna estaba por borrarse en Supabase, ya no.
    const restaurados = new Set(porTabla.flatMap((t) => t.filas.map((f) => f.id)))
    await db.eliminacionesPendientes
      .where('usuarioId')
      .equals(usuarioId)
      .filter((e) => restaurados.has(e.registroId))
      .delete()
  })
  return total
}
