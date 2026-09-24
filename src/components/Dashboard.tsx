import { lazy, Suspense, useMemo, useState } from 'react'
import { useCategorias } from '../hooks/useCategorias'
import { useCuentas } from '../hooks/useCuentas'
import { useTransacciones } from '../hooks/useTransacciones'
import FormularioTransaccion from './FormularioTransaccion'
import ListaTransacciones from './ListaTransacciones'
import ResumenFinanciero from './ResumenFinanciero'

// xlsx (usado por YapeImporter) pesa varios cientos de KB: se carga bajo
// demanda para no inflar el bundle inicial ni el precache del Service
// Worker con algo que la mayoría de sesiones nunca usa.
const YapeImporter = lazy(() => import('./YapeImporter'))

interface DashboardProps {
  usuarioId: string
  sincronizarAhora: () => Promise<void>
}

const FILTRO_TODAS = 'todas'

function Dashboard({ usuarioId, sincronizarAhora }: DashboardProps) {
  const categorias = useCategorias(usuarioId)
  const cuentas = useCuentas(usuarioId)
  const transacciones = useTransacciones(usuarioId)

  const [cuentaFiltro, setCuentaFiltro] = useState<string>(FILTRO_TODAS)
  const [mostrarImportador, setMostrarImportador] = useState(false)

  const transaccionesFiltradas = useMemo(
    () =>
      cuentaFiltro === FILTRO_TODAS
        ? transacciones
        : transacciones.filter((t) => t.cuentaId === cuentaFiltro),
    [transacciones, cuentaFiltro],
  )

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <label className="flex items-center gap-2 text-sm">
          <span className="text-xs font-medium text-slate-400">Cuenta:</span>
          <select
            value={cuentaFiltro}
            onChange={(e) => setCuentaFiltro(e.target.value)}
            className="rounded-lg border border-slate-700 bg-slate-900 px-2 py-1.5 text-sm text-slate-200 outline-none focus:border-sky-500"
          >
            <option value={FILTRO_TODAS}>Todas</option>
            {cuentas.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre}
              </option>
            ))}
          </select>
        </label>

        <button
          type="button"
          onClick={() => setMostrarImportador((v) => !v)}
          className="rounded-lg border border-slate-700 px-3 py-1.5 text-sm font-medium text-slate-300 transition hover:border-sky-500/50 hover:text-sky-300"
        >
          {mostrarImportador ? 'Cerrar importador' : '📥 Importar Excel de Yape'}
        </button>
      </div>

      {mostrarImportador && (
        <Suspense
          fallback={
            <div className="rounded-xl border border-slate-800 bg-slate-900 p-4 text-sm text-slate-400">
              Cargando importador...
            </div>
          }
        >
          <YapeImporter
            usuarioId={usuarioId}
            cuentas={cuentas}
            categorias={categorias}
            sincronizarAhora={sincronizarAhora}
            onImportado={() => setMostrarImportador(false)}
          />
        </Suspense>
      )}

      <ResumenFinanciero transacciones={transaccionesFiltradas} />

      <FormularioTransaccion
        usuarioId={usuarioId}
        cuentas={cuentas}
        categorias={categorias}
      />

      <ListaTransacciones
        transacciones={transaccionesFiltradas}
        categorias={categorias}
        cuentas={cuentas}
      />
    </div>
  )
}

export default Dashboard
