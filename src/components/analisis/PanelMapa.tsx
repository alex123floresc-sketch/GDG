import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { Categoria, Transaccion } from '../../types'
import { formatearFecha, formatearMoneda } from '../../utils/formato'
import {
  agruparLugares,
  desdeDePeriodo,
  gastosConUbicacion,
  PERIODOS_MAPA,
  type LugarMapa,
  type PeriodoMapa,
} from '../../utils/mapa'
import Ilustracion from '../Ilustracion'

/*
 * Análisis → Mapa. Se carga con React.lazy (Leaflet ~150 kB solo para quien
 * abre esta pestaña). Mapa base de OpenStreetMap: sin conexión se ven los
 * puntos sobre fondo liso, y la tabla de lugares siempre está.
 */

interface PanelMapaProps {
  transacciones: Transaccion[]
  categorias: Categoria[]
}

const COLOR_SIN_CATEGORIA = 'var(--color-texto-suave)'

/** Contenido del popup armado con textContent (el nombre lo escribe el usuario). */
function contenidoPopup(lugar: LugarMapa, categoria?: Categoria): HTMLElement {
  const div = document.createElement('div')
  div.className = 'popup-lugar'
  const titulo = document.createElement('strong')
  titulo.textContent = lugar.nombre
  const total = document.createElement('div')
  total.textContent = `${formatearMoneda(lugar.total)} · ${lugar.veces} ${lugar.veces === 1 ? 'vez' : 'veces'}`
  const detalle = document.createElement('div')
  detalle.className = 'texto-suave'
  detalle.textContent = `${categoria?.nombre ?? 'Sin categoría'} · última: ${formatearFecha(lugar.ultima)}`
  div.append(titulo, total, detalle)
  return div
}

function PanelMapa({ transacciones, categorias }: PanelMapaProps) {
  const [periodo, setPeriodo] = useState<PeriodoMapa>('tres')
  const contenedor = useRef<HTMLDivElement>(null)
  const mapa = useRef<L.Map | null>(null)
  const capa = useRef<L.LayerGroup | null>(null)
  const marcadores = useRef(new Map<string, L.CircleMarker>())

  const porId = useMemo(() => new Map(categorias.map((c) => [c.id, c])), [categorias])
  const gastos = useMemo(
    () => gastosConUbicacion(transacciones, desdeDePeriodo(periodo)),
    [transacciones, periodo],
  )
  const lugares = useMemo(() => agruparLugares(gastos, categorias), [gastos, categorias])
  const totalConUbicacion = useMemo(() => gastosConUbicacion(transacciones, null).length, [transacciones])
  const total = lugares.reduce((s, l) => s + l.total, 0)

  // Crea el mapa una vez (el div existe solo si hay lugares).
  const hayLugares = lugares.length > 0
  useEffect(() => {
    if (!hayLugares || !contenedor.current || mapa.current) return
    const m = L.map(contenedor.current, { zoomControl: true, attributionControl: true })
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(m)
    capa.current = L.layerGroup().addTo(m)
    mapa.current = m
    return () => {
      m.remove()
      mapa.current = null
      capa.current = null
    }
  }, [hayLugares])

  // Dibuja los lugares: círculo con área proporcional al gasto, color de la categoría.
  useEffect(() => {
    const m = mapa.current
    const grupo = capa.current
    if (!m || !grupo) return
    grupo.clearLayers()
    marcadores.current.clear()
    if (lugares.length === 0) return
    const maximo = Math.max(...lugares.map((l) => l.total))
    const estilo = getComputedStyle(document.documentElement)
    const borde = estilo.getPropertyValue('--color-superficie').trim() || '#fff'
    for (const lugar of [...lugares].reverse()) {
      const categoria = porId.get(lugar.categoriaId)
      const color = categoria?.color || estilo.getPropertyValue('--color-texto-suave').trim() || '#888'
      const marcador = L.circleMarker([lugar.lat, lugar.lng], {
        radius: 7 + 17 * Math.sqrt(lugar.total / maximo),
        color: borde,
        weight: 2,
        fillColor: color,
        fillOpacity: 0.85,
      })
        .bindPopup(contenidoPopup(lugar, categoria))
        .bindTooltip(lugar.nombre)
      marcador.addTo(grupo)
      marcadores.current.set(lugar.clave, marcador)
    }
    const limites = L.latLngBounds(lugares.map((l) => [l.lat, l.lng] as [number, number]))
    m.fitBounds(limites, { padding: [36, 36], maxZoom: 16 })
    // El contenedor pudo cambiar de tamaño (pestañas, modo compacto).
    setTimeout(() => m.invalidateSize(), 0)
  }, [lugares, porId])

  function verLugar(lugar: LugarMapa) {
    const m = mapa.current
    const marcador = marcadores.current.get(lugar.clave)
    if (!m || !marcador) return
    m.flyTo([lugar.lat, lugar.lng], Math.max(m.getZoom(), 16), { duration: 0.6 })
    marcador.openPopup()
    contenedor.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }

  return (
    <>
      <div className="fila-filtros ui form">
        <div className="ui small buttons">
          {PERIODOS_MAPA.map((p) => (
            <button
              key={p.id}
              type="button"
              className={`ui button ${periodo === p.id ? 'primary' : 'basic'}`}
              onClick={() => setPeriodo(p.id)}
            >
              {p.etiqueta}
            </button>
          ))}
        </div>
      </div>

      {!hayLugares ? (
        <div className="ui segment estado-vacio">
          <Ilustracion nombre="mapa" />
          <p>
            {totalConUbicacion === 0
              ? 'Aún no tienes gastos con ubicación.'
              : 'No hay gastos con ubicación en este periodo.'}
          </p>
          {totalConUbicacion === 0 && (
            <p className="texto-suave">
              Al registrar un gasto, toca <strong>«Usar mi ubicación actual»</strong> para verlo aquí.
            </p>
          )}
        </div>
      ) : (
        <>
          <p className="texto-suave nota-formulario">
            {gastos.length} {gastos.length === 1 ? 'gasto' : 'gastos'} en {lugares.length}{' '}
            {lugares.length === 1 ? 'lugar' : 'lugares'} · {formatearMoneda(total)}. El tamaño del círculo es lo
            gastado; el color, la categoría principal.
          </p>
          <div ref={contenedor} className="mapa-gastos" role="region" aria-label="Mapa de gastos" />

          <div className="ui segment">
            <h4 className="ui header">Dónde gastas más</h4>
            <div className="tabla-desplazable">
              <table className="ui very basic unstackable compact table">
                <thead>
                  <tr>
                    <th>Lugar</th>
                    <th>Categoría</th>
                    <th className="right aligned">Veces</th>
                    <th className="right aligned">Total</th>
                    <th className="right aligned">Última</th>
                  </tr>
                </thead>
                <tbody>
                  {lugares.map((l) => {
                    const cat = porId.get(l.categoriaId)
                    return (
                      <tr key={l.clave}>
                        <td>
                          <button type="button" className="enlace-tabla" onClick={() => verLugar(l)}>
                            {l.nombre}
                          </button>
                        </td>
                        <td>
                          <span className="punto-leyenda" style={{ background: cat?.color || COLOR_SIN_CATEGORIA }} />
                          {cat?.nombre ?? 'Sin categoría'}
                        </td>
                        <td className="right aligned">{l.veces}</td>
                        <td className="right aligned">{formatearMoneda(l.total)}</td>
                        <td className="right aligned">{formatearFecha(l.ultima)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </>
  )
}

export default PanelMapa
