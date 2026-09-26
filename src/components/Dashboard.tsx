import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import { useCategorias } from '../hooks/useCategorias'
import { useCuentas } from '../hooks/useCuentas'
import { useDeudas, useMetas, usePresupuestos, useRecurrentes } from '../hooks/usePlanificacion'
import { useTransacciones } from '../hooks/useTransacciones'
import type { Transaccion } from '../types'
import { generarInsights, type Insight } from '../utils/insights'
import SeccionAnalisis, { type PestanaAnalisis } from './analisis/SeccionAnalisis'
import FormularioTransaccion, { type TipoFormulario } from './FormularioTransaccion'
import GestionCategorias from './GestionCategorias'
import GestionCuentas from './GestionCuentas'
import Seguridad from './Seguridad'
import Inicio from './Inicio'
import Modal from './Modal'
import Planificar, { type PestanaPlanificar } from './planificar/Planificar'
import VistaMovimientos from './VistaMovimientos'

// xlsx (usado por YapeImporter) pesa varios cientos de KB: se carga bajo
// demanda para no inflar el bundle inicial ni el precache del Service
// Worker con algo que la mayoría de sesiones nunca usa.
const YapeImporter = lazy(() => import('./YapeImporter'))

interface DashboardProps {
  usuarioId: string
  email: string
  sincronizarAhora: () => Promise<void>
}

type Seccion = 'inicio' | 'movimientos' | 'analisis' | 'planificar' | 'mas'
type SubseccionMas = 'cuentas' | 'categorias' | 'importar' | 'seguridad'
type Destino = NonNullable<Insight['destino']> | 'movimientos'

const SECCIONES: { id: Seccion; etiqueta: string; icono: string }[] = [
  { id: 'inicio', etiqueta: 'Inicio', icono: 'home' },
  { id: 'movimientos', etiqueta: 'Movimientos', icono: 'list ul' },
  { id: 'analisis', etiqueta: 'Análisis', icono: 'chart bar' },
  { id: 'planificar', etiqueta: 'Planificar', icono: 'compass outline' },
  { id: 'mas', etiqueta: 'Más', icono: 'th large' },
]

const SUBSECCIONES_MAS: { id: SubseccionMas; etiqueta: string; icono: string }[] = [
  { id: 'cuentas', etiqueta: 'Cuentas', icono: 'wallet' },
  { id: 'categorias', etiqueta: 'Categorías', icono: 'tags' },
  { id: 'importar', etiqueta: 'Importar Yape', icono: 'file excel outline' },
  { id: 'seguridad', etiqueta: 'Seguridad', icono: 'lock' },
]

const FILTRO_TODAS = 'todas'

/** ¿El foco está en un campo de texto? (para no robar atajos de teclado). */
function escribiendo(): boolean {
  const el = document.activeElement
  return (
    el instanceof HTMLInputElement ||
    el instanceof HTMLTextAreaElement ||
    el instanceof HTMLSelectElement ||
    (el instanceof HTMLElement && el.isContentEditable)
  )
}

function Dashboard({ usuarioId, email, sincronizarAhora }: DashboardProps) {
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
  const [pestanaAnalisis, setPestanaAnalisis] = useState<PestanaAnalisis>('resumen')
  /** Movimiento abierto en el modal de edición. */
  const [editando, setEditando] = useState<Transaccion | null>(null)
  /** Registro rápido en modal (botón "+", accesos de Inicio, Cuentas…). */
  const [registroRapido, setRegistroRapido] = useState<TipoFormulario | null>(null)
  /** Filtro de cuenta de Análisis. */
  const [cuentaFiltro, setCuentaFiltro] = useState<string>(FILTRO_TODAS)

  const transaccionesAnalisis = useMemo(
    () =>
      cuentaFiltro === FILTRO_TODAS
        ? transacciones
        : transacciones.filter((t) => t.cuentaId === cuentaFiltro),
    [transacciones, cuentaFiltro],
  )

  const insights = useMemo(
    () => generarInsights({ transacciones, categorias, cuentas, presupuestos, metas, deudas, recurrentes }),
    [transacciones, categorias, cuentas, presupuestos, metas, deudas, recurrentes],
  )

  const personasPrevias = useMemo(() => [...new Set(deudas.map((d) => d.persona))], [deudas])

  const cerrarEdicion = useCallback(() => setEditando(null), [])
  const cerrarRegistroRapido = useCallback(() => setRegistroRapido(null), [])

  // Atajo de teclado: "N" abre el registro rápido (fuera de campos de texto).
  useEffect(() => {
    const manejar = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== 'n' || e.ctrlKey || e.metaKey || e.altKey || escribiendo()) return
      if (document.body.classList.contains('con-modal')) return
      e.preventDefault()
      setRegistroRapido('gasto')
    }
    document.addEventListener('keydown', manejar)
    return () => document.removeEventListener('keydown', manejar)
  }, [])

  function irA(nueva: Seccion) {
    setSeccion(nueva)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function navegarA(destino: Destino) {
    const [seccionDestino, sub] = destino.split(':')
    if (seccionDestino === 'planificar') setPestanaPlanificar(sub as PestanaPlanificar)
    if (seccionDestino === 'mas') setSubseccionMas(sub as SubseccionMas)
    if (seccionDestino === 'analisis') setPestanaAnalisis((sub as PestanaAnalisis) ?? 'resumen')
    irA(seccionDestino as Seccion)
  }

  function irACategorias() {
    setSubseccionMas('categorias')
    irA('mas')
  }

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
            onClick={() => irA(s.id)}
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
        title="Registrar movimiento (N)"
        onClick={() => setRegistroRapido('gasto')}
      >
        <i className="plus icon" />
      </button>

      {/* key: cada sección entra con una transición suave. */}
      <div key={seccion} className="entrada-seccion">
        {seccion === 'inicio' && (
          <Inicio
            email={email}
            transacciones={transacciones}
            categorias={categorias}
            cuentas={cuentas}
            presupuestos={presupuestos}
            metas={metas}
            insights={insights}
            onRegistrar={setRegistroRapido}
            onNavegar={navegarA}
            onSeleccionar={setEditando}
          />
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
          <SeccionAnalisis
            pestana={pestanaAnalisis}
            onCambiarPestana={setPestanaAnalisis}
            email={email}
            transaccionesFiltradas={transaccionesAnalisis}
            transacciones={transacciones}
            categorias={categorias}
            cuentas={cuentas}
            deudas={deudas}
            presupuestos={presupuestos}
            metas={metas}
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
            <div className="ui secondary pointing menu submenu-mas pestanas-desplazables">
              {SUBSECCIONES_MAS.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  className={`item ${subseccionMas === s.id ? 'active' : ''}`}
                  onClick={() => setSubseccionMas(s.id)}
                >
                  <i className={`${s.icono} icon`} />
                  {s.etiqueta}
                </button>
              ))}
            </div>

            <div key={subseccionMas} className="entrada-suave">
              {subseccionMas === 'cuentas' && (
                <GestionCuentas
                  usuarioId={usuarioId}
                  cuentas={cuentas}
                  transacciones={transacciones}
                  onTransferir={() => setRegistroRapido('transferencia')}
                />
              )}

              {subseccionMas === 'categorias' && (
                <GestionCategorias usuarioId={usuarioId} categorias={categorias} transacciones={transacciones} />
              )}

              {subseccionMas === 'seguridad' && <Seguridad />}

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
                    onImportado={() => irA('movimientos')}
                  />
                </Suspense>
              )}
            </div>
          </>
        )}
      </div>

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
            permitirContinuar
            personasPrevias={personasPrevias}
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
