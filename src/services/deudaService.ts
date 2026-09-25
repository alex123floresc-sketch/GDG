import { db } from '../db/database'
import type { Deuda, NuevaDeuda } from '../types'
import { marcaCambio, registrarBorrado } from './sincronizable'

function validar(datos: NuevaDeuda): NuevaDeuda {
  const persona = datos.persona.trim()
  if (!persona) throw new Error('Indica con quién es la deuda.')
  if (!Number.isFinite(datos.monto) || datos.monto <= 0) {
    throw new Error('El monto debe ser mayor a 0.')
  }
  return {
    ...datos,
    persona,
    concepto: datos.concepto?.trim() || undefined,
    monto: Math.round(datos.monto * 100) / 100,
  }
}

export async function crearDeuda(datos: NuevaDeuda, usuarioId: string): Promise<Deuda> {
  const deuda: Deuda = {
    ...validar(datos),
    id: crypto.randomUUID(),
    usuarioId,
    abonos: [],
    ...marcaCambio(),
  }
  await db.deudas.add(deuda)
  return deuda
}

export async function actualizarDeuda(id: string, datos: NuevaDeuda): Promise<void> {
  const actual = await db.deudas.get(id)
  if (!actual) throw new Error('La deuda ya no existe.')
  await db.deudas.put({ ...actual, ...validar(datos), ...marcaCambio() })
}

/** Registra un pago parcial (o total, si cubre lo pendiente). */
export async function abonarDeuda(id: string, monto: number, nota?: string): Promise<void> {
  if (!Number.isFinite(monto) || monto <= 0) throw new Error('Ingresa un monto mayor a 0.')

  const deuda = await db.deudas.get(id)
  if (!deuda) throw new Error('La deuda ya no existe.')

  const pendiente = deuda.monto - deuda.abonos.reduce((s, a) => s + a.monto, 0)
  if (monto > pendiente + 0.001) {
    throw new Error(`El abono supera lo pendiente (S/ ${pendiente.toFixed(2)}).`)
  }

  await db.deudas.put({
    ...deuda,
    abonos: [
      ...deuda.abonos,
      { id: crypto.randomUUID(), fecha: new Date(), monto: Math.round(monto * 100) / 100, nota: nota?.trim() || undefined },
    ],
    ...marcaCambio(),
  })
}

export async function eliminarDeuda(deuda: Deuda): Promise<void> {
  await db.transaction('rw', db.deudas, db.eliminacionesPendientes, async () => {
    await db.deudas.delete(deuda.id)
    await registrarBorrado('deudas', deuda.usuarioId, [deuda.id])
  })
}

/**
 * Salda la deuda de un toque (abono por todo lo pendiente) sin registrar
 * movimientos en cuentas. Devuelve la deuda anterior para poder deshacer.
 */
export async function marcarDeudaPagada(id: string): Promise<Deuda> {
  const deuda = await db.deudas.get(id)
  if (!deuda) throw new Error('La deuda ya no existe.')

  const pendiente = deuda.monto - deuda.abonos.reduce((s, a) => s + a.monto, 0)
  if (pendiente > 0.005) {
    await db.deudas.put({
      ...deuda,
      abonos: [
        ...deuda.abonos,
        { id: crypto.randomUUID(), fecha: new Date(), monto: Math.round(pendiente * 100) / 100, nota: 'Marcada como pagada' },
      ],
      ...marcaCambio(),
    })
  }
  return deuda
}

/** Deshace un `marcarDeudaPagada` (vuelve a la versión anterior). */
export async function restaurarDeuda(anterior: Deuda): Promise<void> {
  await db.deudas.put({ ...anterior, ...marcaCambio() })
}
