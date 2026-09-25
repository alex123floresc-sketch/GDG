import type { Cuenta, Deuda, Transaccion } from '../types'

export interface PuntoPatrimonio {
  /** Último instante del mes. */
  fecha: Date
  etiqueta: string
  etiquetaLarga: string
  /** Saldo de todas las cuentas (tarjetas en negativo, "Por cobrar" incluida). */
  cuentas: number
  /** Préstamos que hiciste y aún te deben (sin los de gastos divididos, que ya están en "Por cobrar"). */
  meDeben: number
  /** Lo que debes a otras personas. */
  debo: number
  patrimonio: number
}

const MESES_CORTOS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']
const MESES_LARGOS = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
]

function pendienteDeuda(deuda: Deuda, hasta: Date): number {
  if (deuda.fecha > hasta) return 0
  const pagado = deuda.abonos.filter((a) => a.fecha <= hasta).reduce((s, a) => s + a.monto, 0)
  return Math.max(0, deuda.monto - pagado)
}

/**
 * Patrimonio neto al cierre de cada uno de los últimos `meses` meses:
 * saldo de las cuentas (saldo inicial + movimientos hasta esa fecha) + lo
 * que te deben − lo que debes. El mes en curso se calcula hasta hoy.
 */
export function evolucionPatrimonio(
  cuentas: Cuenta[],
  transacciones: Transaccion[],
  deudas: Deuda[],
  meses = 12,
  hoy: Date = new Date(),
): PuntoPatrimonio[] {
  const idsCuentas = new Set(cuentas.map((c) => c.id))
  const saldoInicial = cuentas.reduce((s, c) => s + c.saldoInicial, 0)
  const ordenadas = transacciones
    .filter((t) => idsCuentas.has(t.cuentaId))
    .sort((a, b) => a.fecha.getTime() - b.fecha.getTime())

  const puntos: PuntoPatrimonio[] = []
  let indice = 0
  let acumulado = saldoInicial

  for (let i = meses - 1; i >= 0; i--) {
    const inicioSiguiente = new Date(hoy.getFullYear(), hoy.getMonth() - i + 1, 1)
    const cierre = i === 0 ? hoy : new Date(inicioSiguiente.getTime() - 1)

    while (indice < ordenadas.length && ordenadas[indice].fecha <= cierre) {
      const t = ordenadas[indice++]
      acumulado += t.tipo === 'ingreso' ? t.monto : -t.monto
    }

    const meDeben = deudas
      .filter((d) => d.tipo === 'me_deben' && !d.gastoDividido)
      .reduce((s, d) => s + pendienteDeuda(d, cierre), 0)
    const debo = deudas.filter((d) => d.tipo === 'debo').reduce((s, d) => s + pendienteDeuda(d, cierre), 0)
    const mes = cierre.getMonth()

    puntos.push({
      fecha: cierre,
      etiqueta: MESES_CORTOS[mes],
      etiquetaLarga: `${MESES_LARGOS[mes]} ${cierre.getFullYear()}`,
      cuentas: acumulado,
      meDeben,
      debo,
      patrimonio: acumulado + meDeben - debo,
    })
  }

  return puntos
}
