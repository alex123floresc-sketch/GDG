import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import { useCategorias } from '../hooks/useCategorias'
import { useCuentas } from '../hooks/useCuentas'
import { useAvisos } from '../hooks/useAvisos'
import {
  useAjustes,
  useChanchitos,
  useCuotas,
  useDeseos,
  useDeudas,
  useMetas,
  usePlantillas,
  usePresupuestos,
  useRecurrentes,
  useReglas,
} from '../hooks/usePlanificacion'
import { useTransacciones } from '../hooks/useTransacciones'
import { registrarDesdePlantilla } from '../services/plantillaService'
import { eliminarTransaccion } from '../services/transaccionService'
import type { Plantilla, Transaccion } from '../types'
import Automatizar from './automatizar/Automatizar'
import Logros from './Logros'
import { calcularLogros, calcularRacha } from '../utils/logros'
import { valorHora } from '../utils/horas'
import { generarInsights, type Insight } from '../utils/insights'
import SeccionAnalisis, { type PestanaAnalisis } from './analisis/SeccionAnalisis'
import FormularioTransaccion, { type TipoFormulario } from './FormularioTransaccion'
import GestionCategorias from './GestionCategorias'
import GestionCuentas from './GestionCuentas'
import Respaldo from './Respaldo'
import Seguridad from './Seguridad'
import Inicio from './Inicio'
import Modal from './Modal'
import Planificar, { type PestanaPlanificar } from './planificar/Planificar'
import VistaMovimientos from './VistaMovimientos'
import { cuentasOperativas } from '../utils/cuentas'
import { useMontosOcultos } from '../utils/privacidad'

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
type SubseccionMas = 'cuentas' | 'categorias' | 'automatizar' | 'logros' | 'importar' | 'seguridad'
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
  { id: 'automatizar', etiqueta: 'Automatizar', icono: 'magic' },
  { id: 'logros', etiqueta: 'Logros', icono: 'trophy' },
  { id: 'importar', etiqueta: 'Importar Yape', icono: 'file excel outline' },
  { id: 'seguridad', etiqueta: 'Seguridad y respaldo', icono: 'lock' },
]

const FILTRO_TODAS = 'todas'

/**
 * Acción pedida por URL: los atajos del ícono de la app (manifest
 * `shortcuts`) abren `/?accion=gasto`, `/?seccion=movimientos`, etc.
 */
function accionDeUrl(): { accion?: TipoFormulario; seccion?: Seccion } {
  const params = new URLSearchParams(window.location.search)
  const accion = params.get('accion')
  const seccion = params.get('seccion')
  return {
    accion: accion === 'gasto' || accion === 'ingreso' || accion === 'transferencia' ? accion : undefined,
    seccion: SECCIONES.some((s) => s.id === seccion) ? (seccion as Seccion) : undefined,
  }
}

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
  const chanchitos = useChanchitos(usuarioId)
  const ocultos = useMontosOcultos()
  const deudas = useDeudas(usuarioId)
  // Además de listarlos, genera las transacciones recurrentes vencidas.
  const recurrentes = useRecurrentes(usuarioId)
  const reglas = useReglas(usuarioId)
  const plantillas = usePlantillas(usuarioId)
  const ajustes = useAjustes(usuarioId)
  // Además de listarlas, registra las cuotas vencidas (modo "mes a mes").
  const cuotas = useCuotas(usuarioId)
  const deseos = useDeseos(usuarioId)
  const { avisar } = useAvisos()

  const [desdeUrl] = useState(accionDeUrl)
  const [seccion, setSeccion] = useState<Seccion>(desdeUrl.seccion ?? 'inicio')
  const [subseccionMas, setSubseccionMas] = useState<SubseccionMas>('cuentas')
  const [pestanaPlanificar, setPestanaPlanificar] = useState<PestanaPlanificar>('presupuestos')
  const [pestanaAnalisis, setPestanaAnalisis] = useState<PestanaAnalisis>('resumen')
  /** Movimiento abierto en el modal de edición. */
  const [editando, setEditando] = useState<Transaccion | null>(null)
  /** Registro rápido en modal (botón "+", accesos de Inicio, Cuentas…). */
  const [registroRapido, setRegistroRapido] = useState<TipoFormulario | null>(desdeUrl.accion ?? null)
  /** Plantilla sin monto fijo con la que se abrió el registro. */
  const [plantillaRegistro, setPlantillaRegistro] = useState<Plantilla | undefined>()
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
    () =>
      generarInsights({
        transacciones,
        categorias,
        cuentas,
        presupuestos,
        metas,
        deudas,
        recurrentes,
        chanchitos,
        cuotas,
        suscripcionesIgnoradas: ajustes.suscripcionesIgnoradas,
      }),
    // `ocultos`: los textos llevan montos formateados.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [transacciones, categorias, cuentas, presupuestos, metas, deudas, recurrentes, chanchitos, cuotas, ajustes, ocultos],
  )

  const personasPrevias = useMemo(() => [...new Set(deudas.map((d) => d.persona))], [deudas])

  const racha = useMemo(() => calcularRacha(transacciones), [transacciones])
  const logros = useMemo(
    () =>
      calcularLogros({ transacciones, categorias, cuentas, presupuestos, metas, deudas, chanchitos, reglas, plantillas, deseos, ajustes }),
    [transacciones, categorias, cuentas, presupuestos, metas, deudas, chanchitos, reglas, plantillas, deseos, ajustes],
  )
  const hora = useMemo(() => valorHora(ajustes, transacciones), [ajustes, transacciones])

  // Avisa los logros nuevos. La primera vez en el dispositivo solo los
  // guarda como vistos (no llena de avisos a quien ya usaba la app).
  // Se espera a que carguen todas las tablas (useLiveQuery empieza vacío).
  const [datosListos, setDatosListos] = useState(false)
  useEffect(() => {
    const t = window.setTimeout(() => setDatosListos(true), 3000)
    return () => window.clearTimeout(t)
  }, [])
  useEffect(() => {
    if (!datosListos || transacciones.length === 0) return
    const clave = `gg:logrosVistos:${usuarioId}`
    const logrados = logros.filter((l) => l.logrado).map((l) => l.id)
    let vistos: string[] | null = null
    try {
      vistos = JSON.parse(localStorage.getItem(clave) ?? 'null')
    } catch {
      vistos = null
    }
    const nuevos = vistos ? logros.filter((l) => l.logrado && !vistos!.includes(l.id)) : []
    for (const l of nuevos.slice(0, 2)) avisar(`¡Logro desbloqueado: ${l.nombre}!`, 'exito')
    try {
      localStorage.setItem(clave, JSON.stringify(logrados))
    } catch {
      // Sin almacenamiento: se volverá a revisar la próxima vez.
    }
  }, [datosListos, logros, transacciones.length, usuarioId, avisar])

  const cerrarEdicion = useCallback(() => setEditando(null), [])
  const cerrarRegistroRapido = useCallback(() => {
    setRegistroRapido(null)
    setPlantillaRegistro(undefined)
  }, [])

  // Quita ?accion=… de la barra de direcciones (ya se usó al abrir).
  useEffect(() => {
    if (window.location.search) window.history.replaceState(null, '', window.location.pathname)
  }, [])

  /** Plantilla con monto fijo: se registra ya (con deshacer); sin monto, abre el formulario lleno. */
  const usarPlantilla = useCallback(
    async (p: Plantilla) => {
      if (p.monto === undefined) {
        setPlantillaRegistro(p)
        setRegistroRapido(p.tipo)
        return
      }
      try {
        const t = await registrarDesdePlantilla(p, usuarioId)
        avisar(`${p.nombre} registrado`, 'exito', {
          texto: 'Deshacer',
          onClick: () => void eliminarTransaccion(t.id),
        })
      } catch (err) {
        avisar(err instanceof Error ? err.message : 'No se pudo registrar', 'error')
      }
    },
    [usuarioId, avisar],
  )

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
            deudas={deudas}
            recurrentes={recurrentes}
            chanchitos={chanchitos}
            ajustes={ajustes}
            racha={racha}
            insights={insights}
            plantillas={plantillas}
            onUsarPlantilla={usarPlantilla}
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
            usuarioId={usuarioId}
            ajustes={ajustes}
            chanchitos={chanchitos}
            recurrentes={recurrentes}
            cuotas={cuotas}
            deseos={deseos}
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
            chanchitos={chanchitos}
            deudas={deudas}
            recurrentes={recurrentes}
            cuotas={cuotas}
            deseos={deseos}
            ajustes={ajustes}
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

              {subseccionMas === 'automatizar' && (
                <Automatizar
                  usuarioId={usuarioId}
                  plantillas={plantillas}
                  reglas={reglas}
                  categorias={categorias}
                  cuentas={cuentasOperativas(cuentas)}
                  transacciones={transacciones}
                />
              )}

              {subseccionMas === 'logros' && <Logros logros={logros} racha={racha} />}

              {subseccionMas === 'seguridad' && (
                <>
                  <Seguridad />
                  <Respaldo usuarioId={usuarioId} email={email} />
                </>
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
                    cuentas={cuentasOperativas(cuentas)}
                    categorias={categorias}
                    reglas={reglas}
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
            reglas={reglas}
            plantillas={plantillas}
            plantillaInicial={plantillaRegistro}
            valorHora={hora?.valor}
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
