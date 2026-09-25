import { lazy, Suspense, useCallback, useMemo, useState } from 'react'
import { useCategorias } from '../hooks/useCategorias'
import { useCuentas } from '../hooks/useCuentas'
import { useDeudas, useMetas, usePresupuestos, useRecurrentes } from '../hooks/usePlanificacion'
import { useTransacciones } from '../hooks/useTransacciones'
import type { Transaccion } from '../types'
import { generarInsights, type Insight } from '../utils/insights'
import { clavePeriodo, resumenPorCategoria, resumenUltimosMeses } from '../utils/analisis'
import Analisis from './Analisis'
import FormularioTransaccion, { type TipoFormulario } from './FormularioTransaccion'
import GestionCategorias from './GestionCategorias'
import GestionCuentas from './GestionCuentas'
import GraficoBarras from './graficos/GraficoBarras'
import GraficoDona from './graficos/GraficoDona'
import ListaTransacciones from './ListaTransacciones'
import Modal from './Modal'
import Planificar, { type PestanaPlanificar } from './planificar/Planificar'
import ResumenFinanciero from './ResumenFinanciero'
import ResumenInteligente from './ResumenInteligente'
import VistaMovimientos from './VistaMovimientos'

// xlsx (usado por YapeImporter) pesa varios cientos de KB: se carga bajo
// demanda para no inflar el bundle inicial ni el precache del Service
// Worker con algo que la mayoría de sesiones nunca usa.
const YapeImporter = lazy(() => import('./YapeImporter'))

interface DashboardProps {
  usuarioId: string
  sincronizarAhora: () => Promise<void>
}

type Seccion = 'inicio' | 'movimientos' | 'analisis' | 'planificar' | 'mas'
type SubseccionMas = 'cuentas' | 'categorias' | 'importar'

const SECCIONES: { id: Seccion; etiqueta: string; icono: string }[] = [
  { id: 'inicio', etiqueta: 'Inicio', icono: 'home' },
  { id: 'movimientos', etiqueta: 'Movimientos', icono: 'list ul' },
  { id: 'analisis', etiqueta: 'Análisis', icono: 'chart bar' },
  { id: 'planificar', etiqueta: 'Planificar', icono: 'compass outline' },
  { id: 'mas', etiqueta: 'Más', icono: 'th large' },
]

const FILTRO_TODAS = 'todas'
const RECIENTES_EN_INICIO = 5
const MESES_TENDENCIA = 6

function Dashboard({ usuarioId, sincronizarAhora }: DashboardProps) {
  const categorias = useCategorias(usuarioId)
  const cuentas = useCuentas(usuarioId)
  const transacciones = useTransacciones(usuarioId)
  const presupuestos = usePresupuestos(usuarioId)
  const metas = useMetas(usuarioId)
  const deudas = useDeudas(usuarioId)
  // Además de listarlos, genera las transacciones recurrentes vencidas.
  const recurrentes = useRecurrentes(usuarioId)

  const [seccion, setSeccion] = useState<Seccion>('inicio')
  const [subseccionMas, setSubseccionMas] = useState<SubseccionMas>('cuentas')
  const [pestanaPlanificar, setPestanaPlanificar] = useState<PestanaPlanificar>('presupuestos')
  /** Movimiento abierto en el modal de edición. */
  const [editando, setEditando] = useState<Transaccion | null>(null)
  /** Registro rápido en modal (p. ej. "Transferir" desde Cuentas). */
  const [registroRapido, setRegistroRapido] = useState<TipoFormulario | null>(null)
  const [cuentaFiltro, setCuentaFiltro] = useState<string>(FILTRO_TODAS)

  const transaccionesFiltradas = useMemo(
    () =>
      cuentaFiltro === FILTRO_TODAS
        ? transacciones
        : transacciones.filter((t) => t.cuentaId === cuentaFiltro),
    [transacciones, cuentaFiltro],
  )

  const tendencia = useMemo(
    () => resumenUltimosMeses(transaccionesFiltradas, MESES_TENDENCIA),
    [transaccionesFiltradas],
  )

  const gastosMesActual = useMemo(() => {
    const claveMes = clavePeriodo(new Date(), 'mes')
    return resumenPorCategoria(
      transaccionesFiltradas.filter((t) => clavePeriodo(t.fecha, 'mes') === claveMes),
      categorias,
      'gasto',
    )
  }, [transaccionesFiltradas, categorias])

  const insights = useMemo(
    () => generarInsights({ transacciones, categorias, cuentas, presupuestos, metas, deudas, recurrentes }),
    [transacciones, categorias, cuentas, presupuestos, metas, deudas, recurrentes],
  )

  const cerrarEdicion = useCallback(() => setEditando(null), [])
  const cerrarRegistroRapido = useCallback(() => setRegistroRapido(null), [])

  function navegarA(destino: NonNullable<Insight['destino']>) {
    const [seccionDestino, sub] = destino.split(':')
    if (seccionDestino === 'planificar') setPestanaPlanificar(sub as PestanaPlanificar)
    if (seccionDestino === 'mas') setSubseccionMas(sub as SubseccionMas)
    setSeccion(seccionDestino as Seccion)
  }

  function irACategorias() {
    setSubseccionMas('categorias')
    setSeccion('mas')
  }

  const nombreMesActual = new Intl.DateTimeFormat('es-PE', { month: 'long' }).format(new Date())

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
      <nav className="nav-principal ui five item labeled icon menu no-imprimir">
        {SECCIONES.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => setSeccion(s.id)}
            className={`item ${seccion === s.id ? 'active' : ''}`}
            aria-current={seccion === s.id ? 'page' : undefined}
          >
            <i className={`${s.icono} icon`} />
            {s.etiqueta}
          </button>
        ))}
      </nav>

      <button
        type="button"
        className="boton-flotante no-imprimir"
        aria-label="Registrar movimiento"
        title="Registrar movimiento"
        onClick={() => setRegistroRapido('gasto')}
      >
        <i className="plus icon" />
      </button>

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

          <ResumenInteligente insights={insights} onNavegar={navegarA} />

          <div className="ui stackable two column grid">
            <div className="column">
              <div className="ui segment altura-completa">
                <h3 className="ui header">
                  <i className="chart bar outline icon" />
                  <div className="content">
                    Últimos {MESES_TENDENCIA} meses
                    <div className="sub header">Ingresos vs. gastos</div>
                  </div>
                </h3>
                <GraficoBarras periodos={tendencia} alto={220} />
              </div>
            </div>
            <div className="column">
              <div className="ui segment altura-completa">
                <h3 className="ui header">
                  <i className="chart pie icon" />
                  <div className="content">
                    Gastos de {nombreMesActual}
                    <div className="sub header">Por categoría</div>
                  </div>
                </h3>
                <GraficoDona datos={gastosMesActual} titulo="Gastos" maxPorciones={5} />
              </div>
            </div>
          </div>

          <ListaTransacciones
            transacciones={transaccionesFiltradas}
            categorias={categorias}
            cuentas={cuentas}
            limite={RECIENTES_EN_INICIO}
            onSeleccionar={setEditando}
            accion={{
              texto: 'Ver todas',
              onClick: () => setSeccion('movimientos'),
            }}
          />
        </>
      )}

      {seccion === 'movimientos' && (
        <VistaMovimientos
          transacciones={transacciones}
          categorias={categorias}
          cuentas={cuentas}
          onSeleccionar={setEditando}
        />
      )}

      {seccion === 'analisis' && (
        <Analisis
          transacciones={transaccionesFiltradas}
          categorias={categorias}
          cuentas={cuentas}
          filtroCuenta={filtroCuenta}
        />
      )}

      {seccion === 'planificar' && (
        <Planificar
          usuarioId={usuarioId}
          pestana={pestanaPlanificar}
          onCambiarPestana={setPestanaPlanificar}
          categorias={categorias}
          cuentas={cuentas}
          transacciones={transacciones}
          presupuestos={presupuestos}
          metas={metas}
          deudas={deudas}
          recurrentes={recurrentes}
        />
      )}

      {seccion === 'mas' && (
        <>
          <div className="ui secondary pointing menu submenu-mas">
            <button
              type="button"
              className={`item ${subseccionMas === 'cuentas' ? 'active' : ''}`}
              onClick={() => setSubseccionMas('cuentas')}
            >
              <i className="wallet icon" />
              Cuentas
            </button>
            <button
              type="button"
              className={`item ${subseccionMas === 'categorias' ? 'active' : ''}`}
              onClick={() => setSubseccionMas('categorias')}
            >
              <i className="tags icon" />
              Categorías
            </button>
            <button
              type="button"
              className={`item ${subseccionMas === 'importar' ? 'active' : ''}`}
              onClick={() => setSubseccionMas('importar')}
            >
              <i className="file excel outline icon" />
              Importar Yape
            </button>
          </div>

          {subseccionMas === 'cuentas' && (
            <GestionCuentas
              usuarioId={usuarioId}
              cuentas={cuentas}
              transacciones={transacciones}
              onTransferir={() => setRegistroRapido('transferencia')}
            />
          )}

          {subseccionMas === 'categorias' && (
            <GestionCategorias
              usuarioId={usuarioId}
              categorias={categorias}
              transacciones={transacciones}
            />
          )}

          {subseccionMas === 'importar' && (
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
      )}

      <Modal
        abierto={editando !== null}
        titulo={editando?.transferenciaId ? 'Editar transferencia' : 'Editar movimiento'}
        icono="pencil alternate"
        onCerrar={cerrarEdicion}
      >
        {editando && (
          <FormularioTransaccion
            key={editando.id}
            usuarioId={usuarioId}
            cuentas={cuentas}
            categorias={categorias}
            transacciones={transacciones}
            transaccion={editando}
            onListo={cerrarEdicion}
          />
        )}
      </Modal>

      <Modal
        abierto={registroRapido !== null}
        titulo="Nuevo movimiento"
        icono="plus circle"
        onCerrar={cerrarRegistroRapido}
      >
        {registroRapido && (
          <FormularioTransaccion
            usuarioId={usuarioId}
            cuentas={cuentas}
            categorias={categorias}
            transacciones={transacciones}
            tipoInicial={registroRapido}
            onListo={cerrarRegistroRapido}
            onGestionarCategorias={() => {
              cerrarRegistroRapido()
              irACategorias()
            }}
          />
        )}
      </Modal>
    </>
  )
}

export default Dashboard
