import { useMemo, useState, type FormEvent } from 'react'
import {
  actualizarCategoria,
  COLORES_CATEGORIA,
  crearCategoria,
  eliminarCategoria,
  ICONOS_CATEGORIA,
} from '../services/categoriaService'
import type { Categoria, TipoCategoria, Transaccion } from '../types'

interface GestionCategoriasProps {
  usuarioId: string
  categorias: Categoria[]
  transacciones: Transaccion[]
}

const TIPOS: { id: TipoCategoria; etiqueta: string; icono: string; color: string }[] = [
  { id: 'gasto', etiqueta: 'Gasto', icono: 'arrow up', color: 'red' },
  { id: 'ingreso', etiqueta: 'Ingreso', icono: 'arrow down', color: 'green' },
  { id: 'ambos', etiqueta: 'Ambos', icono: 'exchange', color: 'grey' },
]

interface Borrador {
  /** undefined = categoría nueva. */
  id?: string
  nombre: string
  tipo: TipoCategoria
  icono: string
  color: string
}

const BORRADOR_VACIO: Borrador = {
  nombre: '',
  tipo: 'gasto',
  icono: 'tag',
  color: COLORES_CATEGORIA[0],
}

function GestionCategorias({ usuarioId, categorias, transacciones }: GestionCategoriasProps) {
  const [borrador, setBorrador] = useState<Borrador | null>(null)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [eliminando, setEliminando] = useState<Categoria | null>(null)
  const [reasignarA, setReasignarA] = useState('')

  const usos = useMemo(() => {
    const conteo = new Map<string, number>()
    for (const t of transacciones) conteo.set(t.categoriaId, (conteo.get(t.categoriaId) ?? 0) + 1)
    return conteo
  }, [transacciones])

  const grupos = TIPOS.map((tipo) => ({
    ...tipo,
    categorias: categorias
      .filter((c) => c.tipo === tipo.id)
      .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')),
  }))

  function abrirNueva() {
    setEliminando(null)
    setError(null)
    // Sugiere el primer color de la paleta que aún no se usa.
    const usados = new Set(categorias.map((c) => c.color))
    const color = COLORES_CATEGORIA.find((c) => !usados.has(c)) ?? COLORES_CATEGORIA[0]
    setBorrador({ ...BORRADOR_VACIO, color })
  }

  function abrirEdicion(c: Categoria) {
    setEliminando(null)
    setError(null)
    setBorrador({
      id: c.id,
      nombre: c.nombre,
      tipo: c.tipo,
      icono: c.icono ?? 'tag',
      color: c.color ?? COLORES_CATEGORIA[COLORES_CATEGORIA.length - 1],
    })
  }

  async function guardar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!borrador) return
    setGuardando(true)
    setError(null)

    const datos = {
      nombre: borrador.nombre,
      tipo: borrador.tipo,
      icono: borrador.icono,
      color: borrador.color,
    }

    try {
      if (borrador.id) await actualizarCategoria(borrador.id, datos, usuarioId)
      else await crearCategoria(datos, usuarioId)
      setBorrador(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar la categoría.')
    } finally {
      setGuardando(false)
    }
  }

  function pedirEliminacion(c: Categoria) {
    setBorrador(null)
    setError(null)
    setEliminando(c)
    const alternativa =
      categorias.find((o) => o.id !== c.id && (o.tipo === c.tipo || o.tipo === 'ambos')) ??
      categorias.find((o) => o.id !== c.id)
    setReasignarA(alternativa?.id ?? '')
  }

  async function confirmarEliminacion() {
    if (!eliminando) return
    setGuardando(true)
    setError(null)
    try {
      await eliminarCategoria(eliminando.id, reasignarA || undefined)
      setEliminando(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo eliminar la categoría.')
    } finally {
      setGuardando(false)
    }
  }

  const usosEliminando = eliminando ? (usos.get(eliminando.id) ?? 0) : 0

  return (
    <>
      <div className="barra-filtros">
        <h2 className="ui header">
          <i className="tags icon" />
          <div className="content">
            Categorías
            <div className="sub header">Organiza tus ingresos y gastos a tu manera</div>
          </div>
        </h2>
        {!borrador && (
          <button type="button" className="ui primary button" onClick={abrirNueva}>
            <i className="plus icon" />
            Nueva categoría
          </button>
        )}
      </div>

      {borrador && (
        <div className="ui segment editor-categoria">
          <h3 className="ui header">
            <span className="icono-circulo" style={{ background: borrador.color }}>
              <i className={`${borrador.icono} icon`} />
            </span>
            <div className="content">
              {borrador.id ? 'Editar categoría' : 'Nueva categoría'}
              <div className="sub header">{borrador.nombre.trim() || 'Vista previa'}</div>
            </div>
          </h3>

          <form className={`ui form ${error ? 'error' : ''}`} onSubmit={guardar}>
            <div className="field required">
              <label htmlFor="cat-nombre">Nombre</label>
              <input
                id="cat-nombre"
                type="text"
                value={borrador.nombre}
                maxLength={40}
                placeholder="Ej. Mascotas"
                onChange={(e) => setBorrador({ ...borrador, nombre: e.target.value })}
                required
                autoFocus
              />
            </div>

            <div className="field">
              <label>Tipo</label>
              <div className="ui fluid three buttons">
                {TIPOS.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    className={`ui button ${borrador.tipo === t.id ? t.color : 'basic'}`}
                    onClick={() => setBorrador({ ...borrador, tipo: t.id })}
                  >
                    <i className={`${t.icono} icon`} />
                    {t.etiqueta}
                  </button>
                ))}
              </div>
            </div>

            <div className="field">
              <label>Color</label>
              <div className="selector-color" role="radiogroup" aria-label="Color">
                {COLORES_CATEGORIA.map((color) => (
                  <button
                    key={color}
                    type="button"
                    role="radio"
                    aria-checked={borrador.color === color}
                    aria-label={color}
                    className={`muestra-color ${borrador.color === color ? 'activa' : ''}`}
                    style={{ background: color }}
                    onClick={() => setBorrador({ ...borrador, color })}
                  >
                    {borrador.color === color && <i className="check icon" />}
                  </button>
                ))}
              </div>
            </div>

            <div className="field">
              <label>Icono</label>
              <div className="selector-icono" role="radiogroup" aria-label="Icono">
                {ICONOS_CATEGORIA.map((icono) => (
                  <button
                    key={icono}
                    type="button"
                    role="radio"
                    aria-checked={borrador.icono === icono}
                    title={icono}
                    className={`opcion-icono ${borrador.icono === icono ? 'activa' : ''}`}
                    style={borrador.icono === icono ? { background: borrador.color } : undefined}
                    onClick={() => setBorrador({ ...borrador, icono })}
                  >
                    <i className={`${icono} icon`} />
                  </button>
                ))}
              </div>
            </div>

            {error && (
              <div className="ui error message">
                <p>{error}</p>
              </div>
            )}

            <div className="acciones-formulario">
              <button type="button" className="ui basic button" onClick={() => setBorrador(null)}>
                Cancelar
              </button>
              <button
                type="submit"
                className={`ui primary button ${guardando ? 'loading' : ''}`}
                disabled={guardando}
              >
                <i className="save icon" />
                Guardar
              </button>
            </div>
          </form>
        </div>
      )}

      {eliminando && (
        <div className="ui warning message">
          <div className="header">
            <i className="trash alternate outline icon" />
            ¿Eliminar “{eliminando.nombre}”?
          </div>
          {usosEliminando > 0 ? (
            <div className="ui form reasignar">
              <p>
                Tiene {usosEliminando} transacción{usosEliminando === 1 ? '' : 'es'}. ¿A qué
                categoría las pasamos?
              </p>
              <select
                aria-label="Reasignar transacciones a"
                className="ui dropdown"
                value={reasignarA}
                onChange={(e) => setReasignarA(e.target.value)}
              >
                {categorias
                  .filter((c) => c.id !== eliminando.id)
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nombre}
                    </option>
                  ))}
              </select>
            </div>
          ) : (
            <p>No tiene transacciones asociadas.</p>
          )}
          {error && <p className="texto-gasto">{error}</p>}
          <div className="acciones-formulario">
            <button type="button" className="ui basic button" onClick={() => setEliminando(null)}>
              Cancelar
            </button>
            <button
              type="button"
              className={`ui red button ${guardando ? 'loading' : ''}`}
              disabled={guardando || (usosEliminando > 0 && !reasignarA)}
              onClick={confirmarEliminacion}
            >
              <i className="trash icon" />
              Eliminar
            </button>
          </div>
        </div>
      )}

      {grupos.map((g) => (
        <div key={g.id} className="ui segment">
          <h4 className="ui header">
            <i className={`${g.icono} icon`} />
            <div className="content">
              {g.id === 'ambos' ? 'Ingresos y gastos' : `${g.etiqueta}s`}
              <div className="sub header">
                {g.categorias.length} categoría{g.categorias.length === 1 ? '' : 's'}
              </div>
            </div>
          </h4>

          {g.categorias.length === 0 ? (
            <p className="texto-suave">Aún no hay categorías de este tipo.</p>
          ) : (
            <div className="rejilla-categorias">
              {g.categorias.map((c) => {
                const n = usos.get(c.id) ?? 0
                return (
                  <div key={c.id} className="tarjeta-categoria">
                    <span className="icono-circulo" style={{ background: c.color }}>
                      <i className={`${c.icono ?? 'tag'} icon`} />
                    </span>
                    <div className="detalle">
                      <strong>{c.nombre}</strong>
                      <span>
                        {n} movimiento{n === 1 ? '' : 's'}
                      </span>
                    </div>
                    <div className="ui mini basic icon buttons">
                      <button
                        type="button"
                        className="ui button"
                        title="Editar"
                        aria-label={`Editar ${c.nombre}`}
                        onClick={() => abrirEdicion(c)}
                      >
                        <i className="pencil alternate icon" />
                      </button>
                      <button
                        type="button"
                        className="ui button"
                        title="Eliminar"
                        aria-label={`Eliminar ${c.nombre}`}
                        disabled={categorias.length <= 1}
                        onClick={() => pedirEliminacion(c)}
                      >
                        <i className="trash alternate outline icon" />
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      ))}
    </>
  )
}

export default GestionCategorias
