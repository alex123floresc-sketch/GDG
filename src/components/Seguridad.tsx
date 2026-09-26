import { useState, type FormEvent } from 'react'
import { useAvisos } from '../hooks/useAvisos'
import {
  cambiarTiempoBloqueo,
  guardarPin,
  minutosParaBloquear,
  pinActivo,
  quitarPin,
  validarFormatoPin,
  verificarPin,
} from '../utils/pin'

const OPCIONES_TIEMPO = [
  { minutos: 0, etiqueta: 'Siempre que salgas de la app' },
  { minutos: 1, etiqueta: 'Tras 1 minuto fuera' },
  { minutos: 5, etiqueta: 'Tras 5 minutos fuera' },
  { minutos: 15, etiqueta: 'Tras 15 minutos fuera' },
]

type Modo = 'ver' | 'activar' | 'cambiar' | 'quitar'

/** Configuración del bloqueo con PIN de este dispositivo. */
function Seguridad() {
  const { avisar } = useAvisos()
  const [activo, setActivo] = useState(pinActivo)
  const [minutos, setMinutos] = useState(minutosParaBloquear)
  const [modo, setModo] = useState<Modo>('ver')
  const [actual, setActual] = useState('')
  const [nuevo, setNuevo] = useState('')
  const [repetido, setRepetido] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)

  function cambiarModo(m: Modo) {
    setModo(m)
    setActual('')
    setNuevo('')
    setRepetido('')
    setError(null)
  }

  async function manejarEnvio(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setGuardando(true)
    try {
      if (modo !== 'activar' && !(await verificarPin(actual))) {
        throw new Error('El PIN actual no es correcto.')
      }
      if (modo === 'quitar') {
        quitarPin()
        setActivo(false)
        avisar('Bloqueo con PIN desactivado')
      } else {
        const errorFormato = validarFormatoPin(nuevo)
        if (errorFormato) throw new Error(errorFormato)
        if (nuevo !== repetido) throw new Error('Los dos PIN no coinciden.')
        await guardarPin(nuevo, minutos)
        setActivo(true)
        avisar(modo === 'activar' ? 'Bloqueo con PIN activado' : 'PIN cambiado')
      }
      cambiarModo('ver')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar el PIN.')
    } finally {
      setGuardando(false)
    }
  }

  function campoPin(id: string, etiqueta: string, valor: string, setValor: (v: string) => void) {
    return (
      <div className="field">
        <label htmlFor={id}>{etiqueta}</label>
        <input
          id={id}
          type="password"
          inputMode="numeric"
          autoComplete="off"
          maxLength={6}
          pattern="\d*"
          className="campo-pin"
          value={valor}
          onChange={(e) => setValor(e.target.value.replace(/\D/g, ''))}
        />
      </div>
    )
  }

  return (
    <div className="ui segment">
      <h3 className="ui header">
        <i className="lock icon" />
        <div className="content">
          Bloqueo con PIN
          <div className="sub header">
            Pide un PIN de 4 a 6 números al abrir la app en este dispositivo.
          </div>
        </div>
      </h3>

      <p className="texto-suave">
        Es una barrera para que nadie vea tus finanzas si toma tu celular desbloqueado; no cifra
        los datos. Solo aplica a este dispositivo. Si lo olvidas, puedes cerrar sesión y volver a
        entrar con tu contraseña.
      </p>

      {modo === 'ver' ? (
        activo ? (
          <>
            <div className="ui form">
              <div className="field">
                <label htmlFor="tiempo-bloqueo">Volver a pedir el PIN</label>
                <select
                  id="tiempo-bloqueo"
                  className="ui dropdown"
                  value={minutos}
                  onChange={(e) => {
                    const m = Number(e.target.value)
                    setMinutos(m)
                    cambiarTiempoBloqueo(m)
                  }}
                >
                  {OPCIONES_TIEMPO.map((o) => (
                    <option key={o.minutos} value={o.minutos}>
                      {o.etiqueta}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="botones-seguridad">
              <button type="button" className="ui basic button" onClick={() => cambiarModo('cambiar')}>
                <i className="key icon" />
                Cambiar PIN
              </button>
              <button type="button" className="ui basic red button" onClick={() => cambiarModo('quitar')}>
                <i className="lock open icon" />
                Desactivar
              </button>
            </div>
          </>
        ) : (
          <button type="button" className="ui primary button" onClick={() => cambiarModo('activar')}>
            <i className="lock icon" />
            Activar bloqueo con PIN
          </button>
        )
      ) : (
        <form className="ui form formulario-pin" onSubmit={manejarEnvio}>
          {modo !== 'activar' && campoPin('pin-actual', 'PIN actual', actual, setActual)}
          {modo !== 'quitar' && (
            <>
              {campoPin('pin-nuevo', modo === 'activar' ? 'PIN' : 'PIN nuevo', nuevo, setNuevo)}
              {campoPin('pin-repetido', 'Repite el PIN', repetido, setRepetido)}
            </>
          )}
          {modo === 'activar' && (
            <div className="field">
              <label htmlFor="tiempo-bloqueo-nuevo">Volver a pedir el PIN</label>
              <select
                id="tiempo-bloqueo-nuevo"
                className="ui dropdown"
                value={minutos}
                onChange={(e) => setMinutos(Number(e.target.value))}
              >
                {OPCIONES_TIEMPO.map((o) => (
                  <option key={o.minutos} value={o.minutos}>
                    {o.etiqueta}
                  </option>
                ))}
              </select>
            </div>
          )}

          {error && (
            <div className="ui visible negative message" role="alert">
              {error}
            </div>
          )}

          <button
            type="submit"
            className={`ui ${modo === 'quitar' ? 'red' : 'primary'} button ${guardando ? 'loading' : ''}`}
            disabled={guardando}
          >
            {modo === 'activar' ? 'Activar' : modo === 'cambiar' ? 'Guardar PIN' : 'Desactivar PIN'}
          </button>
          <button type="button" className="ui basic button" onClick={() => cambiarModo('ver')}>
            Cancelar
          </button>
        </form>
      )}
    </div>
  )
}

export default Seguridad
