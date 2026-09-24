import { useMemo } from 'react'
import { useCategorias } from '../hooks/useCategorias'
import { useTransacciones } from '../hooks/useTransacciones'
import { formatearFecha, formatearMoneda } from '../utils/formato'

const LIMITE_VISIBLE = 15

interface ListaTransaccionesProps {
  usuarioId: string
}

function ListaTransacciones({ usuarioId }: ListaTransaccionesProps) {
  const transacciones = useTransacciones(usuarioId)
  const categorias = useCategorias()

  const nombresCategorias = useMemo(
    () => new Map(categorias.map((c) => [c.id, c])),
    [categorias],
  )

  const recientes = transacciones.slice(0, LIMITE_VISIBLE)

  return (
    <section className="rounded-xl border border-slate-800 bg-slate-900">
      <div className="border-b border-slate-800 px-4 py-3">
        <h2 className="text-sm font-semibold text-slate-200">
          Transacciones recientes
        </h2>
      </div>

      {recientes.length === 0 ? (
        <p className="px-4 py-6 text-center text-sm text-slate-500">
          Aún no hay transacciones registradas.
        </p>
      ) : (
        <ul className="divide-y divide-slate-800">
          {recientes.map((t) => {
            const categoria = nombresCategorias.get(t.categoria)
            const esIngreso = t.tipo === 'ingreso'

            return (
              <li
                key={t.id}
                className="flex items-center justify-between gap-3 px-4 py-3"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-800 text-base">
                    {categoria?.icono ?? (esIngreso ? '💰' : '💸')}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-200">
                      {categoria?.nombre ?? 'Sin categoría'}
                    </p>
                    <p className="truncate text-xs text-slate-500">
                      {formatearFecha(t.fecha)}
                      {t.nota ? ` · ${t.nota}` : ''}
                    </p>
                  </div>
                </div>

                <div className="flex shrink-0 flex-col items-end gap-1">
                  <span
                    className={`text-sm font-semibold ${
                      esIngreso ? 'text-emerald-400' : 'text-red-400'
                    }`}
                  >
                    {esIngreso ? '+' : '-'}
                    {formatearMoneda(t.monto)}
                  </span>
                  <span
                    className={`flex items-center gap-1 text-[11px] ${
                      t.sincronizado ? 'text-slate-500' : 'text-amber-400'
                    }`}
                  >
                    <span
                      className={`h-1.5 w-1.5 rounded-full ${
                        t.sincronizado ? 'bg-slate-600' : 'bg-amber-400'
                      }`}
                    />
                    {t.sincronizado ? 'Sincronizado' : 'Pendiente'}
                  </span>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

export default ListaTransacciones
