import { useMemo } from 'react'
import { useTransacciones } from '../hooks/useTransacciones'
import { formatearMoneda } from '../utils/formato'

interface ResumenFinancieroProps {
  usuarioId: string
}

function ResumenFinanciero({ usuarioId }: ResumenFinancieroProps) {
  const transacciones = useTransacciones(usuarioId)

  const { totalIngresos, totalGastos, balance } = useMemo(() => {
    const totalIngresos = transacciones
      .filter((t) => t.tipo === 'ingreso')
      .reduce((suma, t) => suma + t.monto, 0)

    const totalGastos = transacciones
      .filter((t) => t.tipo === 'gasto')
      .reduce((suma, t) => suma + t.monto, 0)

    return {
      totalIngresos,
      totalGastos,
      balance: totalIngresos - totalGastos,
    }
  }, [transacciones])

  return (
    <section className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
        <p className="text-xs font-medium text-slate-400">Total Ingresos</p>
        <p className="mt-1 text-xl font-semibold text-emerald-400">
          {formatearMoneda(totalIngresos)}
        </p>
      </div>

      <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
        <p className="text-xs font-medium text-slate-400">Total Gastos</p>
        <p className="mt-1 text-xl font-semibold text-red-400">
          {formatearMoneda(totalGastos)}
        </p>
      </div>

      <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
        <p className="text-xs font-medium text-slate-400">Balance</p>
        <p
          className={`mt-1 text-xl font-semibold ${
            balance >= 0 ? 'text-slate-100' : 'text-red-400'
          }`}
        >
          {formatearMoneda(balance)}
        </p>
      </div>
    </section>
  )
}

export default ResumenFinanciero
