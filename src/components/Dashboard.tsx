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

type Seccion = 'inicio' | 'registrar' | 'movimientos' | 'importar'

const SECCIONES: { id: Seccion; etiqueta: string; icono: string }[] = [
  { id: 'inicio', etiqueta: 'Inicio', icono: 'chart pie' },
  { id: 'registrar', etiqueta: 'Registrar', icono: 'plus circle' },
  { id: 'movimientos', etiqueta: 'Movimientos', icono: 'exchange' },
  { id: 'importar', etiqueta: 'Importar', icono: 'file excel outline' },
]

const FILTRO_TODAS = 'todas'
const RECIENTES_EN_INICIO = 5
const LIMITE_MOVIMIENTOS = 50

function Dashboard({ usuarioId, sincronizarAhora }: DashboardProps) {
  const categorias = useCategorias(usuarioId)
  const cuentas = useCuentas(usuarioId)
  const transacciones = useTransacciones(usuarioId)

  const [seccion, setSeccion] = useState<Seccion>('inicio')
  const [cuentaFiltro, setCuentaFiltro] = useState<string>(FILTRO_TODAS)

  const transaccionesFiltradas = useMemo(
    () =>
      cuentaFiltro === FILTRO_TODAS
        ? transacciones
        : transacciones.filter((t) => t.cuentaId === cuentaFiltro),
    [transacciones, cuentaFiltro],
  )

  const filtroCuenta = (
    <div className="ui form">
      <select
        aria-label="Filtrar por cuenta"
        value={cuentaFiltro}
        onChange={(e) => setCuentaFiltro(e.target.value)}
        className="ui compact dropdown"
      >
        <option value={FILTRO_TODAS}>Todas las cuentas</option>
        {cuentas.map((c) => (
          <option key={c.id} value={c.id}>
            {c.nombre}
          </option>
        ))}
      </select>
    </div>
  )

  return (
    <>
      <nav className="nav-principal ui four item labeled icon menu">
        {SECCIONES.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => setSeccion(s.id)}
            className={`item ${seccion === s.id ? 'active teal' : ''}`}
            aria-current={seccion === s.id ? 'page' : undefined}
          >
            <i className={`${s.icono} icon`} />
            {s.etiqueta}
          </button>
        ))}
      </nav>

      {seccion === 'inicio' && (
        <>
          <div className="barra-filtros">
            <h2 className="ui header">
              Resumen
              <div className="sub header">Tus finanzas de un vistazo</div>
            </h2>
            {filtroCuenta}
          </div>

          <ResumenFinanciero transacciones={transaccionesFiltradas} />

          <ListaTransacciones
            transacciones={transaccionesFiltradas}
            categorias={categorias}
            cuentas={cuentas}
            limite={RECIENTES_EN_INICIO}
            accion={{
              texto: 'Ver todas',
              onClick: () => setSeccion('movimientos'),
            }}
          />
        </>
      )}

      {seccion === 'registrar' && (
        <FormularioTransaccion
          usuarioId={usuarioId}
          cuentas={cuentas}
          categorias={categorias}
          onRegistrada={() => setSeccion('inicio')}
        />
      )}

      {seccion === 'movimientos' && (
        <>
          <div className="barra-filtros">
            <h2 className="ui header">Movimientos</h2>
            {filtroCuenta}
          </div>

          <ListaTransacciones
            transacciones={transaccionesFiltradas}
            categorias={categorias}
            cuentas={cuentas}
            titulo="Historial"
            limite={LIMITE_MOVIMIENTOS}
          />
        </>
      )}

      {seccion === 'importar' && (
        <Suspense
          fallback={
            <div className="ui segment">
              <div className="ui active centered inline loader" />
            </div>
          }
        >
          <YapeImporter
            usuarioId={usuarioId}
            cuentas={cuentas}
            categorias={categorias}
            sincronizarAhora={sincronizarAhora}
            onImportado={() => setSeccion('movimientos')}
          />
        </Suspense>
      )}
    </>
  )
}

export default Dashboard
