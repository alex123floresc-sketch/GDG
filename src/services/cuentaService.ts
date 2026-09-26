import { db } from '../db/database'
import type { Cuenta, NuevaCuenta } from '../types'
import { uuidDeterminista } from './sincronizable'

const CUENTAS_BASE: NuevaCuenta[] = [
  { nombre: 'Efectivo', tipo: 'efectivo', saldoInicial: 0 },
  { nombre: 'Yape', tipo: 'billetera_digital', saldoInicial: 0 },
  { nombre: 'Banco', tipo: 'banco', saldoInicial: 0 },
]

/**
 * Crea las cuentas por defecto para un usuario si todavía no tiene ninguna
 * (p. ej. su primer inicio de sesión en este dispositivo).
 *
 * Los ids salen del usuario + nombre: si esto corre dos veces a la vez (dos
 * pestañas, dos dispositivos, el doble efecto de React en desarrollo) se
 * generan los mismos ids y no se duplican.
 */
export async function asegurarCuentasPorDefecto(usuarioId: string): Promise<void> {
  const base: Cuenta[] = await Promise.all(
    CUENTAS_BASE.map(async (cuenta) => ({
      ...cuenta,
      id: await uuidDeterminista(`${usuarioId}|cuenta|${cuenta.nombre}`),
      usuarioId,
    })),
  )

  await db.transaction('rw', db.cuentas, async () => {
    if ((await db.cuentas.where('usuarioId').equals(usuarioId).count()) > 0) return
    await db.cuentas.bulkPut(base)
  })
}

function validar(datos: NuevaCuenta): NuevaCuenta {
  const nombre = datos.nombre.trim()
  if (!nombre) throw new Error('El nombre de la cuenta es obligatorio.')
  if (!Number.isFinite(datos.saldoInicial)) throw new Error('El saldo inicial no es válido.')

  if (datos.tipo !== 'tarjeta_credito') {
    return { nombre, tipo: datos.tipo, saldoInicial: datos.saldoInicial }
  }

  const dia = (d?: number) => (d && d >= 1 && d <= 31 ? Math.round(d) : undefined)
  return {
    nombre,
    tipo: datos.tipo,
    saldoInicial: datos.saldoInicial,
    limiteCredito: datos.limiteCredito && datos.limiteCredito > 0 ? datos.limiteCredito : undefined,
    diaCorte: dia(datos.diaCorte),
    diaPago: dia(datos.diaPago),
  }
}

async function validarNombreUnico(usuarioId: string, nombre: string, excluirId?: string) {
  const repetida = await db.cuentas
    .where('usuarioId')
    .equals(usuarioId)
    .filter(
      (c) => c.id !== excluirId && c.nombre.localeCompare(nombre, 'es', { sensitivity: 'base' }) === 0,
    )
    .first()
  if (repetida) throw new Error(`Ya existe una cuenta llamada "${repetida.nombre}".`)
}

export async function crearCuenta(datos: NuevaCuenta, usuarioId: string): Promise<Cuenta> {
  const limpios = validar(datos)
  await validarNombreUnico(usuarioId, limpios.nombre)

  const cuenta: Cuenta = {
    ...limpios,
    id: crypto.randomUUID(),
    usuarioId,
    sincronizado: false,
    fechaActualizacion: new Date(),
  }
  await db.cuentas.add(cuenta)
  return cuenta
}

export async function actualizarCuenta(
  id: string,
  datos: NuevaCuenta,
  usuarioId: string,
): Promise<void> {
  const limpios = validar(datos)
  await validarNombreUnico(usuarioId, limpios.nombre, id)

  const actual = await db.cuentas.get(id)
  if (!actual) throw new Error('La cuenta ya no existe.')

  // put (no update) para que se borren los campos de tarjeta si cambia el tipo.
  await db.cuentas.put({
    id,
    usuarioId: actual.usuarioId,
    ...limpios,
    sincronizado: false,
    fechaActualizacion: new Date(),
  })
}

/**
 * Elimina una cuenta. Si tiene transacciones o recurrentes, deben pasar a
 * otra (`reasignarA`). No se puede eliminar la única cuenta.
 */
export async function eliminarCuenta(id: string, reasignarA?: string): Promise<void> {
  const tablas = [db.cuentas, db.transacciones, db.recurrentes, db.eliminacionesPendientes]
  await db.transaction('rw', tablas, async () => {
    const cuenta = await db.cuentas.get(id)
    if (!cuenta) return

    const total = await db.cuentas.where('usuarioId').equals(cuenta.usuarioId).count()
    if (total <= 1) throw new Error('Necesitas al menos una cuenta.')

    const usos = db.transacciones.where('cuentaId').equals(id)
    const recurrentes = db.recurrentes.filter((r) => r.cuentaId === id)

    if ((await usos.count()) + (await recurrentes.count()) > 0) {
      if (!reasignarA || reasignarA === id) {
        throw new Error('Elige a qué cuenta pasan sus movimientos.')
      }
      const cambio = { cuentaId: reasignarA, sincronizado: false, fechaActualizacion: new Date() }
      await usos.modify(cambio)
      await recurrentes.modify(cambio)
    }

    await db.cuentas.delete(id)
    await db.eliminacionesPendientes.add({
      usuarioId: cuenta.usuarioId,
      tabla: 'cuentas',
      registroId: id,
    })
  })
}

/** Nombre de la cuenta donde queda lo que pagaste por otros al dividir gastos. */
export const NOMBRE_POR_COBRAR = 'Por cobrar'

/**
 * Cuenta "Por cobrar" del usuario (la crea si no existe). Guarda el dinero
 * que adelantaste al dividir un gasto: sale de tu cuenta como transferencia
 * y vuelve cuando te pagan, así no cuenta como gasto tuyo.
 */
export async function asegurarCuentaPorCobrar(usuarioId: string): Promise<Cuenta> {
  const existente = await db.cuentas
    .where('usuarioId')
    .equals(usuarioId)
    .filter((c) => c.nombre.localeCompare(NOMBRE_POR_COBRAR, 'es', { sensitivity: 'base' }) === 0)
    .first()
  if (existente) return existente
  return crearCuenta({ nombre: NOMBRE_POR_COBRAR, tipo: 'otro', saldoInicial: 0 }, usuarioId)
}
