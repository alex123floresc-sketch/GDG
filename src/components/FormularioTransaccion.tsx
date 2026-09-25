import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { crearTransaccion } from '../services/transaccionService'
import type { Categoria, Cuenta, TipoCuenta, TipoTransaccion } from '../types'

const ICONO_CUENTA: Record<TipoCuenta, string> = {
  efectivo: 'money bill alternate outline',
  banco: 'university',
  billetera_digital: 'mobile alternate',
  otro: 'wallet',
}

interface FormularioTransaccionProps {
  usuarioId: string
  cuentas: Cuenta[]
  categorias: Categoria[]
  onRegistrada?: () => void
  /** Lleva a la pantalla de categorías (para crear una que falte). */
  onGestionarCategorias?: () => void
}

/** Fecha local de hoy en formato `YYYY-MM-DD` (valor de `<input type="date">`). */
function fechaHoy(): string {
  // No usar toISOString(): da la fecha en UTC, que en Perú (UTC-5) ya es
  // "mañana" desde las 7 p. m.
  const hoy = new Date()
  const mes = String(hoy.getMonth() + 1).padStart(2, '0')
  const dia = String(hoy.getDate()).padStart(2, '0')
  return `${hoy.getFullYear()}-${mes}-${dia}`
}

/**
 * Convierte el `YYYY-MM-DD` del input a una fecha local con la hora actual.
 * `new Date('YYYY-MM-DD')` lo interpretaría como medianoche UTC (el día
 * anterior en Perú); la hora actual mantiene el orden de las transacciones
 * registradas el mismo día.
 */
function aFechaLocal(valor: string): Date {
  const [anio, mes, dia] = valor.split('-').map(Number)
  const ahora = new Date()
  return new Date(
    anio,
    mes - 1,
    dia,
    ahora.getHours(),
    ahora.getMinutes(),
    ahora.getSeconds(),
  )
}

function FormularioTransaccion({
  usuarioId,
  cuentas,
  categorias,
  onRegistrada,
  onGestionarCategorias,
}: FormularioTransaccionProps) {
  const [tipo, setTipo] = useState<TipoTransaccion>('gasto')
  const [monto, setMonto] = useState('')
  const [cuentaId, setCuentaId] = useState('')
  const [categoriaId, setCategoriaId] = useState('')
  const [fecha, setFecha] = useState(fechaHoy)
  const [concepto, setConcepto] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Selecciona una cuenta por defecto en cuanto están disponibles.
  useEffect(() => {
    if (!cuentaId && cuentas.length > 0) {
      setCuentaId(cuentas[0].id)
    }
  }, [cuentas, cuentaId])

  const categoriasDisponibles = useMemo(
    () =>
      categorias
        .filter((c) => c.tipo === tipo || c.tipo === 'ambos')
        .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')),
    [categorias, tipo],
  )

  const categoriaSeleccionada = categoriasDisponibles.some(
    (c) => c.id === categoriaId,
  )
    ? categoriaId
    : ''

  const cuentaSeleccionada = cuentas.some((c) => c.id === cuentaId)
    ? cuentaId
    : ''

  async function manejarEnvio(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault()
    setError(null)

    const montoNumerico = Number(monto)

    if (!Number.isFinite(montoNumerico) || montoNumerico <= 0) {
      setError('Ingresa un monto válido mayor a 0.')
      return
    }

    if (!cuentaSeleccionada) {
      setError('Selecciona una cuenta.')
      return
    }

    if (!categoriaSeleccionada) {
      setError('Selecciona una categoría.')
      return
    }

    setEnviando(true)

    try {
      await crearTransaccion(
        {
          monto: montoNumerico,
          tipo,
          cuentaId: cuentaSeleccionada,
          categoriaId: categoriaSeleccionada,
          fecha: aFechaLocal(fecha),
          concepto: concepto.trim() || undefined,
          origen: 'manual',
        },
        usuarioId,
      )

      setMonto('')
      setConcepto('')
      setFecha(fechaHoy())
      onRegistrada?.()
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'No se pudo registrar la transacción.',
      )
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div className="ui segment">
      <h3 className="ui header">
        <i className="plus circle icon" />
        <div className="content">
          Nueva transacción
          <div className="sub header">Registra un ingreso o un gasto</div>
        </div>
      </h3>

      <form
        onSubmit={manejarEnvio}
        className={`ui form ${error ? 'error' : ''}`}
      >
        <div className="selector-tipo ui fluid two buttons field">
          <button
            type="button"
            onClick={() => setTipo('ingreso')}
            className={`ui button ${tipo === 'ingreso' ? 'green' : 'basic'}`}
            aria-pressed={tipo === 'ingreso'}
          >
            <i className="arrow down icon" />
            Ingreso
          </button>
          <button
            type="button"
            onClick={() => setTipo('gasto')}
            className={`ui button ${tipo === 'gasto' ? 'red' : 'basic'}`}
            aria-pressed={tipo === 'gasto'}
          >
            <i className="arrow up icon" />
            Gasto
          </button>
        </div>

        <div className="two fields">
          <div className="required field">
            <label htmlFor="tx-monto">Monto</label>
            <div className="ui left labeled input">
              <span className="ui basic label">S/</span>
              <input
                id="tx-monto"
                type="number"
                inputMode="decimal"
                min="0"
                step="0.01"
                value={monto}
                onChange={(e) => setMonto(e.target.value)}
                placeholder="0.00"
                required
              />
            </div>
          </div>

          <div className="required field">
            <label htmlFor="tx-fecha">Fecha</label>
            <input
              id="tx-fecha"
              type="date"
              value={fecha}
              onChange={(e) => setFecha(e.target.value)}
              required
            />
          </div>
        </div>

        <div className="required field">
          <label id="tx-cuenta">Cuenta</label>
          <div className="selector-cuenta ui fluid buttons" role="radiogroup" aria-labelledby="tx-cuenta">
            {cuentas.map((c) => (
              <button
                key={c.id}
                type="button"
                role="radio"
                aria-checked={cuentaSeleccionada === c.id}
                onClick={() => setCuentaId(c.id)}
                className={`ui button ${cuentaSeleccionada === c.id ? 'primary' : 'basic'}`}
              >
                <i className={`${ICONO_CUENTA[c.tipo]} icon`} />
                {c.nombre}
              </button>
            ))}
          </div>
        </div>

        <div className="required field">
          <label>
            Categoría
            {onGestionarCategorias && (
              <button type="button" className="enlace-lateral" onClick={onGestionarCategorias}>
                <i className="cog icon" />
                Gestionar
              </button>
            )}
          </label>
          <div className="selector-categoria" role="radiogroup" aria-label="Categoría">
            {categoriasDisponibles.map((c) => {
              const activa = categoriaSeleccionada === c.id
              return (
                <button
                  key={c.id}
                  type="button"
                  role="radio"
                  aria-checked={activa}
                  onClick={() => setCategoriaId(c.id)}
                  className={`opcion-categoria ${activa ? 'activa' : ''}`}
                  style={activa ? { borderColor: c.color, background: `${c.color}1a` } : undefined}
                >
                  <span className="icono-circulo" style={{ background: c.color ?? '#898781' }}>
                    <i className={`${c.icono ?? 'tag'} icon`} />
                  </span>
                  <span className="nombre">{c.nombre}</span>
                </button>
              )
            })}
          </div>
        </div>

        <div className="field">
          <label htmlFor="tx-concepto">Concepto (opcional)</label>
          <input
            id="tx-concepto"
            type="text"
            value={concepto}
            onChange={(e) => setConcepto(e.target.value)}
            placeholder="Ej. Almuerzo con el equipo"
            maxLength={140}
          />
        </div>

        {error && (
          <div className="ui error message">
            <p>{error}</p>
          </div>
        )}

        <button
          type="submit"
          disabled={enviando}
          className={`ui fluid primary button ${enviando ? 'loading' : ''}`}
        >
          <i className="save icon" />
          Registrar transacción
        </button>
      </form>
    </div>
  )
}

export default FormularioTransaccion
