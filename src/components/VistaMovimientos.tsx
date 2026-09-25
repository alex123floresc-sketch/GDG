import { useMemo, useState } from 'react'
import { useAvisos } from '../hooks/useAvisos'
import { exportarMovimientosExcel } from '../services/exportService'
import type { Categoria, Cuenta, OrigenTransaccion, Transaccion } from '../types'
import { esMovimientoReal } from '../utils/analisis'
import {
  aplicarFiltros,
  chipsDeFiltros,
  FILTROS_VACIOS,
  PERIODOS,
  quitarFiltro,
  type FiltrosMovimientos,
  type TipoFiltro,
} from '../utils/filtros'
import { formatearMoneda } from '../utils/formato'
import CalendarioGastos from './CalendarioGastos'
import ListaTransacciones from './ListaTransacciones'

interface VistaMovimientosProps {
  transacciones: Transaccion[]
  categorias: Categoria[]
  cuentas: Cuenta[]
  onSeleccionar: (t: Transaccion) => void
}

const PASO_LISTA = 100

function VistaMovimientos({ transacciones, categorias, cuentas, onSeleccionar }: VistaMovimientosProps) {
  const { avisar } = useAvisos()
  const [vista, setVista] = useState<'lista' | 'calendario'>('lista')
  const [filtros, setFiltros] = useState<FiltrosMovimientos>(FILTROS_VACIOS)
  const [panelAbierto, setPanelAbierto] = useState(false)
  const [limite, setLimite] = useState(PASO_LISTA)
  const [exportando, setExportando] = useState(false)

  const actualizar = (cambios: Partial<FiltrosMovimientos>) => {
    setFiltros((f) => ({ ...f, ...cambios }))
    setLimite(PASO_LISTA)
  }

  const filtradas = useMemo(
    () => aplicarFiltros(transacciones, filtros, categorias, { sinFechas: vista === 'calendario' }),
    [transacciones, filtros, categorias, vista],
  )

  const chips = chipsDeFiltros(filtros, categorias, cuentas)
  const chipsVisibles = vista === 'calendario' ? chips.filter((c) => c.clave !== 'rango') : chips
  const avanzadosActivos = chips.filter((c) => c.clave !== 'rango').length

  const totales = useMemo(() => {
    let ingresos = 0
    let gastos = 0
    for (const t of filtradas) {
      if (!esMovimientoReal(t)) continue
      if (t.tipo === 'ingreso') ingresos += t.monto
      else gastos += t.monto
    }
    return { ingresos, gastos, neto: ingresos - gastos }
  }, [filtradas])

  async function exportar() {
    setExportando(true)
    try {
      await exportarMovimientosExcel(filtradas, categorias, cuentas, chips.map((c) => c.texto).join(', '))
      avisar(`Exportados ${filtradas.length} movimientos`)
    } catch (err) {
      avisar(err instanceof Error ? err.message : 'No se pudo exportar', 'error')
    } finally {
      setExportando(false)
    }
  }

  return (
    <>
      <div className="barra-filtros">
        <h2 className="ui header">
          <i className="list ul icon" />
          <div className="content">
            Movimientos
            <div className="sub header">Busca, filtra y exporta</div>
          </div>
        </h2>
        <div className="acciones-exportar">
          <div className="ui small buttons">
            <button
              type="button"
              className={`ui button ${vista === 'lista' ? 'primary' : 'basic'}`}
              onClick={() => setVista('lista')}
              aria-pressed={vista === 'lista'}
            >
              <i className="list icon" />
              Lista
            </button>
            <button
              type="button"
              className={`ui button ${vista === 'calendario' ? 'primary' : 'basic'}`}
              onClick={() => setVista('calendario')}
              aria-pressed={vista === 'calendario'}
            >
              <i className="calendar alternate outline icon" />
              Calendario
            </button>
          </div>
          <button
            type="button"
            className={`ui small basic button ${exportando ? 'loading' : ''}`}
            onClick={exportar}
            disabled={exportando || filtradas.length === 0}
            title="Exportar lo filtrado a Excel"
          >
            <i className="file excel outline icon" />
            <span className="solo-escritorio">Exportar</span>
          </button>
        </div>
      </div>

      <div className="ui form panel-busqueda">
        <div className="fila-busqueda">
          <div className="ui left icon input buscador">
            <i className="search icon" />
            <input
              type="search"
              placeholder="Buscar por concepto, categoría o n° de operación"
              value={filtros.texto}
              onChange={(e) => actualizar({ texto: e.target.value })}
              aria-label="Buscar movimientos"
            />
          </div>
          <button
            type="button"
            className={`ui button ${panelAbierto || avanzadosActivos ? 'primary basic' : 'basic'}`}
            onClick={() => setPanelAbierto((a) => !a)}
            aria-expanded={panelAbierto}
          >
            <i className="sliders horizontal icon" />
            Filtros
            {avanzadosActivos > 0 && <span className="contador-filtros">{avanzadosActivos}</span>}
          </button>
        </div>

        {vista === 'lista' && (
          <div className="periodos" role="radiogroup" aria-label="Periodo">
            {PERIODOS.map((p) => (
              <button
                key={p.id}
                type="button"
                role="radio"
                aria-checked={filtros.periodo === p.id}
                className={`ui mini button ${filtros.periodo === p.id ? 'primary' : 'basic'}`}
                onClick={() => actualizar({ periodo: p.id })}
              >
                {p.etiqueta}
              </button>
            ))}
          </div>
        )}

        {vista === 'lista' && filtros.periodo === 'personalizado' && (
          <div className="two fields rango-fechas">
            <div className="field">
              <label htmlFor="f-desde">Desde</label>
              <input id="f-desde" type="date" value={filtros.desde} onChange={(e) => actualizar({ desde: e.target.value })} />
            </div>
            <div className="field">
              <label htmlFor="f-hasta">Hasta</label>
              <input id="f-hasta" type="date" value={filtros.hasta} onChange={(e) => actualizar({ hasta: e.target.value })} />
            </div>
          </div>
        )}

        {panelAbierto && (
          <div className="filtros-avanzados entrada-suave">
            <div className="field">
              <label htmlFor="f-tipo">Tipo</label>
              <select id="f-tipo" className="ui dropdown" value={filtros.tipo} onChange={(e) => actualizar({ tipo: e.target.value as TipoFiltro })}>
                <option value="todos">Todos</option>
                <option value="gasto">Gastos</option>
                <option value="ingreso">Ingresos</option>
                <option value="transferencia">Transferencias</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="f-categoria">Categoría</label>
              <select id="f-categoria" className="ui dropdown" value={filtros.categoriaId} onChange={(e) => actualizar({ categoriaId: e.target.value })}>
                <option value="">Todas</option>
                {categorias.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nombre}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="f-cuenta">Cuenta</label>
              <select id="f-cuenta" className="ui dropdown" value={filtros.cuentaId} onChange={(e) => actualizar({ cuentaId: e.target.value })}>
                <option value="">Todas</option>
                {cuentas.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nombre}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="f-origen">Origen</label>
              <select
                id="f-origen"
                className="ui dropdown"
                value={filtros.origen}
                onChange={(e) => actualizar({ origen: e.target.value as OrigenTransaccion | '' })}
              >
                <option value="">Todos</option>
                <option value="manual">Registrados a mano</option>
                <option value="yape">Importados de Yape</option>
                <option value="recurrente">Automáticos (recurrentes)</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="f-min">Monto desde</label>
              <input id="f-min" type="number" inputMode="decimal" min="0" placeholder="S/ 0" value={filtros.montoMin} onChange={(e) => actualizar({ montoMin: e.target.value })} />
            </div>
            <div className="field">
              <label htmlFor="f-max">Monto hasta</label>
              <input id="f-max" type="number" inputMode="decimal" min="0" placeholder="Sin límite" value={filtros.montoMax} onChange={(e) => actualizar({ montoMax: e.target.value })} />
            </div>
          </div>
        )}

        {chipsVisibles.length > 0 && (
          <div className="chips-filtros">
            {chipsVisibles.map((c) => (
              <button key={c.clave} type="button" className="ui small basic label chip" onClick={() => actualizar(quitarFiltro(filtros, c.clave))}>
                {c.texto}
                <i className="delete icon" />
              </button>
            ))}
            <button type="button" className="enlace-sugerencia" onClick={() => actualizar({ ...FILTROS_VACIOS, texto: filtros.texto })}>
              Limpiar filtros
            </button>
          </div>
        )}
      </div>

      {vista === 'lista' ? (
        <>
          <div className="totales-filtro">
            <div>
              <span>Ingresos</span>
              <strong className="texto-ingreso">{formatearMoneda(totales.ingresos)}</strong>
            </div>
            <div>
              <span>Gastos</span>
              <strong className="texto-gasto">{formatearMoneda(totales.gastos)}</strong>
            </div>
            <div>
              <span>Neto</span>
              <strong className={totales.neto < 0 ? 'texto-gasto' : ''}>{formatearMoneda(totales.neto)}</strong>
            </div>
          </div>

          <ListaTransacciones
            transacciones={filtradas}
            categorias={categorias}
            cuentas={cuentas}
            titulo="Resultados"
            limite={limite}
            onSeleccionar={onSeleccionar}
            accion={{ texto: 'Mostrar más', onClick: () => setLimite((l) => l + PASO_LISTA) }}
            vacio={
              transacciones.length === 0
                ? 'Aún no hay movimientos. Registra el primero con el botón "+".'
                : 'Ningún movimiento coincide con los filtros.'
            }
          />
        </>
      ) : (
        <CalendarioGastos transacciones={filtradas} categorias={categorias} cuentas={cuentas} onSeleccionar={onSeleccionar} />
      )}
    </>
  )
}

export default VistaMovimientos
