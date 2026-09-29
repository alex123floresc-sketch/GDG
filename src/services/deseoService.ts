import { db } from '../db/database'
import type { Deseo, EstadoDeseo, NuevoDeseo } from '../types'
import { crearMeta } from './metaService'
import { marcaCambio, registrarBorrado } from './sincronizable'
import { crearTransaccion } from './transaccionService'

/** Días de la "regla de los 30 días" (esperar antes de comprar por impulso). */
export const DIAS_ESPERA = 30

function validar(datos: NuevoDeseo): NuevoDeseo {
  const nombre = datos.nombre.trim()
  if (!nombre) throw new Error('¿Qué quieres comprar?')
  if (!Number.isFinite(datos.precio) || datos.precio <= 0) throw new Error('El precio debe ser mayor a 0.')
  let enlace = datos.enlace?.trim() || undefined
  if (enlace && !/^https?:\/\//i.test(enlace)) enlace = `https://${enlace}`
  return {
    ...datos,
    nombre,
    precio: Math.round(datos.precio * 100) / 100,
    enlace,
    nota: datos.nota?.trim() || undefined,
  }
}

export async function crearDeseo(datos: NuevoDeseo, usuarioId: string): Promise<Deseo> {
  const deseo: Deseo = {
    ...validar(datos),
    id: crypto.randomUUID(),
    usuarioId,
    fechaCreacion: new Date(),
    estado: 'pendiente',
    ...marcaCambio(),
  }
  await db.deseos.add(deseo)
  return deseo
}

export async function actualizarDeseo(id: string, datos: NuevoDeseo): Promise<void> {
  const actual = await db.deseos.get(id)
  if (!actual) throw new Error('El deseo ya no existe.')
  const { esperarHasta: _e, enlace: _l, nota: _n, ...resto } = actual
  await db.deseos.put({ ...resto, ...validar(datos), ...marcaCambio() })
}

/** Cambia el estado (compré / ya no lo quiero / volver a la lista). */
export async function cambiarEstadoDeseo(deseo: Deseo, estado: EstadoDeseo): Promise<void> {
  const { fechaEstado: _f, ...resto } = deseo
  await db.deseos.put({ ...resto, estado, ...(estado === 'pendiente' ? {} : { fechaEstado: new Date() }), ...marcaCambio() })
}

/** "Lo compré": marca el deseo y registra el gasto. */
export async function comprarDeseo(
  deseo: Deseo,
  compra: { monto: number; cuentaId: string; categoriaId: string },
  usuarioId: string,
): Promise<void> {
  if (!Number.isFinite(compra.monto) || compra.monto <= 0) throw new Error('Ingresa cuánto pagaste.')
  await crearTransaccion(
    {
      tipo: 'gasto',
      monto: Math.round(compra.monto * 100) / 100,
      cuentaId: compra.cuentaId,
      categoriaId: compra.categoriaId,
      fecha: new Date(),
      concepto: deseo.nombre,
      origen: 'manual',
    },
    usuarioId,
  )
  await cambiarEstadoDeseo(deseo, 'comprado')
}

/** Crea una meta de ahorro por el precio del deseo y la vincula. */
export async function metaDesdeDeseo(deseo: Deseo, usuarioId: string): Promise<void> {
  const meta = await crearMeta(
    { nombre: deseo.nombre, montoObjetivo: deseo.precio, icono: 'gift', color: '#e87ba4' },
    usuarioId,
  )
  await db.deseos.update(deseo.id, { metaId: meta.id, ...marcaCambio() })
}

export async function eliminarDeseo(deseo: Deseo): Promise<void> {
  await db.transaction('rw', db.deseos, db.eliminacionesPendientes, async () => {
    await db.deseos.delete(deseo.id)
    await registrarBorrado('deseos', deseo.usuarioId, [deseo.id])
  })
}
