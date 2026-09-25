import { db } from '../db/database'
import type { Deuda, Moneda, Transaccion } from '../types'
import { asegurarCuentaPorCobrar } from './cuentaService'
import { marcaCambio } from './sincronizable'
import { crearTransaccion, crearTransferencia } from './transaccionService'

export interface ParticipanteDivision {
  persona: string
  /** Su parte, en la moneda del gasto. */
  monto: number
}

export interface DatosDivision {
  /** Total de la cuenta, en la moneda del gasto. */
  total: number
  moneda: Moneda
  /** Soles por unidad de `moneda` (1 si es PEN). */
  tipoCambio: number
  cuentaId: string
  categoriaId: string
  fecha: Date
  concepto?: string
  etiquetas?: string[]
  /** Los demás (sin incluirte). */
  participantes: ParticipanteDivision[]
}

const redondear = (n: number) => Math.round(n * 100) / 100

/**
 * Registra un gasto pagado por ti y dividido con otros:
 * - tu parte → gasto en la categoría elegida;
 * - lo que pagaste por los demás → transferencia de tu cuenta a "Por
 *   cobrar" (no es gasto tuyo, pero sí salió de tu cuenta);
 * - por cada persona → una deuda "me debe" marcada como gasto dividido.
 * Todo se guarda en soles; si fue en dólares, el gasto conserva el original.
 */
export async function registrarGastoDividido(datos: DatosDivision, usuarioId: string): Promise<{ miParte: number; porCobrar: number }> {
  const personas = datos.participantes.map((p) => ({ ...p, persona: p.persona.trim() }))
  if (personas.length === 0) throw new Error('Agrega al menos una persona con quien dividir.')
  if (personas.some((p) => !p.persona)) throw new Error('Escribe el nombre de cada persona.')
  if (personas.some((p) => !Number.isFinite(p.monto) || p.monto <= 0)) {
    throw new Error('Cada parte debe ser mayor a 0.')
  }

  const totalOtros = personas.reduce((s, p) => s + p.monto, 0)
  const miParteOriginal = redondear(datos.total - totalOtros)
  if (miParteOriginal < -0.005) throw new Error('Las partes de los demás suman más que el total.')

  const aSoles = (m: number) => redondear(m * datos.tipoCambio)

  // Todo o nada: gasto, transferencia a "Por cobrar" y deudas.
  await db.transaction('rw', [db.cuentas, db.transacciones, db.deudas], async () => {
    const enDolares = datos.moneda === 'USD'
    const concepto = datos.concepto?.trim() || undefined
    const porCobrar = await asegurarCuentaPorCobrar(usuarioId)

    if (miParteOriginal > 0.005) {
      const gasto: Omit<Transaccion, 'id' | 'usuarioId' | 'sincronizado' | 'fechaActualizacion'> = {
        monto: aSoles(miParteOriginal),
        tipo: 'gasto',
        cuentaId: datos.cuentaId,
        categoriaId: datos.categoriaId,
        fecha: datos.fecha,
        concepto,
        origen: 'manual',
        etiquetas: datos.etiquetas?.length ? datos.etiquetas : undefined,
        moneda: enDolares ? 'USD' : undefined,
        montoOriginal: enDolares ? miParteOriginal : undefined,
        tipoCambio: enDolares ? datos.tipoCambio : undefined,
      }
      await crearTransaccion(gasto, usuarioId)
    }

    await crearTransferencia(
      {
        cuentaOrigenId: datos.cuentaId,
        cuentaDestinoId: porCobrar.id,
        monto: aSoles(totalOtros),
        fecha: datos.fecha,
        concepto: `Gasto dividido${concepto ? `: ${concepto}` : ''}`,
      },
      usuarioId,
    )

    const deudas: Deuda[] = personas.map((p) => ({
      id: crypto.randomUUID(),
      usuarioId,
      persona: p.persona,
      tipo: 'me_deben',
      monto: aSoles(p.monto),
      concepto: concepto ?? 'Gasto dividido',
      fecha: new Date(datos.fecha.getFullYear(), datos.fecha.getMonth(), datos.fecha.getDate(), 12),
      abonos: [],
      gastoDividido: true,
      ...marcaCambio(),
    }))
    await db.deudas.bulkAdd(deudas)
  })

  return { miParte: aSoles(miParteOriginal), porCobrar: aSoles(totalOtros) }
}

/**
 * Cobro de una deuda que viene de un gasto dividido: devuelve el dinero de
 * "Por cobrar" a la cuenta donde lo recibiste (transferencia).
 */
export async function registrarCobroDividido(
  usuarioId: string,
  persona: string,
  monto: number,
  cuentaDestinoId: string,
): Promise<void> {
  const porCobrar = await asegurarCuentaPorCobrar(usuarioId)
  if (porCobrar.id === cuentaDestinoId) return
  await crearTransferencia(
    {
      cuentaOrigenId: porCobrar.id,
      cuentaDestinoId,
      monto,
      fecha: new Date(),
      concepto: `Cobro a ${persona}`,
    },
    usuarioId,
  )
}
