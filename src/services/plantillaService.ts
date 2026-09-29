import { db } from '../db/database'
import type { NuevaPlantilla, Plantilla, Transaccion } from '../types'
import { normalizarEtiquetas } from '../utils/etiquetas'
import { leerTipoCambio } from '../utils/preferencias'
import { marcaCambio, registrarBorrado } from './sincronizable'
import { crearTransaccion } from './transaccionService'

function validar(datos: NuevaPlantilla): NuevaPlantilla {
  const nombre = datos.nombre.trim()
  if (!nombre) throw new Error('Ponle un nombre a la plantilla (ej. Café, Pasaje).')
  if (datos.monto !== undefined && (!Number.isFinite(datos.monto) || datos.monto <= 0)) {
    throw new Error('El monto debe ser mayor a 0 (o déjalo vacío para escribirlo cada vez).')
  }
  if (!datos.categoriaId) throw new Error('Elige una categoría.')
  if (!datos.cuentaId) throw new Error('Elige una cuenta.')
  const etiquetas = datos.etiquetas?.length ? normalizarEtiquetas(datos.etiquetas) : undefined
  return {
    ...datos,
    nombre,
    monto: datos.monto !== undefined ? Math.round(datos.monto * 100) / 100 : undefined,
    moneda: datos.moneda === 'USD' ? 'USD' : undefined,
    concepto: datos.concepto?.trim() || undefined,
    etiquetas: etiquetas?.length ? etiquetas : undefined,
  }
}

export async function crearPlantilla(datos: NuevaPlantilla, usuarioId: string): Promise<Plantilla> {
  const ultimo = await db.plantillas.where('usuarioId').equals(usuarioId).count()
  const plantilla: Plantilla = {
    orden: ultimo,
    ...validar(datos),
    id: crypto.randomUUID(),
    usuarioId,
    ...marcaCambio(),
  }
  await db.plantillas.add(plantilla)
  return plantilla
}

export async function actualizarPlantilla(id: string, datos: NuevaPlantilla): Promise<void> {
  const actual = await db.plantillas.get(id)
  if (!actual) throw new Error('La plantilla ya no existe.')
  await db.plantillas.put({ id, usuarioId: actual.usuarioId, ...validar(datos), ...marcaCambio() })
}

export async function eliminarPlantilla(plantilla: Plantilla): Promise<void> {
  await db.transaction('rw', db.plantillas, db.eliminacionesPendientes, async () => {
    await db.plantillas.delete(plantilla.id)
    await registrarBorrado('plantillas', plantilla.usuarioId, [plantilla.id])
  })
}

/** Guarda el nuevo orden (el de la lista recibida). */
export async function reordenarPlantillas(plantillas: Plantilla[]): Promise<void> {
  await db.transaction('rw', db.plantillas, async () => {
    for (const [i, p] of plantillas.entries()) {
      if (p.orden !== i) await db.plantillas.update(p.id, { orden: i, ...marcaCambio() })
    }
  })
}

/**
 * Registra el movimiento de una plantilla con monto fijo, hoy (registro de
 * un toque). Si es en dólares usa el último tipo de cambio guardado.
 */
export async function registrarDesdePlantilla(plantilla: Plantilla, usuarioId: string): Promise<Transaccion> {
  if (plantilla.monto === undefined) throw new Error('Esta plantilla no tiene monto fijo.')
  const tipoCambio = plantilla.moneda === 'USD' ? leerTipoCambio() : undefined
  return crearTransaccion(
    {
      tipo: plantilla.tipo,
      monto: tipoCambio ? Math.round(plantilla.monto * tipoCambio * 100) / 100 : plantilla.monto,
      moneda: tipoCambio ? 'USD' : undefined,
      montoOriginal: tipoCambio ? plantilla.monto : undefined,
      tipoCambio,
      categoriaId: plantilla.categoriaId,
      cuentaId: plantilla.cuentaId,
      concepto: plantilla.concepto ?? plantilla.nombre,
      etiquetas: plantilla.etiquetas,
      fecha: new Date(),
      origen: 'manual',
    },
    usuarioId,
  )
}
