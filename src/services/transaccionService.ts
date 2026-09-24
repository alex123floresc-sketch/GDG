import { db } from '../db/database'
import type { NuevaTransaccion, Transaccion } from '../types'

export async function crearTransaccion(
  datos: NuevaTransaccion,
): Promise<Transaccion> {
  const transaccion: Transaccion = {
    id: crypto.randomUUID(),
    ...datos,
    sincronizado: false,
    fechaActualizacion: new Date(),
  }

  await db.transacciones.add(transaccion)

  return transaccion
}
