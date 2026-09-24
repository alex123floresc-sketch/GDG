export type TipoTransaccion = 'ingreso' | 'gasto'

export type TipoCategoria = TipoTransaccion | 'ambos'

export interface Categoria {
  id: string
  nombre: string
  tipo: TipoCategoria
  icono?: string
  color?: string
}

export interface Transaccion {
  id: string
  monto: number
  tipo: TipoTransaccion
  categoria: string
  fecha: Date
  nota?: string
  sincronizado: boolean
  fechaActualizacion: Date
}

export type NuevaCategoria = Omit<Categoria, 'id'>

export type NuevaTransaccion = Omit<
  Transaccion,
  'id' | 'sincronizado' | 'fechaActualizacion'
>

export interface ResultadoSincronizacion {
  subidas: number
  descargadas: number
  fecha: Date
}

export interface EstadoSincronizacion {
  enLinea: boolean
  sincronizando: boolean
  ultimaSincronizacion: Date | null
  error: string | null
}
