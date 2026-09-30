import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/database'
import type { Compartida, CuentaAjena, MovimientoAjeno } from '../types'

export interface DatosCompartidos {
  /** Invitaciones enviadas y recibidas. */
  compartidas: Compartida[]
  /** Cuentas de otras personas compartidas conmigo. */
  cuentasAjenas: CuentaAjena[]
  /** Lo que otras personas registraron en cuentas compartidas (mías o ajenas). */
  movimientosAjenos: MovimientoAjeno[]
}

const VACIO: DatosCompartidos = { compartidas: [], cuentasAjenas: [], movimientosAjenos: [] }

export function useCompartidas(usuarioId: string): DatosCompartidos {
  return (
    useLiveQuery(async () => {
      const [compartidas, cuentasAjenas, movimientosAjenos] = await Promise.all([
        db.compartidas.where('usuarioId').equals(usuarioId).toArray(),
        db.cuentasAjenas.where('usuarioId').equals(usuarioId).toArray(),
        db.movimientosAjenos.where('usuarioId').equals(usuarioId).toArray(),
      ])
      return { compartidas, cuentasAjenas, movimientosAjenos }
    }, [usuarioId]) ?? VACIO
  )
}
