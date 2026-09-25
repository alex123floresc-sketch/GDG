import { useMemo, type ReactNode } from 'react'
import type { Categoria, Cuenta, Transaccion } from '../types'
import { esMovimientoReal } from '../utils/analisis'
import { formatearDolares, formatearMoneda } from '../utils/formato'

interface ListaTransaccionesProps {
  transacciones: Transaccion[]
  categorias: Categoria[]
  cuentas: Cuenta[]
  titulo?: string
  limite?: number
  /** Acción opcional junto al título (p. ej. "Ver todas"). */
  accion?: { texto: string; onClick: () => void }
  /** Muestra la suma de ingresos y gastos de la lista junto al título. */
  mostrarTotales?: boolean
  /** Al tocar un movimiento (p. ej. para editarlo). */
  onSeleccionar?: (t: Transaccion) => void
  /** Contenido extra bajo el título (p. ej. exportar). */
  extra?: ReactNode
  vacio?: string
}

const COLOR_ICONO_POR_DEFECTO = '#898781'

const formateadorDia = new Intl.DateTimeFormat('es-PE', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
})

function etiquetaDia(fecha: Date): string {
  const hoy = new Date()
  const inicio = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  const dias = Math.round((inicio(hoy) - inicio(fecha)) / 86_400_000)
  if (dias === 0) return 'Hoy'
  if (dias === 1) return 'Ayer'
  const texto = formateadorDia.format(fecha)
  const conAnio = fecha.getFullYear() !== hoy.getFullYear() ? `${texto} de ${fecha.getFullYear()}` : texto
  return conAnio.charAt(0).toUpperCase() + conAnio.slice(1)
}

function ListaTransacciones({
  transacciones,
  categorias,
  cuentas,
  titulo = 'Transacciones recientes',
  limite = 15,
  accion,
  mostrarTotales = false,
  onSeleccionar,
  extra,
  vacio = 'No hay movimientos que mostrar.',
}: ListaTransaccionesProps) {
  const categoriasPorId = useMemo(() => new Map(categorias.map((c) => [c.id, c])), [categorias])
  const nombresCuentas = useMemo(() => new Map(cuentas.map((c) => [c.id, c.nombre])), [cuentas])

  // Una transferencia se muestra como una sola fila (no sus dos patas).
  const { filas, patasPorTransferencia } = useMemo(() => {
    const patas = new Map<string, Transaccion[]>()
    const unicas: Transaccion[] = []
    for (const t of transacciones) {
      if (t.transferenciaId) {
        const existentes = patas.get(t.transferenciaId)
        if (existentes) {
          existentes.push(t)
          continue
        }
        patas.set(t.transferenciaId, [t])
      }
      unicas.push(t)
    }
    return { filas: unicas, patasPorTransferencia: patas }
  }, [transacciones])

  const visibles = useMemo(() => filas.slice(0, limite), [filas, limite])

  const grupos = useMemo(() => {
    const porDia: { clave: string; etiqueta: string; items: Transaccion[]; neto: number }[] = []
    for (const t of visibles) {
      const clave = t.fecha.toDateString()
      let grupo = porDia[porDia.length - 1]
      if (!grupo || grupo.clave !== clave) {
        grupo = { clave, etiqueta: etiquetaDia(t.fecha), items: [], neto: 0 }
        porDia.push(grupo)
      }
      grupo.items.push(t)
      if (esMovimientoReal(t)) grupo.neto += t.tipo === 'ingreso' ? t.monto : -t.monto
    }
    return porDia
  }, [visibles])

  const totales = useMemo(() => {
    if (!mostrarTotales) return null
    let ingresos = 0
    let gastos = 0
    for (const t of transacciones) {
      if (!esMovimientoReal(t)) continue
      if (t.tipo === 'ingreso') ingresos += t.monto
      else gastos += t.monto
    }
    return { ingresos, gastos }
  }, [transacciones, mostrarTotales])

  function renderFila(t: Transaccion) {
    const esTransferencia = Boolean(t.transferenciaId)
    const categoria = categoriasPorId.get(t.categoriaId)
    const nombreCuenta = nombresCuentas.get(t.cuentaId)
    const esIngreso = t.tipo === 'ingreso'

    let tituloFila: string
    let detalle: string
    if (esTransferencia) {
      const patas = patasPorTransferencia.get(t.transferenciaId!) ?? [t]
      const salida = patas.find((p) => p.tipo === 'gasto')
      const entrada = patas.find((p) => p.tipo === 'ingreso')
      const desde = salida ? nombresCuentas.get(salida.cuentaId) : undefined
      const hacia = entrada ? nombresCuentas.get(entrada.cuentaId) : undefined
      tituloFila = t.concepto || 'Transferencia'
      detalle = desde && hacia ? `${desde} → ${hacia}` : desde ? `Desde ${desde}` : `Hacia ${hacia ?? '—'}`
    } else {
      tituloFila = t.concepto || categoria?.nombre || 'Sin categoría'
      detalle = [t.concepto && categoria ? categoria.nombre : null, nombreCuenta]
        .filter(Boolean)
        .join(' · ')
    }

    const contenido = (
      <>
        <span
          className="icono-circulo"
          style={{
            background: esTransferencia
              ? 'var(--color-marca)'
              : (categoria?.color ?? COLOR_ICONO_POR_DEFECTO),
          }}
        >
          <i className={`${esTransferencia ? 'exchange' : (categoria?.icono ?? 'tag')} icon`} />
        </span>

        <div className="detalle">
          <div className="header">{tituloFila}</div>
          <div className="description">{detalle || '—'}</div>
        </div>

        <div className="monto">
          <strong className={esTransferencia ? '' : esIngreso ? 'texto-ingreso' : 'texto-gasto'}>
            {esTransferencia ? '' : esIngreso ? '+' : '-'}
            {t.moneda === 'USD' && t.montoOriginal !== undefined
              ? formatearDolares(t.montoOriginal)
              : formatearMoneda(t.monto)}
          </strong>
          {t.moneda === 'USD' && <div className="equivalente-soles">≈ {formatearMoneda(t.monto)}</div>}
          <div>
            {t.origen === 'yape' && (
              <span className="ui mini violet basic label">
                <i className="mobile alternate icon" />
                Yape
              </span>
            )}
            {t.origen === 'recurrente' && (
              <span className="ui mini basic label" title="Generado por un movimiento recurrente">
                <i className="redo alternate icon" />
                Auto
              </span>
            )}
            {!t.sincronizado && (
              <span className="ui mini orange basic label" title="Pendiente de sincronizar">
                <i className="clock outline icon" />
                Pendiente
              </span>
            )}
          </div>
        </div>
      </>
    )

    return onSeleccionar ? (
      <button key={t.id} type="button" className="item clicable" onClick={() => onSeleccionar(t)}>
        {contenido}
      </button>
    ) : (
      <div key={t.id} className="item">
        {contenido}
      </div>
    )
  }

  return (
    <div className="ui segment">
      <div className="barra-filtros">
        <h3 className="ui header">
          <i className="list alternate outline icon" />
          <div className="content">
            {titulo}
            <div className="sub header">
              {filas.length} movimiento{filas.length === 1 ? '' : 's'}
              {filas.length > limite && ` · mostrando ${limite}`}
            </div>
          </div>
        </h3>
        {totales && (
          <div className="totales-lista">
            <span className="ui basic label">
              <i className="arrow down icon texto-ingreso" />
              {formatearMoneda(totales.ingresos)}
            </span>
            <span className="ui basic label">
              <i className="arrow up icon texto-gasto" />
              {formatearMoneda(totales.gastos)}
            </span>
          </div>
        )}
        {accion && filas.length > limite && (
          <button type="button" className="ui basic tiny button" onClick={accion.onClick}>
            {accion.texto}
            <i className="right chevron icon" />
          </button>
        )}
      </div>
      {extra}

      {visibles.length === 0 ? (
        <div className="estado-vacio">
          <i className="inbox icon" />
          <p>{vacio}</p>
        </div>
      ) : (
        grupos.map((g) => (
          <div key={g.clave} className="grupo-dia">
            <div className="cabecera-dia">
              <span>{g.etiqueta}</span>
              {g.neto !== 0 && (
                <span className={g.neto > 0 ? 'texto-ingreso' : 'texto-suave'}>
                  {g.neto > 0 ? '+' : '-'}
                  {formatearMoneda(Math.abs(g.neto))}
                </span>
              )}
            </div>
            <div className="lista-transacciones ui divided list">{g.items.map(renderFila)}</div>
          </div>
        ))
      )}
    </div>
  )
}

export default ListaTransacciones
