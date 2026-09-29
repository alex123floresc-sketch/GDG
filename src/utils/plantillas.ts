import type { Plantilla } from '../types'
import { formatearDolares, formatearMoneda } from './formato'

/** Texto del monto de una plantilla ("S/ 8.00" o "Monto variable"). */
export function montoPlantilla(p: Plantilla): string {
  if (p.monto === undefined) return 'Monto variable'
  return p.moneda === 'USD' ? formatearDolares(p.monto) : formatearMoneda(p.monto)
}
