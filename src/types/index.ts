export type TipoTransaccion = 'ingreso' | 'gasto'

export type TipoCategoria = TipoTransaccion | 'ambos'

export type TipoCuenta =
  | 'efectivo'
  | 'banco'
  | 'billetera_digital'
  | 'tarjeta_credito'
  | 'otro'
  /** Cuenta de sistema de un chanchito "apartado" (ver `Chanchito`). */
  | 'chanchito'

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
  /** Subcategoría: id de la categoría "madre" (un solo nivel). */
  padreId?: string
  /** Regla 50/30/20: necesidad o deseo (solo gastos). Sin valor = se estima. */
  clase?: ClaseGasto
}

export type ClaseGasto = 'necesidad' | 'deseo'

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

/**
 * Chanchito (alcancía), distinto de una Meta: no tiene objetivo ni fecha.
 * - `cuenta`: el dinero se aparta de tus cuentas. Vive en una cuenta de
 *   sistema (tipo 'chanchito'); echar/sacar son transferencias, así que
 *   baja tu saldo disponible pero no cuenta como gasto.
 * - `fisico`: tu alcancía de verdad; solo se anotan los movimientos
 *   (`movimientos`), no toca cuentas.
 */
export type TipoChanchito = 'cuenta' | 'fisico'

/**
 * Reto de ahorro de un chanchito:
 * - `semanas52`: la semana N toca N × montoBase (52 semanas).
 * - `diario`: montoBase cada día durante `duracion` días.
 * - `monedas`: cada vez que guardas una moneda/billete de montoBase.
 * `cumplidos` guarda las claves de lo ya cumplido ('s12', '2026-09-25', …).
 */
export type TipoReto = 'semanas52' | 'diario' | 'monedas'

export interface RetoAhorro {
  tipo: TipoReto
  montoBase: number
  inicio: Date
  /** Solo `diario`: cantidad de días. */
  duracion?: number
  cumplidos: string[]
}

export interface Chanchito extends ControlSync {
  id: string
  usuarioId: string
  nombre: string
  icono: string
  color: string
  tipo: TipoChanchito
  /** Solo `cuenta`: la cuenta de sistema donde está el dinero apartado. */
  cuentaId?: string
  /** Solo `fisico`: lo que metiste (+) o sacaste (−). */
  movimientos: Aporte[]
  reto?: RetoAhorro
  /** Oculto de la lista (se archiva en vez de borrar si tiene historial). */
  archivado?: boolean
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
  /**
   * Día del mes elegido (mensual/anual). Se guarda aparte porque
   * `proximaFecha` puede estar recortada (31 → 30 de abril) y los meses
   * siguientes deben volver al 31. Sin valor = el de `proximaFecha`.
   */
  diaMes?: number
  activa: boolean
}

/**
 * Regla de categorización automática: si el concepto de un movimiento
 * contiene `patron` (sin distinguir mayúsculas ni tildes), se le asigna
 * `categoriaId` (y, si se indica, la cuenta y las etiquetas).
 */
export interface Regla extends ControlSync {
  id: string
  usuarioId: string
  patron: string
  categoriaId: string
  /** Solo aplica a gastos o a ingresos; sin valor = a ambos. */
  tipo?: TipoTransaccion
  cuentaId?: string
  etiquetas?: string[]
}

/**
 * Plantilla de registro rápido ("Café", "Pasaje"…): rellena el formulario o
 * registra el movimiento de un toque.
 */
export interface Plantilla extends ControlSync {
  id: string
  usuarioId: string
  nombre: string
  tipo: TipoTransaccion
  /** Sin monto = se pregunta cada vez. */
  monto?: number
  moneda?: Moneda
  categoriaId: string
  cuentaId: string
  concepto?: string
  etiquetas?: string[]
  /** Orden en la lista (menor primero). */
  orden?: number
}

/**
 * Compra en cuotas (normalmente con tarjeta de crédito).
 * - `total`: se registró un gasto por el monto total el día de la compra
 *   (`transaccionId`); las cuotas solo se siguen.
 * - `por_cuota`: cada cuota se registra como gasto en su fecha
 *   (origen 'recurrente', `recurrenteId` = id de la compra).
 */
export type ModoCuotas = 'total' | 'por_cuota'

export interface CompraCuotas extends ControlSync {
  id: string
  usuarioId: string
  descripcion: string
  cuentaId: string
  categoriaId: string
  /** Precio de la compra (en soles). */
  montoTotal: number
  numeroCuotas: number
  /** Lo que se paga cada mes (incluye intereses). */
  montoCuota: number
  fechaCompra: Date
  /** Fecha de la primera cuota; las demás, el mismo día de los meses siguientes. */
  primeraCuota: Date
  modo: ModoCuotas
  /** Gasto por el total (modo `total`). */
  transaccionId?: string
  /** Modo `por_cuota`: cuántas cuotas ya se registraron como gasto. */
  cuotasGeneradas?: number
}

/** De dónde sale el fondo de emergencia. */
export type OrigenFondo = 'liquido' | 'cuenta' | 'meta' | 'chanchito'

/**
 * Preferencias del usuario que se sincronizan (una fila por usuario,
 * `id` = `usuarioId`). Las del dispositivo van en utils/preferencias.ts.
 */
export interface Ajustes extends ControlSync {
  id: string
  usuarioId: string
  /** Meses de gastos que debe cubrir el fondo de emergencia (por defecto 6). */
  fondoMeses?: number
  fondoOrigen?: OrigenFondo
  /** Cuenta, meta o chanchito elegido como fondo (según `fondoOrigen`). */
  fondoId?: string
  /** Porcentajes de la regla 50/30/20 (necesidades/deseos/ahorro). */
  reparto?: { necesidades: number; deseos: number; ahorro: number }
  /** Para expresar gastos en horas de trabajo. */
  ingresoMensual?: number
  horasSemana?: number
  /** Suscripciones detectadas que el usuario descartó (clave normalizada). */
  suscripcionesIgnoradas?: string[]
}

export type TablaSincronizable =
  | 'transacciones'
  | 'categorias'
  | 'cuentas'
  | 'presupuestos'
  | 'metas'
  | 'deudas'
  | 'recurrentes'
  | 'chanchitos'
  | 'reglas'
  | 'plantillas'
  | 'ajustes'
  | 'cuotas'

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
export type NuevaCompraCuotas = Omit<CompraCuotas, SinControl | 'transaccionId' | 'cuotasGeneradas'>
export type NuevaRegla = Omit<Regla, SinControl>
export type NuevaPlantilla = Omit<Plantilla, SinControl>
export type NuevoChanchito = Pick<Chanchito, 'nombre' | 'icono' | 'color' | 'tipo' | 'reto'>

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
