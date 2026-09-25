import { evaluarExpresion } from '../utils/expresion'

interface TecladoNumericoProps {
  valor: string
  onCambiar: (valor: string) => void
}

const TECLAS = ['7', '8', '9', '⌫', '4', '5', '6', '+', '1', '2', '3', '−', '.', '0', '00', '=']

/** Máximo de caracteres de la expresión (evita montos absurdos por error). */
const MAX_LARGO = 24

/**
 * Teclado numérico en pantalla para escribir montos con un dedo. Admite
 * sumas y restas ("12.50+30"); "=" deja el resultado.
 */
function TecladoNumerico({ valor, onCambiar }: TecladoNumericoProps) {
  function pulsar(tecla: string) {
    navigator.vibrate?.(8)

    if (tecla === '⌫') return onCambiar(valor.slice(0, -1))
    if (tecla === '=') {
      const resultado = evaluarExpresion(valor)
      return onCambiar(resultado === null ? valor : String(resultado))
    }
    if (valor.length >= MAX_LARGO) return

    const operador = tecla === '−' ? '-' : tecla
    const tramo = valor.split(/[+-]/).pop() ?? ''

    if (operador === '+' || operador === '-') {
      // No se empieza con operador ni se encadenan dos seguidos.
      if (!valor || /[+-]$/.test(valor)) return
      return onCambiar(valor + operador)
    }
    if (operador === '.') {
      if (tramo.includes('.')) return
      return onCambiar(valor + (tramo === '' ? '0.' : '.'))
    }
    // Máximo 2 decimales por número.
    if (/\.\d{2}$/.test(tramo)) return
    if (tramo === '0' && operador !== '.') return onCambiar(valor.slice(0, -1) + operador.replace(/^0+/, '0'))
    onCambiar(valor + operador)
  }

  return (
    <div className="teclado-numerico" role="group" aria-label="Teclado numérico">
      {TECLAS.map((t) => (
        <button
          key={t}
          type="button"
          className={`tecla ${/[⌫+−=]/.test(t) ? 'operacion' : ''} ${t === '=' ? 'igual' : ''}`}
          aria-label={t === '⌫' ? 'Borrar' : t === '−' ? 'Menos' : t === '=' ? 'Calcular' : t}
          onClick={() => pulsar(t)}
          onContextMenu={(e) => {
            // Mantener presionado borrar = borrar todo.
            if (t === '⌫') {
              e.preventDefault()
              onCambiar('')
            }
          }}
        >
          {t === '⌫' ? <i className="backspace icon" /> : t}
        </button>
      ))}
    </div>
  )
}

export default TecladoNumerico
