import { db } from '../db/database'
import type { Frecuencia, NuevoRecurrente, Recurrente, Transaccion } from '../types'
import { leerTipoCambio } from '../utils/preferencias'
import { marcaCambio, registrarBorrado, uuidDeterminista } from './sincronizable'

/** Tope de ocurrencias que se generan de una vez (p. ej. tras meses sin abrir la app). */
const MAX_OCURRENCIAS = 36

/** Fecha siguiente según la frecuencia (conserva el día del mes cuando existe). */
export function siguienteFecha(fecha: Date, frecuencia: Frecuencia, diaOriginal = fecha.getDate()): Date {
  const y = fecha.getFullYear()
  const m = fecha.getMonth()
  switch (frecuencia) {
    case 'semanal':
      return new Date(y, m, fecha.getDate() + 7)
    case 'quincenal':
      return new Date(y, m, fecha.getDate() + 14)
    case 'mensual': {
      const ultimo = new Date(y, m + 2, 0).getDate()
      return new Date(y, m + 1, Math.min(diaOriginal, ultimo))
    }
    case 'anual': {
      const ultimo = new Date(y + 1, m + 1, 0).getDate()
      return new Date(y + 1, m, Math.min(diaOriginal, ultimo))
    }
  }
}

function validar(datos: NuevoRecurrente): NuevoRecurrente {
  const concepto = datos.concepto.trim()
  if (!concepto) throw new Error('Ponle un nombre (ej. Netflix, Alquiler).')
  if (!Number.isFinite(datos.monto) || datos.monto <= 0) throw new Error('El monto debe ser mayor a 0.')
  if (!datos.categoriaId) throw new Error('Elige una categoría.')
  if (!datos.cuentaId) throw new Error('Elige una cuenta.')
  const proxima = new Date(datos.proximaFecha)
  proxima.setHours(0, 0, 0, 0)
  return { ...datos, concepto, proximaFecha: proxima, monto: Math.round(datos.monto * 100) / 100 }
}

export async function crearRecurrente(datos: NuevoRecurrente, usuarioId: string): Promise<Recurrente> {
  const recurrente: Recurrente = {
    ...validar(datos),
    id: crypto.randomUUID(),
    usuarioId,
    ...marcaCambio(),
  }
  await db.recurrentes.add(recurrente)
  return recurrente
}

export async function actualizarRecurrente(id: string, datos: NuevoRecurrente): Promise<void> {
  const actual = await db.recurrentes.get(id)
  if (!actual) throw new Error('El movimiento recurrente ya no existe.')
  await db.recurrentes.put({ ...actual, ...validar(datos), ...marcaCambio() })
}

export async function alternarRecurrente(recurrente: Recurrente): Promise<void> {
  await db.recurrentes.update(recurrente.id, { activa: !recurrente.activa, ...marcaCambio() })
}

/** Elimina la regla; las transacciones que ya generó se conservan. */
export async function eliminarRecurrente(recurrente: Recurrente): Promise<void> {
  await db.transaction('rw', db.recurrentes, db.eliminacionesPendientes, async () => {
    await db.recurrentes.delete(recurrente.id)
    await registrarBorrado('recurrentes', recurrente.usuarioId, [recurrente.id])
  })
}

/**
 * Crea las transacciones de los recurrentes activos cuya fecha ya llegó y
 * avanza su `proximaFecha`. El id de cada ocurrencia es determinista
 * (recurrente + fecha), así que si dos dispositivos las generan no se
 * duplican. Devuelve cuántas se crearon.
 */
export async function generarRecurrentesPendientes(usuarioId: string, hoy = new Date()): Promise<number> {
  const finDeHoy = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate(), 23, 59, 59)
  const vencidos = await db.recurrentes
    .where('usuarioId')
    .equals(usuarioId)
    .filter((r) => r.activa && r.proximaFecha <= finDeHoy)
    .toArray()

  let creadas = 0

  for (const recurrente of vencidos) {
    const nuevas: Transaccion[] = []
    const diaOriginal = recurrente.proximaFecha.getDate()
    let fecha = recurrente.proximaFecha

    while (fecha <= finDeHoy && nuevas.length < MAX_OCURRENCIAS) {
      const tipoCambio = recurrente.moneda === 'USD' ? leerTipoCambio() : undefined
      nuevas.push({
        id: await uuidDeterminista(`${recurrente.id}|${fecha.toDateString()}`),
        usuarioId,
        cuentaId: recurrente.cuentaId,
        categoriaId: recurrente.categoriaId,
        monto: tipoCambio ? Math.round(recurrente.monto * tipoCambio * 100) / 100 : recurrente.monto,
        tipo: recurrente.tipo,
        // Mediodía: evita que un cambio de hora mueva la fecha de día.
        fecha: new Date(fecha.getFullYear(), fecha.getMonth(), fecha.getDate(), 12),
        concepto: recurrente.concepto,
        origen: 'recurrente',
        recurrenteId: recurrente.id,
        moneda: recurrente.moneda === 'USD' ? 'USD' : undefined,
        montoOriginal: tipoCambio ? recurrente.monto : undefined,
        tipoCambio,
        sincronizado: false,
        fechaActualizacion: new Date(),
      })
      fecha = siguienteFecha(fecha, recurrente.frecuencia, diaOriginal)
    }

    await db.transaction('rw', db.transacciones, db.recurrentes, async () => {
      // Si otro dispositivo ya generó alguna (mismo id), no se duplica.
      const existentes = new Set(
        (await db.transacciones.bulkGet(nuevas.map((t) => t.id)))
          .filter((t): t is Transaccion => t !== undefined)
          .map((t) => t.id),
      )
      const faltantes = nuevas.filter((t) => !existentes.has(t.id))
      await db.transacciones.bulkAdd(faltantes)
      creadas += faltantes.length

      // Se relee por si cambió mientras tanto (p. ej. llegó por sync).
      const actual = await db.recurrentes.get(recurrente.id)
      if (actual && actual.proximaFecha < fecha) {
        await db.recurrentes.update(recurrente.id, { proximaFecha: fecha, ...marcaCambio() })
      }
    })
  }

  return creadas
}
