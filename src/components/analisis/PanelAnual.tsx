import { useMemo, useState } from 'react'
import { useAvisos } from '../../hooks/useAvisos'
import type { Ajustes, Categoria, Deseo, Meta, Transaccion } from '../../types'
import { aniosDisponibles } from '../../utils/analisis'
import { resumenAnual } from '../../utils/anual'
import { formatearFecha, formatearMoneda, formatearPorcentaje } from '../../utils/formato'
import { textoHoras, valorHora } from '../../utils/horas'

interface PanelAnualProps {
  transacciones: Transaccion[]
  categorias: Categoria[]
  metas: Meta[]
  deseos: Deseo[]
  ajustes: Ajustes
}

/** Análisis → Tu año: el resumen de fin de año, en tarjetas. */
function PanelAnual({ transacciones, categorias, metas, deseos, ajustes }: PanelAnualProps) {
  const { avisar } = useAvisos()
  const [hoy] = useState(() => new Date())
  const anios = useMemo(() => aniosDisponibles(transacciones), [transacciones])
  // En enero todavía se mira el año que terminó.
  const [anio, setAnio] = useState(() => (hoy.getMonth() === 0 ? hoy.getFullYear() - 1 : hoy.getFullYear()))
  const r = useMemo(() => resumenAnual(transacciones, categorias, metas, deseos, anio, hoy), [transacciones, categorias, metas, deseos, anio, hoy])
  const hora = useMemo(() => valorHora(ajustes, transacciones, hoy), [ajustes, transacciones, hoy])
  const enCurso = anio === hoy.getFullYear()
  const top = r.categorias[0]

  async function compartir() {
    const texto = [
      `Mi ${anio} en números (Gestor de Gastos):`,
      `• Ingresé ${formatearMoneda(r.ingresos)} y gasté ${formatearMoneda(r.gastos)}`,
      r.tasaAhorro !== null ? `• Ahorré el ${formatearPorcentaje(Math.max(0, r.tasaAhorro))}` : null,
      top ? `• Donde más gasté: ${top.nombre} (${formatearPorcentaje(top.porcentaje)})` : null,
      r.mejorRacha > 1 ? `• Mejor racha registrando: ${r.mejorRacha} días` : null,
    ]
      .filter(Boolean)
      .join('\n')
    try {
      if (navigator.share) await navigator.share({ title: `Mi ${anio}`, text: texto })
      else {
        await navigator.clipboard.writeText(texto)
        avisar('Resumen copiado: pégalo donde quieras')
      }
    } catch {
      // El usuario canceló el menú de compartir.
    }
  }

  return (
    <>
      <div className="barra-filtros no-imprimir">
        <h2 className="ui header">
          <i className="star icon" />
          <div className="content">
            Tu {anio}
            <div className="sub header">{enCurso ? 'Lo que va del año, en números' : 'Tu año en números'}</div>
          </div>
        </h2>
        <div className="acciones-exportar">
          <select className="ui compact dropdown" aria-label="Año" value={anio} onChange={(e) => setAnio(Number(e.target.value))}>
            {anios.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
          <button type="button" className="ui basic button" onClick={() => void compartir()} disabled={r.movimientos === 0}>
            <i className="share alternate icon" />
            Compartir
          </button>
        </div>
      </div>

      {r.movimientos === 0 ? (
        <div className="ui segment estado-vacio">
          <i className="huge star outline icon texto-suave" />
          <p>No hay movimientos en {anio}.</p>
        </div>
      ) : (
        <div className="rejilla-anual">
          <section className="tarjeta-anual destacada">
            <span className="etiqueta">Este año ahorraste</span>
            <strong className={r.ahorro < 0 ? 'texto-gasto' : ''}>{formatearMoneda(r.ahorro)}</strong>
            <span>
              {r.tasaAhorro !== null
                ? r.ahorro >= 0
                  ? `El ${formatearPorcentaje(r.tasaAhorro)} de lo que ingresó`
                  : 'Gastaste más de lo que ingresó'
                : 'Sin ingresos registrados'}
            </span>
          </section>
          <section className="tarjeta-anual">
            <span className="etiqueta">Ingresaste</span>
            <strong className="texto-ingreso">{formatearMoneda(r.ingresos)}</strong>
            <span className="etiqueta">Gastaste</span>
            <strong className="texto-gasto">{formatearMoneda(r.gastos)}</strong>
            {r.vsAnterior !== null && (
              <span>
                {r.vsAnterior > 0 ? `${formatearPorcentaje(r.vsAnterior)} más` : `${formatearPorcentaje(-r.vsAnterior)} menos`} que en {anio - 1}
              </span>
            )}
          </section>
          {top && (
            <section className="tarjeta-anual">
              <span className="etiqueta">Donde más gastaste</span>
              <strong>
                <i className={`${top.icono} icon`} style={{ color: top.color }} />
                {top.nombre}
              </strong>
              <span>
                {formatearMoneda(top.total)} · {formatearPorcentaje(top.porcentaje)} de tus gastos
              </span>
              <ol className="top-anual">
                {r.categorias.slice(1, 5).map((c) => (
                  <li key={c.categoriaId}>
                    {c.nombre} <span className="texto-suave">{formatearMoneda(c.total)}</span>
                  </li>
                ))}
              </ol>
            </section>
          )}
          {r.mesMasGasto && (
            <section className="tarjeta-anual">
              <span className="etiqueta">El mes más caro</span>
              <strong>{r.mesMasGasto.nombre.charAt(0).toUpperCase() + r.mesMasGasto.nombre.slice(1)}</strong>
              <span>{formatearMoneda(r.mesMasGasto.monto)} en gastos</span>
              {r.mesMasAhorro && r.mesMasAhorro.monto > 0 && (
                <span className="texto-suave">
                  Y en {r.mesMasAhorro.nombre} ahorraste más: {formatearMoneda(r.mesMasAhorro.monto)}
                </span>
              )}
            </section>
          )}
          {r.conceptoFrecuente && r.conceptoFrecuente.veces > 2 && (
            <section className="tarjeta-anual">
              <span className="etiqueta">Tu gasto más repetido</span>
              <strong>{r.conceptoFrecuente.texto}</strong>
              <span>
                {r.conceptoFrecuente.veces} veces · {formatearMoneda(r.conceptoFrecuente.total)} en total
              </span>
            </section>
          )}
          {r.diaSemana && (
            <section className="tarjeta-anual">
              <span className="etiqueta">El día que más gastas</span>
              <strong>Los {r.diaSemana.nombre}</strong>
              <span>
                {formatearMoneda(r.diaSemana.total)} en el año · en promedio {formatearMoneda(r.promedioDiario)} al día
              </span>
            </section>
          )}
          {r.mayorGasto && (
            <section className="tarjeta-anual">
              <span className="etiqueta">Tu mayor gasto</span>
              <strong>{r.mayorGasto.concepto || 'Sin concepto'}</strong>
              <span>
                {formatearMoneda(r.mayorGasto.monto)} · {formatearFecha(r.mayorGasto.fecha)}
              </span>
              {hora && <span className="texto-suave">≈ {textoHoras(r.mayorGasto.monto, hora.valor)} de trabajo</span>}
            </section>
          )}
          <section className="tarjeta-anual">
            <span className="etiqueta">Constancia</span>
            <strong>
              <i className="fire icon" />
              {r.mejorRacha} día{r.mejorRacha === 1 ? '' : 's'}
            </strong>
            <span>
              Tu mejor racha · {r.movimientos} movimientos registrados
            </span>
            {(r.metasCompletadas > 0 || r.deseosDescartados > 0) && (
              <span className="texto-suave">
                {r.metasCompletadas > 0 ? `${r.metasCompletadas} meta${r.metasCompletadas === 1 ? '' : 's'} cumplida${r.metasCompletadas === 1 ? '' : 's'}` : ''}
                {r.metasCompletadas > 0 && r.deseosDescartados > 0 ? ' · ' : ''}
                {r.deseosDescartados > 0 ? `${formatearMoneda(r.deseosDescartados)} en deseos que resististe` : ''}
              </span>
            )}
          </section>
        </div>
      )}
    </>
  )
}

export default PanelAnual
