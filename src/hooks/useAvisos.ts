import { createContext, useContext } from 'react'

export type TipoAviso = 'exito' | 'error' | 'info'

export interface Aviso {
  id: number
  tipo: TipoAviso
  texto: string
  /** Acción opcional, p. ej. "Deshacer". */
  accion?: { texto: string; onClick: () => void }
}

export interface ContextoAvisos {
  avisar: (texto: string, tipo?: TipoAviso, accion?: Aviso['accion']) => void
}

export const AvisosContext = createContext<ContextoAvisos>({ avisar: () => {} })

/** Muestra avisos breves (toasts) en la esquina de la pantalla. */
export function useAvisos(): ContextoAvisos {
  return useContext(AvisosContext)
}
