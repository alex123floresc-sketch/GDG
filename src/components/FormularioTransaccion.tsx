import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { crearTransaccion } from '../services/transaccionService'
import type { Categoria, Cuenta, TipoTransaccion } from '../types'

interface FormularioTransaccionProps {
  usuarioId: string
  cuentas: Cuenta[]
  categorias: Categoria[]
  onRegistrada?: () => void
}

function fechaHoy(): string {
  return new Date().toISOString().slice(0, 10)
}

function FormularioTransaccion({
  usuarioId,
  cuentas,
  categorias,
  onRegistrada,
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
    () => categorias.filter((c) => c.tipo === tipo || c.tipo === 'ambos'),
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
          fecha: new Date(fecha),
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
          >
            <i className="arrow down icon" />
            Ingreso
          </button>
          <button
            type="button"
            onClick={() => setTipo('gasto')}
            className={`ui button ${tipo === 'gasto' ? 'red' : 'basic'}`}
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

        <div className="two fields">
          <div className="required field">
            <label htmlFor="tx-cuenta">Cuenta</label>
            <select
              id="tx-cuenta"
              value={cuentaSeleccionada}
              onChange={(e) => setCuentaId(e.target.value)}
              className="ui fluid dropdown"
              required
            >
              <option value="" disabled>
                Selecciona una cuenta
              </option>
              {cuentas.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                </option>
              ))}
            </select>
          </div>

          <div className="required field">
            <label htmlFor="tx-categoria">Categoría</label>
            <select
              id="tx-categoria"
              value={categoriaSeleccionada}
              onChange={(e) => setCategoriaId(e.target.value)}
              className="ui fluid dropdown"
              required
            >
              <option value="" disabled>
                Selecciona una categoría
              </option>
              {categoriasDisponibles.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                </option>
              ))}
            </select>
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
          className={`ui fluid teal button ${enviando ? 'loading' : ''}`}
        >
          <i className="save icon" />
          Registrar transacción
        </button>
      </form>
    </div>
  )
}

export default FormularioTransaccion
