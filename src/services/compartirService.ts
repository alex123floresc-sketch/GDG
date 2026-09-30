import type { Cuenta } from '../types'
import { supabase } from './supabaseClient'

/*
 * Acciones de cuentas compartidas. Necesitan conexión (las decide el
 * servidor con RLS y las funciones de BASE_DE_DATOS.sql, sección 2.4);
 * después se sincroniza para refrescar la copia local
 * (syncService.sincronizarCompartidas).
 */

const RE_CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function cliente() {
  if (!supabase) throw new Error('Compartir necesita la conexión con Supabase.')
  if (!navigator.onLine) throw new Error('Necesitas conexión a internet para esto.')
  return supabase
}

function mensaje(error: { code?: string; message: string }, accion: string): Error {
  if (error.code === '23505') return new Error('Esa persona ya está invitada a esta cuenta.')
  if (error.code === '42501') return new Error('No tienes permiso para esto (¿la cuenta ya se sincronizó?).')
  if (error.code === '23503') return new Error('Esa cuenta aún no llega al servidor. Sincroniza e inténtalo de nuevo.')
  if (error.code === '42P01' || error.code === 'PGRST205' || error.code === 'PGRST202')
    return new Error('Falta ejecutar BASE_DE_DATOS.sql en Supabase para compartir cuentas.')
  return new Error(`${accion}: ${error.message}`)
}

/** El dueño invita a alguien (por correo) a una de sus cuentas. */
export async function invitarACuenta(usuarioId: string, miEmail: string, cuenta: Cuenta, correo: string): Promise<void> {
  const email = correo.trim().toLowerCase()
  if (!RE_CORREO.test(email)) throw new Error('Escribe un correo válido.')
  if (email === miEmail.trim().toLowerCase()) throw new Error('Esa cuenta ya es tuya.')
  if (!cuenta.sincronizado) throw new Error('Espera a que la cuenta se sincronice y vuelve a intentarlo.')
  const { error } = await cliente().from('cuentas_compartidas').insert({
    cuenta_id: cuenta.id,
    user_id: usuarioId,
    cuenta_nombre: cuenta.nombre,
    dueno_email: miEmail.trim().toLowerCase(),
    email,
  })
  if (error) throw mensaje(error, 'No se pudo invitar')
}

/** El dueño quita a una persona (o cancela la invitación). */
export async function quitarDeCuenta(id: string): Promise<void> {
  const { error } = await cliente().from('cuentas_compartidas').delete().eq('id', id)
  if (error) throw mensaje(error, 'No se pudo quitar')
}

export async function aceptarInvitacion(id: string): Promise<void> {
  const { error } = await cliente().rpc('aceptar_invitacion', { p_id: id })
  if (error) throw mensaje(error, 'No se pudo aceptar')
}

/** El invitado rechaza la invitación o deja de ver la cuenta. */
export async function salirDeCuenta(id: string): Promise<void> {
  const { error } = await cliente().rpc('salir_de_cuenta', { p_id: id })
  if (error) throw mensaje(error, 'No se pudo salir')
}

/** Texto para avisarle a la persona invitada (correo, WhatsApp…). */
export function textoInvitacion(cuentaNombre: string, correo: string): string {
  return (
    `Te invité a la cuenta «${cuentaNombre}» en Gestor de Gastos para que registremos juntos. ` +
    `Entra a ${window.location.origin} con tu correo ${correo} y acepta la invitación en Más → Compartir.`
  )
}
