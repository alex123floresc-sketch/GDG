import { useMemo } from 'react'
import type { Categoria, Cuenta, Transaccion } from '../types'
import { formatearFecha, formatearMoneda } from '../utils/formato'

interface ListaTransaccionesProps {
  transacciones: Transaccion[]
  categorias: Categoria[]
  cuentas: Cuenta[]
}

const LIMITE_VISIBLE = 15

function ListaTransacciones({
  transacciones,
  categorias,
  cuentas,
}: ListaTransaccionesProps) {
  const nombresCategorias = useMemo(
    () => new Map(categorias.map((c) => [c.id, c])),
    [categorias],
  )

  const nombresCuentas = useMemo(
    () => new Map(cuentas.map((c) => [c.id, c.nombre])),
    [cuentas],
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
            const categoria = nombresCategorias.get(t.categoriaId)
            const nombreCuenta = nombresCuentas.get(t.cuentaId)
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
                      {nombreCuenta ? ` · ${nombreCuenta}` : ''}
                      {t.concepto ? ` · ${t.concepto}` : ''}
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
                  <div className="flex items-center gap-1.5">
                    {t.origen === 'yape' && (
                      <span className="rounded bg-purple-500/10 px-1.5 py-0.5 text-[10px] font-medium text-purple-300">
                        Yape
                      </span>
                    )}
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
