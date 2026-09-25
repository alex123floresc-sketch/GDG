import { db } from '../db/database'
import type { Cuenta, NuevaCuenta } from '../types'

const CUENTAS_BASE: NuevaCuenta[] = [
  { nombre: 'Efectivo', tipo: 'efectivo', saldoInicial: 0 },
  { nombre: 'Yape', tipo: 'billetera_digital', saldoInicial: 0 },
  { nombre: 'Banco', tipo: 'banco', saldoInicial: 0 },
]

/**
 * Crea las cuentas por defecto para un usuario si todavía no tiene ninguna
 * (p. ej. su primer inicio de sesión en este dispositivo).
 */
export async function asegurarCuentasPorDefecto(usuarioId: string): Promise<void> {
  const existentes = await db.cuentas.where('usuarioId').equals(usuarioId).count()

  if (existentes > 0) return

  await db.cuentas.bulkAdd(
    CUENTAS_BASE.map((cuenta) => ({
      ...cuenta,
      id: crypto.randomUUID(),
      usuarioId,
    })),
  )
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
