export type TipoTransaccion = 'ingreso' | 'gasto'

export type TipoCategoria = TipoTransaccion | 'ambos'

export type TipoCuenta =
  | 'efectivo'
  | 'banco'
  | 'billetera_digital'
  | 'tarjeta_credito'
  | 'otro'

/**
 * - `transferencia`: una de las dos patas de un movimiento entre cuentas
 *   propias (no cuenta como ingreso ni gasto en los resúmenes).
 * - `recurrente`: generada automáticamente por un `Recurrente`.
 */
export type OrigenTransaccion = 'manual' | 'yape' | 'transferencia' | 'recurrente'

export type Moneda = 'PEN' | 'USD'

/**
 * Control de sincronización de las entidades editables que no son
 * transacciones. `sincronizado !== true` = hay cambios locales por subir.
 * Opcionales porque las filas creadas antes de v0.7 no los tienen.
 */
export interface ControlSync {
  sincronizado?: boolean
  fechaActualizacion?: Date
}

export interface Categoria extends ControlSync {
  id: string
  usuarioId: string
  nombre: string
  tipo: TipoCategoria
  icono?: string
  color?: string
}

export interface Cuenta extends ControlSync {
  id: string
  usuarioId: string
  nombre: string
  tipo: TipoCuenta
  /** Para tarjetas de crédito: deuda inicial en negativo. */
  saldoInicial: number
  /** Solo tarjetas de crédito. */
  limiteCredito?: number
  /** Día del mes (1-31) de cierre de facturación. Solo tarjetas. */
  diaCorte?: number
  /** Día del mes (1-31) límite de pago. Solo tarjetas. */
  diaPago?: number
}

export interface Transaccion {
  id: string
  usuarioId: string
  /** '' si no tiene cuenta (filas remotas antiguas). */
  cuentaId: string
  /** '' en las transferencias (no tienen categoría). */
  categoriaId: string
  /** Siempre en soles: es el valor que usan saldos, resúmenes y gráficos. */
  monto: number
  tipo: TipoTransaccion
  fecha: Date
  concepto?: string
  nroOperacion?: string
  origen: OrigenTransaccion
  /** Moneda en que se registró. Ausente = PEN. */
  moneda?: Moneda
  /** Monto en la moneda original (solo si `moneda` ≠ PEN). */
  montoOriginal?: number
  /** Soles por unidad de `moneda` usados para calcular `monto`. */
  tipoCambio?: number
  /** Une las dos patas de una transferencia entre cuentas. */
  transferenciaId?: string
  /** Recurrente que la generó. */
  recurrenteId?: string
  /** Etiquetas libres, en minúsculas y sin '#' (p. ej. 'viaje-cusco'). */
  etiquetas?: string[]
  sincronizado: boolean
  fechaActualizacion: Date
}

export interface Presupuesto extends ControlSync {
  id: string
  usuarioId: string
  categoriaId: string
  montoLimite: number
  /**
   * Mes (1-12) y año desde el que rige. Un presupuesto sigue vigente en
   * los meses siguientes hasta que se defina otro para esa categoría.
   */
  mes: number
  anio: number
}

export interface Aporte {
  id: string
  fecha: Date
  /** Positivo = aporte; negativo = retiro. */
  monto: number
  nota?: string
}

export interface Meta extends ControlSync {
  id: string
  usuarioId: string
  nombre: string
  montoObjetivo: number
  fechaLimite?: Date
  icono: string
  color: string
  aportes: Aporte[]
}

export type TipoDeuda = 'me_deben' | 'debo'

export interface Deuda extends ControlSync {
  id: string
  usuarioId: string
  persona: string
  tipo: TipoDeuda
  monto: number
  concepto?: string
  fecha: Date
  fechaLimite?: Date
  /** Pagos parciales (siempre positivos). */
  abonos: Aporte[]
  /**
   * Viene de dividir un gasto: lo que pagaste por esa persona quedó en la
   * cuenta "Por cobrar" y el cobro se registra como transferencia desde ahí.
   */
  gastoDividido?: boolean
}

export type Frecuencia = 'semanal' | 'quincenal' | 'mensual' | 'anual'

export interface Recurrente extends ControlSync {
  id: string
  usuarioId: string
  tipo: TipoTransaccion
  monto: number
  moneda?: Moneda
  categoriaId: string
  cuentaId: string
  concepto: string
  frecuencia: Frecuencia
  /** Próxima fecha en que se generará la transacción. */
  proximaFecha: Date
  activa: boolean
}

export type TablaSincronizable =
  | 'transacciones'
  | 'categorias'
  | 'cuentas'
  | 'presupuestos'
  | 'metas'
  | 'deudas'
  | 'recurrentes'

/**
 * Registro local de un borrado que falta replicar en Supabase (se procesa
 * en el siguiente ciclo de sincronización).
 */
export interface EliminacionPendiente {
  id?: number
  usuarioId: string
  tabla: TablaSincronizable
  registroId: string
}

type SinControl = 'id' | 'usuarioId' | 'sincronizado' | 'fechaActualizacion'

export type NuevaCategoria = Omit<Categoria, SinControl>
export type NuevaCuenta = Omit<Cuenta, SinControl>
export type NuevoPresupuesto = Omit<Presupuesto, SinControl>
export type NuevaMeta = Omit<Meta, SinControl | 'aportes'>
export type NuevaDeuda = Omit<Deuda, SinControl | 'abonos'>
export type NuevoRecurrente = Omit<Recurrente, SinControl>

export type NuevaTransaccion = Omit<
  Transaccion,
  'id' | 'usuarioId' | 'sincronizado' | 'fechaActualizacion'
>

export interface ResultadoSincronizacion {
  subidas: number
  descargadas: number
  fecha: Date
  /** Archivos de supabase/migraciones/ que aún no se ejecutaron. */
  migracionesPendientes: string[]
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
