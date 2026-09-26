import { useEffect, useRef, useState, type FormEvent } from 'react'
import { esperaRestante, verificarPin } from '../utils/pin'

interface BloqueoPinProps {
  email: string
  onDesbloquear: () => void
  onCerrarSesion: () => Promise<void>
}

/**
 * Pantalla que tapa la app hasta que se ingresa el PIN del dispositivo.
 * Si se olvidó, la salida es cerrar sesión (los datos están en Supabase).
 */
function BloqueoPin({ email, onDesbloquear, onCerrarSesion }: BloqueoPinProps) {
  const [pin, setPin] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [verificando, setVerificando] = useState(false)
  const [espera, setEspera] = useState(esperaRestante)
  const [confirmarSalida, setConfirmarSalida] = useState(false)
  const campo = useRef<HTMLInputElement>(null)

  // Cuenta regresiva tras demasiados intentos fallidos.
  useEffect(() => {
    if (espera <= 0) return
    const id = setInterval(() => setEspera(esperaRestante()), 1000)
    return () => clearInterval(id)
  }, [espera])

  useEffect(() => {
    if (espera <= 0) campo.current?.focus()
  }, [espera])

  async function manejarEnvio(e: FormEvent) {
    e.preventDefault()
    if (!pin || verificando) return
    setVerificando(true)
    const correcto = await verificarPin(pin)
    setVerificando(false)
    if (correcto) {
      onDesbloquear()
      return
    }
    setPin('')
    const restante = esperaRestante()
    setEspera(restante)
    setError(restante > 0 ? 'Demasiados intentos.' : 'PIN incorrecto.')
  }

  const segundos = Math.ceil(espera / 1000)

  return (
    <div className="pantalla-auth">
      <div className="ui segment tarjeta bloqueo-pin">
        <img src="/favicon.svg" alt="" className="logo" />
        <h2 className="ui center aligned header">
          <i className="lock icon" />
          <div className="content">
            Gestor de Gastos
            <div className="sub header">{email}</div>
          </div>
        </h2>

        <form className="ui form" onSubmit={manejarEnvio}>
          <div className="field">
            <label htmlFor="pin-desbloqueo">Ingresa tu PIN</label>
            <input
              id="pin-desbloqueo"
              ref={campo}
              type="password"
              inputMode="numeric"
              autoComplete="off"
              maxLength={6}
              pattern="\d*"
              className="campo-pin"
              value={pin}
              disabled={espera > 0}
              onChange={(e) => {
                setPin(e.target.value.replace(/\D/g, ''))
                setError(null)
              }}
            />
          </div>

          {(error || espera > 0) && (
            <div className="ui visible negative message" role="alert">
              {error ?? 'Demasiados intentos.'}
              {espera > 0 && ` Espera ${segundos} s para volver a intentar.`}
            </div>
          )}

          <button
            type="submit"
            className={`ui fluid primary button ${verificando ? 'loading' : ''}`}
            disabled={pin.length < 4 || espera > 0 || verificando}
          >
            <i className="unlock icon" />
            Desbloquear
          </button>
        </form>

        {confirmarSalida ? (
          <div className="ui visible warning message salida-pin">
            <p>
              Se cerrará la sesión y se quitará el PIN de este dispositivo. Lo que no se haya
              sincronizado se intentará subir antes de salir.
            </p>
            <button type="button" className="ui small red button" onClick={() => void onCerrarSesion()}>
              Cerrar sesión
            </button>
            <button type="button" className="ui small basic button" onClick={() => setConfirmarSalida(false)}>
              Cancelar
            </button>
          </div>
        ) : (
          <button type="button" className="ui fluid basic button salida-pin" onClick={() => setConfirmarSalida(true)}>
            Olvidé mi PIN
          </button>
        )}
      </div>
    </div>
  )
}

export default BloqueoPin
