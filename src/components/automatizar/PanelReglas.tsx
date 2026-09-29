import { useMemo, useState, type FormEvent } from 'react'
import { useAvisos } from '../../hooks/useAvisos'
import { actualizarRegla, aplicarReglaAExistentes, crearRegla, eliminarRegla } from '../../services/reglaService'
import type { Categoria, Cuenta, Regla, TipoTransaccion, Transaccion } from '../../types'
import { nombreCompleto, ordenJerarquico } from '../../utils/categorias'
import { etiquetasUsadas } from '../../utils/etiquetas'
import { formatearFecha, formatearMoneda } from '../../utils/formato'
import { afectadasPorRegla, normalizarTexto, patronSugerido, reglaPara } from '../../utils/reglas'
import CampoEtiquetas from '../CampoEtiquetas'
import Modal from '../Modal'

interface PanelReglasProps {
  usuarioId: string
  reglas: Regla[]
  categorias: Categoria[]
  cuentas: Cuenta[]
  transacciones: Transaccion[]
}

type Aplica = 'ambos' | TipoTransaccion

interface Borrador {
  id?: string
  patron: string
  aplica: Aplica
  categoriaId: string
  cuentaId: string
  etiquetas: string[]
}

interface Sugerencia {
  patron: string
  tipo: TipoTransaccion
  categoriaId: string
  veces: number
}

/** Mínimo de veces que se repite un concepto para sugerir una regla. */
const MIN_REPETICIONES = 3

/**
 * Conceptos que se repiten y casi siempre llevan la misma categoría, sin
 * una regla que ya los cubra: candidatos a regla automática.
 */
function sugerirReglas(transacciones: Transaccion[], reglas: Regla[]): Sugerencia[] {
  const grupos = new Map<string, { original: string; tipo: TipoTransaccion; categorias: Map<string, number>; total: number }>()
  for (const t of transacciones) {
    if (t.origen === 'transferencia' || !t.concepto || !t.categoriaId) continue
    const clave = `${t.tipo}|${normalizarTexto(t.concepto)}`
    const g = grupos.get(clave) ?? { original: t.concepto.trim(), tipo: t.tipo, categorias: new Map(), total: 0 }
    g.categorias.set(t.categoriaId, (g.categorias.get(t.categoriaId) ?? 0) + 1)
    g.total++
    grupos.set(clave, g)
  }
  const sugerencias: Sugerencia[] = []
  for (const g of grupos.values()) {
    if (g.total < MIN_REPETICIONES) continue
    const [categoriaId, veces] = [...g.categorias].sort((a, b) => b[1] - a[1])[0]
    if (veces / g.total < 0.8) continue
    const patron = patronSugerido(g.original)
    if (reglaPara(g.original, g.tipo, reglas)) continue
    if (sugerencias.some((s) => normalizarTexto(s.patron) === normalizarTexto(patron) && s.tipo === g.tipo)) continue
    sugerencias.push({ patron, tipo: g.tipo, categoriaId, veces: g.total })
  }
  return sugerencias.sort((a, b) => b.veces - a.veces).slice(0, 6)
}

function PanelReglas({ usuarioId, reglas, categorias, cuentas, transacciones }: PanelReglasProps) {
  const { avisar } = useAvisos()
  const [borrador, setBorrador] = useState<Borrador | null>(null)
  const [eliminando, setEliminando] = useState<Regla | null>(null)
  /** Regla recién guardada: se ofrece aplicarla a lo ya registrado. */
  const [aplicando, setAplicando] = useState<Regla | null>(null)
  const [seleccion, setSeleccion] = useState<Set<string>>(new Set())
  const [error, setError] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)

  const porId = useMemo(() => new Map(categorias.map((c) => [c.id, c])), [categorias])
  const cuentasPorId = new Map(cuentas.map((c) => [c.id, c]))
  const sugerencias = useMemo(() => sugerirReglas(transacciones, reglas), [transacciones, reglas])

  const afectadas = useMemo(
    () => (aplicando ? afectadasPorRegla(aplicando, transacciones, reglas) : []),
    [aplicando, transacciones, reglas],
  )

  function abrir(r?: Regla, inicial?: Partial<Borrador>) {
    setError(null)
    setBorrador(
      r
        ? {
            id: r.id,
            patron: r.patron,
            aplica: r.tipo ?? 'ambos',
            categoriaId: r.categoriaId,
            cuentaId: r.cuentaId ?? '',
            etiquetas: r.etiquetas ?? [],
          }
        : {
            patron: '',
            aplica: 'gasto',
            categoriaId: categorias.find((c) => c.tipo === 'gasto')?.id ?? categorias[0]?.id ?? '',
            cuentaId: '',
            etiquetas: [],
            ...inicial,
          },
    )
  }

  function ofrecerAplicar(regla: Regla, todasLasReglas: Regla[]) {
    const candidatas = afectadasPorRegla(regla, transacciones, todasLasReglas)
    if (candidatas.length === 0) return
    setSeleccion(new Set(candidatas.map((t) => t.id)))
    setAplicando(regla)
  }

  async function guardar(e: FormEvent) {
    e.preventDefault()
    if (!borrador) return
    setGuardando(true)
    setError(null)
    const datos = {
      patron: borrador.patron,
      tipo: borrador.aplica === 'ambos' ? undefined : borrador.aplica,
      categoriaId: borrador.categoriaId,
      cuentaId: borrador.cuentaId || undefined,
      etiquetas: borrador.etiquetas,
    }
    try {
      let guardada: Regla
      if (borrador.id) {
        await actualizarRegla(borrador.id, datos, usuarioId)
        guardada = { ...(reglas.find((r) => r.id === borrador.id) as Regla), ...datos, patron: datos.patron.trim() }
      } else {
        guardada = await crearRegla(datos, usuarioId)
      }
      avisar(borrador.id ? 'Regla actualizada' : 'Regla creada: se aplicará a lo que registres o importes')
      setBorrador(null)
      ofrecerAplicar(guardada, [...reglas.filter((r) => r.id !== guardada.id), guardada])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar.')
    } finally {
      setGuardando(false)
    }
  }

  async function confirmarAplicar() {
    if (!aplicando) return
    const n = await aplicarReglaAExistentes(aplicando, [...seleccion])
    avisar(`${n} movimiento${n === 1 ? '' : 's'} recategorizado${n === 1 ? '' : 's'}`)
    setAplicando(null)
  }

  const categoriasCompatibles = borrador
    ? ordenJerarquico(
        categorias.filter((c) => borrador.aplica === 'ambos' || c.tipo === borrador.aplica || c.tipo === 'ambos'),
      )
    : []

  const describir = (r: Regla) =>
    [
      r.tipo === 'gasto' ? 'Gastos' : r.tipo === 'ingreso' ? 'Ingresos' : 'Gastos e ingresos',
      r.cuentaId && cuentasPorId.get(r.cuentaId) ? `cuenta ${cuentasPorId.get(r.cuentaId)!.nombre}` : null,
      r.etiquetas?.length ? `#${r.etiquetas.join(' #')}` : null,
    ]
      .filter(Boolean)
      .join(' · ')

  return (
    <div className="ui segment">
      <div className="titulo-bloque">
        <h3 className="ui header">
          <i className="magic icon" />
          <div className="content">
            Reglas automáticas
            <div className="sub header">Si el concepto dice…, se categoriza solo (al registrar e importar)</div>
          </div>
        </h3>
        <button type="button" className="ui primary button" onClick={() => abrir()}>
          <i className="plus icon" />
          Nueva
        </button>
      </div>

      {sugerencias.length > 0 && (
        <div className="sugerencias-reglas">
          <p className="texto-suave">
            <i className="lightbulb outline icon" />
            Sugerencias según lo que ya registraste:
          </p>
          <div className="chips-sugerencia">
            {sugerencias.map((s) => {
              const categoria = porId.get(s.categoriaId)
              return (
                <button
                  key={`${s.tipo}|${s.patron}`}
                  type="button"
                  className="chip-sugerencia"
                  onClick={() => abrir(undefined, { patron: s.patron, aplica: s.tipo, categoriaId: s.categoriaId })}
                >
                  «{s.patron}» → {categoria?.nombre ?? '—'}
                  <small> ({s.veces} veces)</small>
                </button>
              )
            })}
          </div>
        </div>
      )}

      {reglas.length === 0 ? (
        <p className="texto-suave">
          Ejemplo: si el concepto contiene <strong>uber</strong> → <strong>Transporte</strong>. Así no eliges la
          categoría cada vez, y los reportes de Yape o del banco se ordenan solos.
        </p>
      ) : (
        <div className="lista-transacciones ui divided list">
          {[...reglas]
            .sort((a, b) => a.patron.localeCompare(b.patron, 'es'))
            .map((r) => {
              const categoria = porId.get(r.categoriaId)
              return (
                <div key={r.id} className="item">
                  <span className="icono-circulo" style={{ background: categoria?.color ?? '#898781' }}>
                    <i className={`${categoria?.icono ?? 'tag'} icon`} />
                  </span>
                  <div className="detalle">
                    <div className="header">
                      «{r.patron}» → {nombreCompleto(categoria, porId)}
                    </div>
                    <div className="description">{describir(r)}</div>
                  </div>
                  <div className="monto">
                    <div className="ui mini basic icon buttons">
                      <button
                        type="button"
                        className="ui button"
                        title="Aplicar a lo ya registrado"
                        aria-label="Aplicar a lo ya registrado"
                        onClick={() => {
                          if (afectadasPorRegla(r, transacciones, reglas).length === 0) {
                            avisar('No hay movimientos por recategorizar con esta regla', 'info')
                          } else {
                            ofrecerAplicar(r, reglas)
                          }
                        }}
                      >
                        <i className="history icon" />
                      </button>
                      <button type="button" className="ui button" aria-label="Editar" onClick={() => abrir(r)}>
                        <i className="pencil alternate icon" />
                      </button>
                      <button type="button" className="ui button" aria-label="Eliminar" onClick={() => setEliminando(r)}>
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
        titulo={borrador?.id ? 'Editar regla' : 'Nueva regla automática'}
        icono="magic"
        onCerrar={() => setBorrador(null)}
      >
        {borrador && (
          <form className={`ui form ${error ? 'error' : ''}`} onSubmit={guardar}>
            <div className="field required">
              <label htmlFor="rg-patron">Si el concepto contiene</label>
              <input
                id="rg-patron"
                value={borrador.patron}
                maxLength={60}
                placeholder="Ej. uber, netflix, plaza vea"
                onChange={(e) => setBorrador({ ...borrador, patron: e.target.value })}
                autoFocus
                required
              />
              <small className="texto-suave">No importan mayúsculas ni tildes. Si dos reglas coinciden, gana la más específica.</small>
            </div>
            <div className="field">
              <label>Aplica a</label>
              <div className="ui fluid three buttons">
                {(
                  [
                    ['gasto', 'Gastos'],
                    ['ingreso', 'Ingresos'],
                    ['ambos', 'Ambos'],
                  ] as [Aplica, string][]
                ).map(([id, etiqueta]) => (
                  <button
                    key={id}
                    type="button"
                    aria-pressed={borrador.aplica === id}
                    className={`ui button ${borrador.aplica === id ? 'primary' : 'basic'}`}
                    onClick={() => setBorrador({ ...borrador, aplica: id })}
                  >
                    {etiqueta}
                  </button>
                ))}
              </div>
            </div>
            <div className="two fields">
              <div className="field required">
                <label htmlFor="rg-categoria">Entonces, categoría</label>
                <select
                  id="rg-categoria"
                  className="ui dropdown"
                  value={borrador.categoriaId}
                  onChange={(e) => setBorrador({ ...borrador, categoriaId: e.target.value })}
                >
                  {categoriasCompatibles.map(([c, sub]) => (
                    <option key={c.id} value={c.id}>
                      {sub ? `  › ${c.nombre}` : c.nombre}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="rg-cuenta">Y cuenta (opcional)</label>
                <select
                  id="rg-cuenta"
                  className="ui dropdown"
                  value={borrador.cuentaId}
                  onChange={(e) => setBorrador({ ...borrador, cuentaId: e.target.value })}
                >
                  <option value="">No cambiar la cuenta</option>
                  {cuentas.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nombre}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="field">
              <label htmlFor="rg-etiquetas">Y agregar etiquetas (opcional)</label>
              <CampoEtiquetas
                id="rg-etiquetas"
                etiquetas={borrador.etiquetas}
                onCambiar={(etiquetas) => setBorrador({ ...borrador, etiquetas })}
                sugerencias={etiquetasUsadas(transacciones)}
              />
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
              <button type="submit" className={`ui primary button ${guardando ? 'loading' : ''}`} disabled={guardando}>
                <i className="save icon" />
                Guardar
              </button>
            </div>
          </form>
        )}
      </Modal>

      <Modal
        abierto={aplicando !== null}
        titulo={`¿Aplicar «${aplicando?.patron ?? ''}» a lo ya registrado?`}
        icono="history"
        onCerrar={() => setAplicando(null)}
      >
        {aplicando && (
          <>
            <p>
              {afectadas.length} movimiento{afectadas.length === 1 ? '' : 's'} coincide
              {afectadas.length === 1 ? '' : 'n'} y pasaría{afectadas.length === 1 ? '' : 'n'} a{' '}
              <strong>{nombreCompleto(porId.get(aplicando.categoriaId), porId)}</strong>. Desmarca los que no quieras cambiar.
            </p>
            <div className="lista-aplicar">
              {afectadas.slice(0, 100).map((t) => (
                <label key={t.id} className="casilla fila-aplicar">
                  <input
                    type="checkbox"
                    checked={seleccion.has(t.id)}
                    onChange={(e) => {
                      const nueva = new Set(seleccion)
                      if (e.target.checked) nueva.add(t.id)
                      else nueva.delete(t.id)
                      setSeleccion(nueva)
                    }}
                  />
                  <span className="texto">
                    {t.concepto} <small className="texto-suave">· {formatearFecha(t.fecha)} · {porId.get(t.categoriaId)?.nombre ?? 'Sin categoría'}</small>
                  </span>
                  <strong className={t.tipo === 'ingreso' ? 'texto-ingreso' : 'texto-gasto'}>{formatearMoneda(t.monto)}</strong>
                </label>
              ))}
            </div>
            <div className="acciones-formulario">
              <button type="button" className="ui basic button" onClick={() => setAplicando(null)}>
                Ahora no
              </button>
              <button type="button" className="ui primary button" disabled={seleccion.size === 0} onClick={confirmarAplicar}>
                <i className="check icon" />
                Recategorizar {seleccion.size}
              </button>
            </div>
          </>
        )}
      </Modal>

      <Modal
        abierto={eliminando !== null}
        titulo={`¿Eliminar la regla «${eliminando?.patron ?? ''}»?`}
        icono="trash alternate outline"
        tamano="tiny"
        onCerrar={() => setEliminando(null)}
      >
        <p>Los movimientos ya categorizados no cambian.</p>
        <div className="acciones-formulario">
          <button type="button" className="ui basic button" onClick={() => setEliminando(null)}>
            Cancelar
          </button>
          <button
            type="button"
            className="ui red button"
            onClick={() => {
              if (eliminando) void eliminarRegla(eliminando)
              avisar('Regla eliminada', 'info')
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

export default PanelReglas
