import { useMemo, useState, type FormEvent } from 'react'
import { useCategorias } from '../hooks/useCategorias'
import { crearTransaccion } from '../services/transaccionService'
import type { TipoTransaccion } from '../types'

function fechaHoy(): string {
  return new Date().toISOString().slice(0, 10)
}

interface FormularioTransaccionProps {
  usuarioId: string
}

function FormularioTransaccion({ usuarioId }: FormularioTransaccionProps) {
  const categorias = useCategorias()

  const [tipo, setTipo] = useState<TipoTransaccion>('gasto')
  const [monto, setMonto] = useState('')
  const [categoriaId, setCategoriaId] = useState('')
  const [fecha, setFecha] = useState(fechaHoy)
  const [nota, setNota] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const categoriasDisponibles = useMemo(
    () => categorias.filter((c) => c.tipo === tipo || c.tipo === 'ambos'),
    [categorias, tipo],
  )

  const categoriaSeleccionada = categoriasDisponibles.some(
    (c) => c.id === categoriaId,
  )
    ? categoriaId
    : ''

  async function manejarEnvio(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault()
    setError(null)

    const montoNumerico = Number(monto)

    if (!Number.isFinite(montoNumerico) || montoNumerico <= 0) {
      setError('Ingresa un monto válido mayor a 0.')
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
          categoria: categoriaSeleccionada,
          fecha: new Date(fecha),
          nota: nota.trim() || undefined,
        },
        usuarioId,
      )

      setMonto('')
      setNota('')
      setFecha(fechaHoy())
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'No se pudo registrar la transacción.',
      )
    } finally {
      setEnviando(false)
    }
  }

  return (
    <form
      onSubmit={manejarEnvio}
      className="space-y-4 rounded-xl border border-slate-800 bg-slate-900 p-4"
    >
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => setTipo('ingreso')}
          className={`rounded-lg py-2 text-sm font-medium transition ${
            tipo === 'ingreso'
              ? 'bg-emerald-500/15 text-emerald-300 ring-1 ring-inset ring-emerald-500/40'
              : 'bg-slate-800 text-slate-400 hover:text-slate-200'
          }`}
        >
          Ingreso
        </button>
        <button
          type="button"
          onClick={() => setTipo('gasto')}
          className={`rounded-lg py-2 text-sm font-medium transition ${
            tipo === 'gasto'
              ? 'bg-red-500/15 text-red-300 ring-1 ring-inset ring-red-500/40'
              : 'bg-slate-800 text-slate-400 hover:text-slate-200'
          }`}
        >
          Gasto
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <label className="col-span-1 flex flex-col gap-1 text-sm text-slate-300">
          Monto
          <input
            type="number"
            inputMode="decimal"
            min="0"
            step="0.01"
            value={monto}
            onChange={(e) => setMonto(e.target.value)}
            placeholder="0.00"
            className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100 outline-none focus:border-sky-500"
            required
          />
        </label>

        <label className="col-span-1 flex flex-col gap-1 text-sm text-slate-300">
          Fecha
          <input
            type="date"
            value={fecha}
            onChange={(e) => setFecha(e.target.value)}
            className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100 outline-none focus:border-sky-500"
            required
          />
        </label>

        <label className="col-span-2 flex flex-col gap-1 text-sm text-slate-300">
          Categoría
          <select
            value={categoriaSeleccionada}
            onChange={(e) => setCategoriaId(e.target.value)}
            className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100 outline-none focus:border-sky-500"
            required
          >
            <option value="" disabled>
              Selecciona una categoría
            </option>
            {categoriasDisponibles.map((c) => (
              <option key={c.id} value={c.id}>
                {c.icono ? `${c.icono} ` : ''}
                {c.nombre}
              </option>
            ))}
          </select>
        </label>

        <label className="col-span-2 flex flex-col gap-1 text-sm text-slate-300">
          Nota (opcional)
          <input
            type="text"
            value={nota}
            onChange={(e) => setNota(e.target.value)}
            placeholder="Ej. Almuerzo con el equipo"
            maxLength={140}
            className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100 outline-none focus:border-sky-500"
          />
        </label>
      </div>

      {error && <p className="text-sm text-red-400">{error}</p>}

      <button
        type="submit"
        disabled={enviando}
        className="w-full rounded-lg bg-sky-500 py-2 text-sm font-semibold text-white transition hover:bg-sky-400 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {enviando ? 'Guardando...' : 'Registrar transacción'}
      </button>
    </form>
  )
}

export default FormularioTransaccion
