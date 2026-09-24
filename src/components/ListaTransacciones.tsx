import { useMemo } from 'react'
import type { Categoria, Cuenta, Transaccion } from '../types'
import { formatearFecha, formatearMoneda } from '../utils/formato'

interface ListaTransaccionesProps {
  transacciones: Transaccion[]
  categorias: Categoria[]
  cuentas: Cuenta[]
  titulo?: string
  limite?: number
  /** Acción opcional junto al título (p. ej. "Ver todas"). */
  accion?: { texto: string; onClick: () => void }
}

const COLOR_ICONO_POR_DEFECTO = '#767676'

function ListaTransacciones({
  transacciones,
  categorias,
  cuentas,
  titulo = 'Transacciones recientes',
  limite = 15,
  accion,
}: ListaTransaccionesProps) {
  const categoriasPorId = useMemo(
    () => new Map(categorias.map((c) => [c.id, c])),
    [categorias],
  )

  const nombresCuentas = useMemo(
    () => new Map(cuentas.map((c) => [c.id, c.nombre])),
    [cuentas],
  )

  const visibles = transacciones.slice(0, limite)

  return (
    <div className="ui segment">
      <div className="barra-filtros">
        <h3 className="ui header">
          <i className="list alternate outline icon" />
          <div className="content">
            {titulo}
            <div className="sub header">
              {transacciones.length} movimiento
              {transacciones.length === 1 ? '' : 's'}
            </div>
          </div>
        </h3>
        {accion && transacciones.length > limite && (
          <button
            type="button"
            className="ui basic tiny button"
            onClick={accion.onClick}
          >
            {accion.texto}
            <i className="right chevron icon" />
          </button>
        )}
      </div>

      {visibles.length === 0 ? (
        <div className="ui placeholder segment">
          <div className="ui icon header">
            <i className="inbox icon" />
            Aún no hay transacciones registradas.
          </div>
        </div>
      ) : (
        <div className="lista-transacciones ui divided list">
          {visibles.map((t) => {
            const categoria = categoriasPorId.get(t.categoriaId)
            const nombreCuenta = nombresCuentas.get(t.cuentaId)
            const esIngreso = t.tipo === 'ingreso'

            return (
              <div key={t.id} className="item">
                <span
                  className="icono-circulo"
                  style={{
                    background: categoria?.color ?? COLOR_ICONO_POR_DEFECTO,
                  }}
                >
                  <i className={`${categoria?.icono ?? 'tag'} icon`} />
                </span>

                <div className="detalle">
                  <div className="header">
                    {t.concepto || categoria?.nombre || 'Sin categoría'}
                  </div>
                  <div className="description">
                    {formatearFecha(t.fecha)}
                    {t.concepto && categoria ? ` · ${categoria.nombre}` : ''}
                    {nombreCuenta ? ` · ${nombreCuenta}` : ''}
                  </div>
                </div>

                <div className="monto">
                  <strong className={esIngreso ? 'texto-ingreso' : 'texto-gasto'}>
                    {esIngreso ? '+' : '-'}
                    {formatearMoneda(t.monto)}
                  </strong>
                  <div>
                    {t.origen === 'yape' && (
                      <span className="ui mini purple basic label">Yape</span>
                    )}
                    <span
                      className={`ui mini basic label ${t.sincronizado ? '' : 'orange'}`}
                      title={t.sincronizado ? 'Sincronizado' : 'Pendiente de sincronizar'}
                    >
                      <i
                        className={`${t.sincronizado ? 'check' : 'clock outline'} icon`}
                      />
                      {t.sincronizado ? 'Sync' : 'Pendiente'}
                    </span>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default ListaTransacciones
