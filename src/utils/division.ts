import type { ParticipanteDivision } from '../services/divisionService'

export interface EstadoDivision {
  activa: boolean
  modo: 'iguales' | 'montos'
  personas: { nombre: string; monto: string }[]
}

export const DIVISION_INICIAL: EstadoDivision = {
  activa: false,
  modo: 'iguales',
  personas: [{ nombre: '', monto: '' }],
}

/** Partes de los demás según el modo (el resto es tu parte). */
export function calcularParticipantes(estado: EstadoDivision, total: number): ParticipanteDivision[] {
  if (estado.modo === 'iguales') {
    const n = estado.personas.length + 1
    const parte = Math.floor((total / n) * 100) / 100
    return estado.personas.map((p) => ({ persona: p.nombre, monto: parte }))
  }
  return estado.personas.map((p) => ({ persona: p.nombre, monto: Number(p.monto) || 0 }))
}
