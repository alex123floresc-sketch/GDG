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
    <div className="pantalla-auth">
      <div className="tarjeta">
        <div className="ui raised padded segment">
          <img src="/favicon.svg" alt="" className="logo" />
          <h2 className="ui center aligned header">
            Gestor de Gastos
            <div className="sub header">
              Controla tus finanzas desde cualquier lugar
            </div>
          </h2>

          <div className="ui two item secondary pointing menu">
            <button
              type="button"
              onClick={() => cambiarPestana('login')}
              className={`item ${pestana === 'login' ? 'active teal' : ''}`}
            >
              Iniciar sesión
            </button>
            <button
              type="button"
              onClick={() => cambiarPestana('registro')}
              className={`item ${pestana === 'registro' ? 'active teal' : ''}`}
            >
              Crear cuenta
            </button>
          </div>

          <form
            onSubmit={manejarEnvio}
            className={`ui form ${error ? 'error' : ''} ${mensaje ? 'success' : ''}`}
          >
            <div className="field">
              <label htmlFor="auth-email">Correo electrónico</label>
              <div className="ui left icon input">
                <i className="envelope outline icon" />
                <input
                  id="auth-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="tucorreo@ejemplo.com"
                  autoComplete="email"
                  required
                />
              </div>
            </div>

            <div className="field">
              <label htmlFor="auth-password">Contraseña</label>
              <div className="ui left icon input">
                <i className="lock icon" />
                <input
                  id="auth-password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Mínimo 6 caracteres"
                  autoComplete={
                    pestana === 'login' ? 'current-password' : 'new-password'
                  }
                  minLength={6}
                  required
                />
              </div>
            </div>

            {error && (
              <div className="ui error message">
                <p>{error}</p>
              </div>
            )}

            {mensaje && (
              <div className="ui success message">
                <p>{mensaje}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={cargando}
              className={`ui fluid large teal button ${cargando ? 'loading' : ''}`}
            >
              <i
                className={`${pestana === 'login' ? 'sign in alternate' : 'user plus'} icon`}
              />
              {pestana === 'login' ? 'Iniciar sesión' : 'Crear cuenta'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}

export default Auth
