import { useState, type FormEvent } from 'react'
import { supabase } from '../services/supabaseClient'

type Pestana = 'login' | 'registro'

function traducirErrorAuth(err: unknown): string {
  const mensaje = err instanceof Error ? err.message : ''

  if (mensaje.includes('Invalid login credentials')) {
    return 'Correo o contraseña incorrectos.'
  }
  if (mensaje.includes('User already registered')) {
    return 'Ya existe una cuenta con ese correo. Intenta iniciar sesión.'
  }
  if (mensaje.includes('Password should be at least')) {
    return 'La contraseña debe tener al menos 6 caracteres.'
  }
  if (mensaje.includes('Unable to validate email address')) {
    return 'El formato del correo no es válido.'
  }

  return mensaje || 'Ocurrió un error inesperado. Intenta nuevamente.'
}

function Auth() {
  const [pestana, setPestana] = useState<Pestana>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [mensaje, setMensaje] = useState<string | null>(null)

  function cambiarPestana(nueva: Pestana) {
    setPestana(nueva)
    setError(null)
    setMensaje(null)
  }

  async function manejarEnvio(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault()
    setError(null)
    setMensaje(null)

    if (!supabase) {
      setError(
        'Supabase no está configurado: define VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY en .env.local.',
      )
      return
    }

    if (password.length < 6) {
      setError('La contraseña debe tener al menos 6 caracteres.')
      return
    }

    setCargando(true)

    try {
      if (pestana === 'login') {
        const { error: errorAuth } = await supabase.auth.signInWithPassword({
          email,
          password,
        })
        if (errorAuth) throw errorAuth
      } else {
        const { data, error: errorAuth } = await supabase.auth.signUp({
          email,
          password,
        })
        if (errorAuth) throw errorAuth

        if (!data.session) {
          setMensaje(
            'Cuenta creada. Revisa tu correo para confirmar la cuenta y luego inicia sesión.',
          )
          setPestana('login')
        }
      }
    } catch (err) {
      setError(traducirErrorAuth(err))
    } finally {
      setCargando(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950 px-4 text-slate-100">
      <div className="w-full max-w-sm rounded-xl border border-slate-800 bg-slate-900 p-6">
        <h1 className="mb-1 text-center text-lg font-semibold">
          Gestor de Gastos
        </h1>
        <p className="mb-6 text-center text-sm text-slate-500">
          Controla tus finanzas desde cualquier lugar
        </p>

        <div className="mb-5 grid grid-cols-2 gap-2 rounded-lg bg-slate-800 p-1">
          <button
            type="button"
            onClick={() => cambiarPestana('login')}
            className={`rounded-md py-2 text-sm font-medium transition ${
              pestana === 'login'
                ? 'bg-slate-950 text-slate-100'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Iniciar sesión
          </button>
          <button
            type="button"
            onClick={() => cambiarPestana('registro')}
            className={`rounded-md py-2 text-sm font-medium transition ${
              pestana === 'registro'
                ? 'bg-slate-950 text-slate-100'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Crear cuenta
          </button>
        </div>

        <form onSubmit={manejarEnvio} className="space-y-4">
          <label className="flex flex-col gap-1 text-sm text-slate-300">
            Correo electrónico
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="tucorreo@ejemplo.com"
              autoComplete="email"
              className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100 outline-none focus:border-sky-500"
              required
            />
          </label>

          <label className="flex flex-col gap-1 text-sm text-slate-300">
            Contraseña
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Mínimo 6 caracteres"
              autoComplete={
                pestana === 'login' ? 'current-password' : 'new-password'
              }
              minLength={6}
              className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100 outline-none focus:border-sky-500"
              required
            />
          </label>

          {error && (
            <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
              {error}
            </p>
          )}

          {mensaje && (
            <p className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-300">
              {mensaje}
            </p>
          )}

          <button
            type="submit"
            disabled={cargando}
            className="w-full rounded-lg bg-sky-500 py-2 text-sm font-semibold text-white transition hover:bg-sky-400 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {cargando
              ? 'Procesando...'
              : pestana === 'login'
                ? 'Iniciar sesión'
                : 'Crear cuenta'}
          </button>
        </form>
      </div>
    </div>
  )
}

export default Auth
