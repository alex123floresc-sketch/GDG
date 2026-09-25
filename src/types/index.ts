export type TipoTransaccion = 'ingreso' | 'gasto'

export type TipoCategoria = TipoTransaccion | 'ambos'

export type TipoCuenta = 'efectivo' | 'banco' | 'billetera_digital' | 'otro'

export type OrigenTransaccion = 'manual' | 'yape'

export interface Categoria {
  id: string
  usuarioId: string
  nombre: string
  tipo: TipoCategoria
  icono?: string
  color?: string
}

export interface Cuenta {
  id: string
  usuarioId: string
  nombre: string
  tipo: TipoCuenta
  saldoInicial: number
}

export interface Transaccion {
  id: string
  usuarioId: string
  cuentaId: string
  categoriaId: string
  monto: number
  tipo: TipoTransaccion
  fecha: Date
  concepto?: string
  nroOperacion?: string
  origen: OrigenTransaccion
  sincronizado: boolean
  fechaActualizacion: Date
}

export interface Presupuesto {
  id: string
  usuarioId: string
  categoriaId: string
  montoLimite: number
  /** 1-12 */
  mes: number
  anio: number
}

/**
 * Registro local de una categoría/cuenta eliminada que falta borrar en
 * Supabase (se procesa en el siguiente ciclo de sincronización).
 */
export interface EliminacionPendiente {
  id?: number
  usuarioId: string
  tabla: 'categorias' | 'cuentas'
  registroId: string
}

export type NuevaCategoria = Omit<Categoria, 'id' | 'usuarioId'>
export type NuevaCuenta = Omit<Cuenta, 'id' | 'usuarioId'>
export type NuevoPresupuesto = Omit<Presupuesto, 'id' | 'usuarioId'>

export type NuevaTransaccion = Omit<
  Transaccion,
  'id' | 'usuarioId' | 'sincronizado' | 'fechaActualizacion'
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

/** Una fila ya interpretada de un reporte Excel de Yape, antes de guardarse. */
export interface FilaYapeParseada {
  fecha: Date
  concepto: string
  nroOperacion: string
  monto: number
  tipo: TipoTransaccion
}

export interface ResultadoParseoYape {
  filas: FilaYapeParseada[]
  /** Filas del archivo que no se pudieron interpretar (fecha/monto inválidos). */
  erroresFilas: number
}

export interface ResultadoImportacionYape {
  total: number
  nuevas: number
  duplicadas: number
}
