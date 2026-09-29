import type { Ajustes, SeccionInicio } from '../types'

/** Secciones de Inicio (debajo de la tarjeta principal), en su orden por defecto. */
export const SECCIONES_INICIO: { id: SeccionInicio; nombre: string; icono: string }[] = [
  { id: 'plantillas', nombre: 'Plantillas rápidas', icono: 'bolt' },
  { id: 'cuentas', nombre: 'Tus cuentas', icono: 'wallet' },
  { id: 'hoy', nombre: 'Hoy puedes gastar y salud', icono: 'calendar day' },
  { id: 'insights', nombre: 'Resumen inteligente', icono: 'lightbulb outline' },
  { id: 'planes', nombre: 'Presupuestos y metas', icono: 'chart pie' },
  { id: 'graficos', nombre: 'Gráficos del mes', icono: 'chart bar' },
  { id: 'movimientos', nombre: 'Últimos movimientos', icono: 'list ul' },
]

/** Orden elegido (las que falten van al final) sin las ocultas. */
export function ordenInicio(ajustes: Ajustes, incluirOcultas = false): SeccionInicio[] {
  const todas = SECCIONES_INICIO.map((s) => s.id)
  const elegido = (ajustes.inicio?.orden ?? []).filter((id) => todas.includes(id))
  const orden = [...elegido, ...todas.filter((id) => !elegido.includes(id))]
  const ocultas = new Set(ajustes.inicio?.ocultas ?? [])
  return incluirOcultas ? orden : orden.filter((id) => !ocultas.has(id))
}
