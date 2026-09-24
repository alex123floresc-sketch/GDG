import { db } from '../db/database'
import type { NuevaTransaccion, Transaccion } from '../types'

export async function crearTransaccion(
  datos: NuevaTransaccion,
  usuarioId: string,
): Promise<Transaccion> {
  const transaccion: Transaccion = {
    id: crypto.randomUUID(),
    usuarioId,
    ...datos,
    sincronizado: false,
    fechaActualizacion: new Date(),
  }

  await db.transacciones.add(transaccion)

  return transaccion
}

/**
 * Borra las transacciones cacheadas localmente. Se usa al cerrar sesión para
 * que, en un dispositivo compartido, el siguiente usuario que inicie sesión
 * no vea datos financieros de la sesión anterior.
 */
export async function limpiarDatosLocales(): Promise<void> {
  await db.transacciones.clear()
}
