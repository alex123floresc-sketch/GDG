import { db } from '../db/database'
import type { Chanchito, Cuenta, NuevoChanchito, RetoAhorro } from '../types'
import { aportarAMeta } from './metaService'
import { marcaCambio, registrarBorrado } from './sincronizable'
import { crearTransaccion, crearTransferencia } from './transaccionService'

const redondear = (n: number) => Math.round(n * 100) / 100

/** Nombre de la cuenta de sistema de un chanchito apartado. */
const nombreCuenta = (nombre: string) => `Chanchito ${nombre}`

/**
 * Nombre de cuenta que no choque con otra (p. ej. la de un chanchito
 * archivado con el mismo nombre): "Chanchito Viaje", "Chanchito Viaje (2)"…
 */
async function nombreCuentaLibre(usuarioId: string, nombre: string, excluirId?: string): Promise<string> {
  const usados = new Set(
    (await db.cuentas.where('usuarioId').equals(usuarioId).toArray())
      .filter((c) => c.id !== excluirId)
      .map((c) => c.nombre.toLocaleLowerCase('es')),
  )
  const base = nombreCuenta(nombre)
  let candidato = base
  for (let n = 2; usados.has(candidato.toLocaleLowerCase('es')); n++) candidato = `${base} (${n})`
  return candidato
}

function validarNombre(nombre: string): string {
  const limpio = nombre.trim()
  if (!limpio) throw new Error('Ponle un nombre al chanchito.')
  return limpio
}

function validarReto(reto?: RetoAhorro): RetoAhorro | undefined {
  if (!reto) return undefined
  if (!Number.isFinite(reto.montoBase) || reto.montoBase <= 0) {
    throw new Error('El monto del reto debe ser mayor a 0.')
  }
  const inicio = new Date(reto.inicio)
  inicio.setHours(0, 0, 0, 0)
  return {
    ...reto,
    montoBase: redondear(reto.montoBase),
    inicio,
    duracion: reto.tipo === 'diario' ? Math.max(1, Math.round(reto.duracion ?? 30)) : undefined,
  }
}

async function nombreRepetido(usuarioId: string, nombre: string, excluirId?: string): Promise<boolean> {
  const iguales = await db.chanchitos
    .where('usuarioId')
    .equals(usuarioId)
    .filter(
      (c) => c.id !== excluirId && !c.archivado && c.nombre.localeCompare(nombre, 'es', { sensitivity: 'base' }) === 0,
    )
    .count()
  return iguales > 0
}

export async function crearChanchito(datos: NuevoChanchito, usuarioId: string): Promise<Chanchito> {
  const nombre = validarNombre(datos.nombre)
  if (await nombreRepetido(usuarioId, nombre)) throw new Error(`Ya tienes un chanchito llamado "${nombre}".`)

  const chanchito: Chanchito = {
    id: crypto.randomUUID(),
    usuarioId,
    nombre,
    icono: datos.icono,
    color: datos.color,
    tipo: datos.tipo,
    movimientos: [],
    reto: validarReto(datos.reto),
    ...marcaCambio(),
  }

  await db.transaction('rw', db.chanchitos, db.cuentas, async () => {
    if (chanchito.tipo === 'cuenta') {
      const cuenta: Cuenta = {
        id: crypto.randomUUID(),
        usuarioId,
        nombre: await nombreCuentaLibre(usuarioId, nombre),
        tipo: 'chanchito',
        saldoInicial: 0,
        ...marcaCambio(),
      }
      await db.cuentas.add(cuenta)
      chanchito.cuentaId = cuenta.id
    }
    await db.chanchitos.add(chanchito)
  })
  return chanchito
}

/** Cambia nombre, color, icono o reto (el tipo no se puede cambiar). */
export async function actualizarChanchito(
  id: string,
  datos: Pick<Chanchito, 'nombre' | 'icono' | 'color' | 'reto'>,
): Promise<void> {
  const actual = await db.chanchitos.get(id)
  if (!actual) throw new Error('El chanchito ya no existe.')
  const nombre = validarNombre(datos.nombre)
  if (await nombreRepetido(actual.usuarioId, nombre, id)) {
    throw new Error(`Ya tienes un chanchito llamado "${nombre}".`)
  }

  // Si el reto es el mismo tipo, se conserva lo ya cumplido.
  const reto = validarReto(datos.reto)
  if (reto && actual.reto?.tipo === reto.tipo) reto.cumplidos = actual.reto.cumplidos

  await db.transaction('rw', db.chanchitos, db.cuentas, async () => {
    await db.chanchitos.put({ ...actual, nombre, icono: datos.icono, color: datos.color, reto, ...marcaCambio() })
    if (actual.cuentaId && nombre !== actual.nombre) {
      await db.cuentas.update(actual.cuentaId, {
        nombre: await nombreCuentaLibre(actual.usuarioId, nombre, actual.cuentaId),
        ...marcaCambio(),
      })
    }
  })
}

interface OpcionesEchar {
  /** Obligatoria en los apartados: de qué cuenta sale el dinero. */
  cuentaOrigenId?: string
  nota?: string
  /** Paso del reto que se cumple con este aporte. */
  retoClave?: string
  fecha?: Date
}

/** Echa dinero al chanchito. */
export async function echarAlChanchito(chanchito: Chanchito, monto: number, opciones: OpcionesEchar = {}): Promise<void> {
  if (!Number.isFinite(monto) || monto <= 0) throw new Error('Ingresa un monto mayor a 0.')
  const cantidad = redondear(monto)
  const fecha = opciones.fecha ?? new Date()
  const nota = opciones.nota?.trim() || undefined

  await db.transaction('rw', db.chanchitos, db.transacciones, async () => {
    const actual = await db.chanchitos.get(chanchito.id)
    if (!actual) throw new Error('El chanchito ya no existe.')

    let movimientos = actual.movimientos
    if (actual.tipo === 'cuenta') {
      if (!opciones.cuentaOrigenId || !actual.cuentaId) throw new Error('Elige de qué cuenta sale el dinero.')
      await crearTransferencia(
        {
          cuentaOrigenId: opciones.cuentaOrigenId,
          cuentaDestinoId: actual.cuentaId,
          monto: cantidad,
          fecha,
          concepto: nota ?? `Al chanchito ${actual.nombre}`,
        },
        actual.usuarioId,
      )
    } else {
      movimientos = [...movimientos, { id: crypto.randomUUID(), fecha, monto: cantidad, nota }]
    }

    const reto =
      actual.reto && opciones.retoClave && !actual.reto.cumplidos.includes(opciones.retoClave)
        ? { ...actual.reto, cumplidos: [...actual.reto.cumplidos, opciones.retoClave] }
        : actual.reto

    await db.chanchitos.put({ ...actual, movimientos, reto, ...marcaCambio() })
  })
}

export type DestinoSalida =
  /** A una cuenta. En los físicos se registra como ingreso (necesita categoría). */
  | { tipo: 'cuenta'; cuentaId: string; categoriaId?: string }
  /** Aporte a una meta. En los apartados el dinero además pasa a `cuentaId`. */
  | { tipo: 'meta'; metaId: string; cuentaId?: string }
  /** Solo físicos: lo sacaste y lo gastaste/usaste fuera de la app. */
  | { tipo: 'nada' }

/**
 * Saca dinero del chanchito (romperlo = sacar todo `saldo`). `saldo` es
 * el actual (ver `saldoChanchito`).
 */
export async function sacarDelChanchito(
  chanchito: Chanchito,
  monto: number,
  saldo: number,
  destino: DestinoSalida,
  nota?: string,
): Promise<void> {
  if (!Number.isFinite(monto) || monto <= 0) throw new Error('Ingresa un monto mayor a 0.')
  const cantidad = redondear(monto)
  if (cantidad > saldo + 0.001) throw new Error('No puedes sacar más de lo que hay en el chanchito.')

  const fecha = new Date()
  const concepto = nota?.trim() || `Del chanchito ${chanchito.nombre}`
  const cuentaDestino = destino.tipo === 'nada' ? undefined : destino.cuentaId

  if (chanchito.tipo === 'cuenta' && !cuentaDestino) throw new Error('Elige a qué cuenta va el dinero.')
  if (chanchito.tipo === 'cuenta' && destino.tipo === 'nada') throw new Error('Elige a dónde va el dinero.')
  if (chanchito.tipo === 'fisico' && destino.tipo === 'cuenta' && !destino.categoriaId) {
    throw new Error('Elige la categoría del ingreso.')
  }

  await db.transaction('rw', [db.chanchitos, db.transacciones, db.metas], async () => {
    const actual = await db.chanchitos.get(chanchito.id)
    if (!actual) throw new Error('El chanchito ya no existe.')

    if (actual.tipo === 'cuenta') {
      await crearTransferencia(
        { cuentaOrigenId: actual.cuentaId!, cuentaDestinoId: cuentaDestino!, monto: cantidad, fecha, concepto },
        actual.usuarioId,
      )
    } else {
      if (destino.tipo === 'cuenta') {
        await crearTransaccion(
          {
            tipo: 'ingreso',
            monto: cantidad,
            cuentaId: destino.cuentaId,
            categoriaId: destino.categoriaId!,
            fecha,
            concepto,
            origen: 'manual',
          },
          actual.usuarioId,
        )
      }
      await db.chanchitos.update(actual.id, {
        movimientos: [...actual.movimientos, { id: crypto.randomUUID(), fecha, monto: -cantidad, nota: concepto }],
        ...marcaCambio(),
      })
    }

    if (destino.tipo === 'meta') await aportarAMeta(destino.metaId, cantidad, `Del chanchito ${actual.nombre}`)
  })
}

export async function archivarChanchito(chanchito: Chanchito, archivado: boolean): Promise<void> {
  await db.chanchitos.update(chanchito.id, { archivado: archivado || undefined, ...marcaCambio() })
}

/**
 * Elimina un chanchito vacío. Si es apartado y su cuenta tiene historial,
 * se archiva en vez de borrarse (borrar esas transferencias cambiaría el
 * saldo de tus otras cuentas). Devuelve lo que se hizo.
 */
export async function eliminarChanchito(chanchito: Chanchito, saldo: number): Promise<'eliminado' | 'archivado'> {
  if (Math.abs(saldo) > 0.004) throw new Error('Primero saca el dinero (rompe el chanchito).')

  return db.transaction('rw', [db.chanchitos, db.cuentas, db.transacciones, db.eliminacionesPendientes], async () => {
    const conHistorial =
      chanchito.cuentaId !== undefined && (await db.transacciones.where('cuentaId').equals(chanchito.cuentaId).count()) > 0
    if (conHistorial) {
      await db.chanchitos.update(chanchito.id, { archivado: true, ...marcaCambio() })
      return 'archivado' as const
    }

    await db.chanchitos.delete(chanchito.id)
    await registrarBorrado('chanchitos', chanchito.usuarioId, [chanchito.id])
    if (chanchito.cuentaId) {
      await db.cuentas.delete(chanchito.cuentaId)
      await registrarBorrado('cuentas', chanchito.usuarioId, [chanchito.cuentaId])
    }
    return 'eliminado' as const
  })
}
