import { db } from '../db/database'
import type { NuevaRegla, Regla } from '../types'
import { normalizarEtiquetas } from '../utils/etiquetas'
import { normalizarTexto } from '../utils/reglas'
import { marcaCambio, registrarBorrado } from './sincronizable'

async function validar(datos: NuevaRegla, usuarioId: string, excluirId?: string): Promise<NuevaRegla> {
  const patron = datos.patron.trim().replace(/\s+/g, ' ')
  if (normalizarTexto(patron).length < 2) throw new Error('Escribe una palabra clave de al menos 2 letras.')
  if (!datos.categoriaId) throw new Error('Elige la categoría que se asignará.')

  const repetida = await db.reglas
    .where('usuarioId')
    .equals(usuarioId)
    .filter(
      (r) =>
        r.id !== excluirId &&
        normalizarTexto(r.patron) === normalizarTexto(patron) &&
        (r.tipo ?? null) === (datos.tipo ?? null),
    )
    .first()
  if (repetida) throw new Error(`Ya tienes una regla para "${repetida.patron}".`)

  const etiquetas = datos.etiquetas?.length ? normalizarEtiquetas(datos.etiquetas) : undefined
  return {
    patron,
    categoriaId: datos.categoriaId,
    tipo: datos.tipo,
    cuentaId: datos.cuentaId || undefined,
    etiquetas: etiquetas?.length ? etiquetas : undefined,
  }
}

export async function crearRegla(datos: NuevaRegla, usuarioId: string): Promise<Regla> {
  const regla: Regla = { ...(await validar(datos, usuarioId)), id: crypto.randomUUID(), usuarioId, ...marcaCambio() }
  await db.reglas.add(regla)
  return regla
}

export async function actualizarRegla(id: string, datos: NuevaRegla, usuarioId: string): Promise<void> {
  const actual = await db.reglas.get(id)
  if (!actual) throw new Error('La regla ya no existe.')
  await db.reglas.put({ id, usuarioId: actual.usuarioId, ...(await validar(datos, usuarioId, id)), ...marcaCambio() })
}

export async function eliminarRegla(regla: Regla): Promise<void> {
  await db.transaction('rw', db.reglas, db.eliminacionesPendientes, async () => {
    await db.reglas.delete(regla.id)
    await registrarBorrado('reglas', regla.usuarioId, [regla.id])
  })
}

/**
 * Aplica una regla a movimientos ya registrados (los que el usuario eligió
 * en la vista previa): les cambia la categoría y, si la regla lo indica,
 * agrega sus etiquetas. Devuelve cuántos cambió.
 */
export async function aplicarReglaAExistentes(regla: Regla, ids: string[]): Promise<number> {
  if (ids.length === 0) return 0
  const ahora = new Date()
  return db.transacciones
    .where('id')
    .anyOf(ids)
    .modify((t) => {
      t.categoriaId = regla.categoriaId
      if (regla.etiquetas?.length) t.etiquetas = normalizarEtiquetas([...(t.etiquetas ?? []), ...regla.etiquetas])
      t.sincronizado = false
      t.fechaActualizacion = ahora
    })
}
