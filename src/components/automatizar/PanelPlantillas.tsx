import { useState, type FormEvent } from 'react'
import { useAvisos } from '../../hooks/useAvisos'
import {
  actualizarPlantilla,
  crearPlantilla,
  eliminarPlantilla,
  reordenarPlantillas,
} from '../../services/plantillaService'
import type { Categoria, Cuenta, Moneda, Plantilla, TipoTransaccion, Transaccion } from '../../types'
import { nombreCompleto, ordenJerarquico } from '../../utils/categorias'
import { etiquetasUsadas } from '../../utils/etiquetas'
import { montoPlantilla } from '../../utils/plantillas'
import CampoEtiquetas from '../CampoEtiquetas'
import Ilustracion from '../Ilustracion'
import Modal from '../Modal'

interface PanelPlantillasProps {
  usuarioId: string
  plantillas: Plantilla[]
  categorias: Categoria[]
  cuentas: Cuenta[]
  transacciones: Transaccion[]
}

interface Borrador {
  id?: string
  nombre: string
  tipo: TipoTransaccion
  monto: string
  moneda: Moneda
  categoriaId: string
  cuentaId: string
  concepto: string
  etiquetas: string[]
}

function PanelPlantillas({ usuarioId, plantillas, categorias, cuentas, transacciones }: PanelPlantillasProps) {
  const { avisar } = useAvisos()
  const [borrador, setBorrador] = useState<Borrador | null>(null)
  const [eliminando, setEliminando] = useState<Plantilla | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)

  const porId = new Map(categorias.map((c) => [c.id, c]))
  const cuentasPorId = new Map(cuentas.map((c) => [c.id, c]))

  function abrir(p?: Plantilla) {
    setError(null)
    const categoria = categorias.find((c) => c.tipo === 'gasto') ?? categorias[0]
    setBorrador(
      p
        ? {
            id: p.id,
            nombre: p.nombre,
            tipo: p.tipo,
            monto: p.monto !== undefined ? String(p.monto) : '',
            moneda: p.moneda ?? 'PEN',
            categoriaId: p.categoriaId,
            cuentaId: p.cuentaId,
            concepto: p.concepto ?? '',
            etiquetas: p.etiquetas ?? [],
          }
        : {
            nombre: '',
            tipo: 'gasto',
            monto: '',
            moneda: 'PEN',
            categoriaId: categoria?.id ?? '',
            cuentaId: cuentas[0]?.id ?? '',
            concepto: '',
            etiquetas: [],
          },
    )
  }

  async function guardar(e: FormEvent) {
    e.preventDefault()
    if (!borrador) return
    setGuardando(true)
    setError(null)
    const datos = {
      nombre: borrador.nombre,
      tipo: borrador.tipo,
      monto: borrador.monto.trim() === '' ? undefined : Number(borrador.monto),
      moneda: borrador.moneda,
      categoriaId: borrador.categoriaId,
      cuentaId: borrador.cuentaId,
      concepto: borrador.concepto,
      etiquetas: borrador.etiquetas,
      orden: plantillas.find((p) => p.id === borrador.id)?.orden,
    }
    try {
      if (borrador.id) await actualizarPlantilla(borrador.id, datos)
      else await crearPlantilla(datos, usuarioId)
      avisar(borrador.id ? 'Plantilla actualizada' : 'Plantilla creada')
      setBorrador(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar.')
    } finally {
      setGuardando(false)
    }
  }

  function mover(indice: number, delta: number) {
    const nuevo = [...plantillas]
    const [p] = nuevo.splice(indice, 1)
    nuevo.splice(indice + delta, 0, p)
    void reordenarPlantillas(nuevo)
  }

  const categoriasDelTipo = borrador
    ? ordenJerarquico(categorias.filter((c) => c.tipo === borrador.tipo || c.tipo === 'ambos'))
    : []

  return (
    <div className="ui segment">
      <div className="titulo-bloque">
        <h3 className="ui header">
          <i className="bolt icon" />
          <div className="content">
            Plantillas rápidas
            <div className="sub header">Tus gastos de siempre en un toque: aparecen en Inicio y al registrar</div>
          </div>
        </h3>
        <button type="button" className="ui primary button" onClick={() => abrir()}>
          <i className="plus icon" />
          Nueva
        </button>
      </div>

      {plantillas.length === 0 ? (
        <div className="estado-vacio">
          <Ilustracion nombre="recurrentes" />
          <p>
            <strong>¿Siempre compras lo mismo?</strong>
            <br />
            Crea "Café S/ 8" o "Pasaje S/ 2.50" y regístralos con un solo toque desde Inicio.
          </p>
        </div>
      ) : (
        <div className="lista-transacciones ui divided list">
          {plantillas.map((p, i) => {
            const categoria = porId.get(p.categoriaId)
            return (
              <div key={p.id} className="item">
                <span className="icono-circulo" style={{ background: categoria?.color ?? '#898781' }}>
                  <i className={`${categoria?.icono ?? 'tag'} icon`} />
                </span>
                <div className="detalle">
                  <div className="header">{p.nombre}</div>
                  <div className="description">
                    {nombreCompleto(categoria, porId)}
                    {cuentasPorId.get(p.cuentaId) ? ` · ${cuentasPorId.get(p.cuentaId)!.nombre}` : ''}
                    {p.etiquetas?.length ? ` · #${p.etiquetas.join(' #')}` : ''}
                  </div>
                </div>
                <div className="monto">
                  <strong className={p.tipo === 'ingreso' ? 'texto-ingreso' : 'texto-gasto'}>{montoPlantilla(p)}</strong>
                  <div className="ui mini basic icon buttons">
                    <button type="button" className="ui button" aria-label="Subir" disabled={i === 0} onClick={() => mover(i, -1)}>
                      <i className="arrow up icon" />
                    </button>
                    <button
                      type="button"
                      className="ui button"
                      aria-label="Bajar"
                      disabled={i === plantillas.length - 1}
                      onClick={() => mover(i, 1)}
                    >
                      <i className="arrow down icon" />
                    </button>
                    <button type="button" className="ui button" aria-label="Editar" onClick={() => abrir(p)}>
                      <i className="pencil alternate icon" />
                    </button>
                    <button type="button" className="ui button" aria-label="Eliminar" onClick={() => setEliminando(p)}>
                      <i className="trash alternate outline icon" />
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      <Modal
        abierto={borrador !== null}
        titulo={borrador?.id ? 'Editar plantilla' : 'Nueva plantilla'}
        icono="bolt"
        onCerrar={() => setBorrador(null)}
      >
        {borrador && (
          <form className={`ui form ${error ? 'error' : ''}`} onSubmit={guardar}>
            <div className="ui fluid two buttons field">
              {(['gasto', 'ingreso'] as TipoTransaccion[]).map((t) => (
                <button
                  key={t}
                  type="button"
                  aria-pressed={borrador.tipo === t}
                  className={`ui button ${borrador.tipo === t ? (t === 'gasto' ? 'red' : 'green') : 'basic'}`}
                  onClick={() => {
                    const categoria = categorias.find((c) => c.tipo === t) ?? categorias[0]
                    setBorrador({ ...borrador, tipo: t, categoriaId: categoria?.id ?? '' })
                  }}
                >
                  <i className={`arrow ${t === 'gasto' ? 'up' : 'down'} icon`} />
                  {t === 'gasto' ? 'Gasto' : 'Ingreso'}
                </button>
              ))}
            </div>
            <div className="two fields">
              <div className="field required">
                <label htmlFor="pl-nombre">Nombre</label>
                <input
                  id="pl-nombre"
                  value={borrador.nombre}
                  maxLength={30}
                  placeholder="Ej. Café, Pasaje, Menú"
                  onChange={(e) => setBorrador({ ...borrador, nombre: e.target.value })}
                  autoFocus
                  required
                />
              </div>
              <div className="field">
                <label htmlFor="pl-monto">Monto (opcional)</label>
                <div className="ui action input">
                  <input
                    id="pl-monto"
                    type="number"
                    inputMode="decimal"
                    min="0"
                    step="0.01"
                    placeholder="Variable"
                    value={borrador.monto}
                    onChange={(e) => setBorrador({ ...borrador, monto: e.target.value })}
                  />
                  <div className="ui buttons">
                    {(['PEN', 'USD'] as Moneda[]).map((m) => (
                      <button
                        key={m}
                        type="button"
                        className={`ui button ${borrador.moneda === m ? 'primary' : 'basic'}`}
                        onClick={() => setBorrador({ ...borrador, moneda: m })}
                      >
                        {m === 'PEN' ? 'S/' : 'US$'}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
            <div className="two fields">
              <div className="field required">
                <label htmlFor="pl-categoria">Categoría</label>
                <select
                  id="pl-categoria"
                  className="ui dropdown"
                  value={borrador.categoriaId}
                  onChange={(e) => setBorrador({ ...borrador, categoriaId: e.target.value })}
                >
                  {categoriasDelTipo.map(([c, sub]) => (
                    <option key={c.id} value={c.id}>
                      {sub ? `  › ${c.nombre}` : c.nombre}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field required">
                <label htmlFor="pl-cuenta">Cuenta</label>
                <select
                  id="pl-cuenta"
                  className="ui dropdown"
                  value={borrador.cuentaId}
                  onChange={(e) => setBorrador({ ...borrador, cuentaId: e.target.value })}
                >
                  {cuentas.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nombre}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="field">
              <label htmlFor="pl-concepto">Concepto (opcional)</label>
              <input
                id="pl-concepto"
                value={borrador.concepto}
                maxLength={140}
                placeholder="Si lo dejas vacío se usa el nombre"
                onChange={(e) => setBorrador({ ...borrador, concepto: e.target.value })}
              />
            </div>
            <div className="field">
              <label htmlFor="pl-etiquetas">Etiquetas (opcional)</label>
              <CampoEtiquetas
                id="pl-etiquetas"
                etiquetas={borrador.etiquetas}
                onCambiar={(etiquetas) => setBorrador({ ...borrador, etiquetas })}
                sugerencias={etiquetasUsadas(transacciones)}
              />
            </div>
            <p className="texto-suave">
              <i className="info circle icon" />
              Con monto fijo se registra con un toque (hoy). Sin monto, abre el formulario ya lleno para que solo
              escribas cuánto.
            </p>
            {error && (
              <div className="ui error message">
                <p>{error}</p>
              </div>
            )}
            <div className="acciones-formulario">
              <button type="button" className="ui basic button" onClick={() => setBorrador(null)}>
                Cancelar
              </button>
              <button type="submit" className={`ui primary button ${guardando ? 'loading' : ''}`} disabled={guardando}>
                <i className="save icon" />
                Guardar
              </button>
            </div>
          </form>
        )}
      </Modal>

      <Modal
        abierto={eliminando !== null}
        titulo={`¿Eliminar la plantilla "${eliminando?.nombre ?? ''}"?`}
        icono="trash alternate outline"
        tamano="tiny"
        onCerrar={() => setEliminando(null)}
      >
        <p>Los movimientos que ya registraste con ella se conservan.</p>
        <div className="acciones-formulario">
          <button type="button" className="ui basic button" onClick={() => setEliminando(null)}>
            Cancelar
          </button>
          <button
            type="button"
            className="ui red button"
            onClick={() => {
              if (eliminando) void eliminarPlantilla(eliminando)
              avisar('Plantilla eliminada', 'info')
              setEliminando(null)
            }}
          >
            <i className="trash icon" />
            Eliminar
          </button>
        </div>
      </Modal>
    </div>
  )
}

export default PanelPlantillas
