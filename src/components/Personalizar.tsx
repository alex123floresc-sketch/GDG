import { useState } from 'react'
import { guardarAjustes } from '../services/ajustesService'
import type { Ajustes, SeccionInicio } from '../types'
import { ordenInicio, SECCIONES_INICIO } from '../utils/inicio'
import {
  COLORES_APP,
  guardarColor,
  guardarCompacto,
  guardarLetra,
  guardarTema,
  leerColor,
  leerCompacto,
  leerLetra,
  leerTema,
  type ColorApp,
  type TamanoLetra,
  type Tema,
} from '../utils/preferencias'
import { aplicarTema } from '../utils/tema'
import Recordatorios from './Recordatorios'

interface PersonalizarProps {
  usuarioId: string
  ajustes: Ajustes
}

const TEMAS: { id: Tema; etiqueta: string; icono: string }[] = [
  { id: 'auto', etiqueta: 'Automático', icono: 'adjust' },
  { id: 'claro', etiqueta: 'Claro', icono: 'sun' },
  { id: 'oscuro', etiqueta: 'Oscuro', icono: 'moon' },
]

const LETRAS: { id: TamanoLetra; etiqueta: string; muestra: string }[] = [
  { id: 'pequena', etiqueta: 'Pequeña', muestra: '13px' },
  { id: 'normal', etiqueta: 'Normal', muestra: '14px' },
  { id: 'grande', etiqueta: 'Grande', muestra: '15.5px' },
  { id: 'muy-grande', etiqueta: 'Muy grande', muestra: '17px' },
]

/** Evento que avisa al Header que el tema cambió desde aquí. */
export const EVENTO_TEMA = 'gg:tema'

/** Más → Personalizar: apariencia (de este dispositivo) e Inicio (se sincroniza). */
function Personalizar({ usuarioId, ajustes }: PersonalizarProps) {
  const [tema, setTema] = useState(leerTema)
  const [color, setColor] = useState(leerColor)
  const [letra, setLetra] = useState(leerLetra)
  const [compacto, setCompacto] = useState(leerCompacto)

  const orden = ordenInicio(ajustes, true)
  const ocultas = new Set(ajustes.inicio?.ocultas ?? [])

  function cambiarTema(t: Tema) {
    setTema(t)
    guardarTema(t)
    aplicarTema(t)
    window.dispatchEvent(new Event(EVENTO_TEMA))
  }

  function cambiarColor(c: ColorApp) {
    setColor(c)
    guardarColor(c)
    aplicarTema()
  }

  function cambiarLetra(l: TamanoLetra) {
    setLetra(l)
    guardarLetra(l)
    aplicarTema()
  }

  function cambiarCompacto(v: boolean) {
    setCompacto(v)
    guardarCompacto(v)
    aplicarTema()
  }

  function guardarInicio(nuevoOrden: SeccionInicio[], nuevasOcultas: Set<SeccionInicio>) {
    void guardarAjustes(usuarioId, { inicio: { orden: nuevoOrden, ocultas: [...nuevasOcultas] } })
  }

  function mover(i: number, delta: number) {
    const nuevo = [...orden]
    const [s] = nuevo.splice(i, 1)
    nuevo.splice(i + delta, 0, s)
    guardarInicio(nuevo, ocultas)
  }

  function alternar(id: SeccionInicio) {
    const nuevas = new Set(ocultas)
    if (nuevas.has(id)) nuevas.delete(id)
    else nuevas.add(id)
    guardarInicio(orden, nuevas)
  }

  return (
    <>
      <div className="barra-filtros">
        <h2 className="ui header">
          <i className="paint brush icon" />
          <div className="content">
            Personalizar
            <div className="sub header">Deja la app a tu gusto</div>
          </div>
        </h2>
      </div>

      <section className="ui segment">
        <h3 className="ui header">
          <i className="palette icon" />
          <div className="content">
            Apariencia
            <div className="sub header">Se guarda en este dispositivo</div>
          </div>
        </h3>

        <div className="fila-preferencia">
          <span className="nombre-preferencia">Tema</span>
          <div className="ui buttons">
            {TEMAS.map((t) => (
              <button
                key={t.id}
                type="button"
                aria-pressed={tema === t.id}
                className={`ui button ${tema === t.id ? 'primary' : 'basic'}`}
                onClick={() => cambiarTema(t.id)}
              >
                <i className={`${t.icono} icon`} />
                {t.etiqueta}
              </button>
            ))}
          </div>
        </div>

        <div className="fila-preferencia">
          <span className="nombre-preferencia">Color</span>
          <div className="selector-color-app" role="radiogroup" aria-label="Color de la app">
            {COLORES_APP.map((c) => (
              <button
                key={c.id}
                type="button"
                role="radio"
                aria-checked={color === c.id}
                className={`opcion-color-app ${color === c.id ? 'activa' : ''}`}
                onClick={() => cambiarColor(c.id)}
              >
                <span className="muestra" style={{ background: c.muestra }}>
                  {color === c.id && <i className="check icon" />}
                </span>
                {c.nombre}
              </button>
            ))}
          </div>
        </div>

        <div className="fila-preferencia">
          <span className="nombre-preferencia">Tamaño de letra</span>
          <div className="ui buttons selector-letra">
            {LETRAS.map((l) => (
              <button
                key={l.id}
                type="button"
                aria-pressed={letra === l.id}
                className={`ui button ${letra === l.id ? 'primary' : 'basic'}`}
                onClick={() => cambiarLetra(l.id)}
              >
                <span style={{ fontSize: l.muestra }}>Aa</span>
                <small>{l.etiqueta}</small>
              </button>
            ))}
          </div>
        </div>

        <div className="fila-preferencia">
          <span className="nombre-preferencia">Modo compacto</span>
          <label className="interruptor">
            <input type="checkbox" checked={compacto} onChange={(e) => cambiarCompacto(e.target.checked)} />
            <span className="deslizador" aria-hidden="true" />
            <span>{compacto ? 'Activado: más información en pantalla' : 'Desactivado'}</span>
          </label>
        </div>
      </section>

      <section className="ui segment">
        <h3 className="ui header">
          <i className="home icon" />
          <div className="content">
            Inicio a tu gusto
            <div className="sub header">Ordena y oculta las secciones (se sincroniza en tus dispositivos)</div>
          </div>
        </h3>
        <div className="lista-secciones-inicio">
          {orden.map((id, i) => {
            const s = SECCIONES_INICIO.find((x) => x.id === id)!
            const oculta = ocultas.has(id)
            return (
              <div key={id} className={`fila-seccion-inicio ${oculta ? 'oculta' : ''}`}>
                <i className={`${s.icono} icon`} />
                <span className="nombre">{s.nombre}</span>
                <div className="ui mini basic icon buttons">
                  <button type="button" className="ui button" aria-label={`Subir ${s.nombre}`} disabled={i === 0} onClick={() => mover(i, -1)}>
                    <i className="arrow up icon" />
                  </button>
                  <button
                    type="button"
                    className="ui button"
                    aria-label={`Bajar ${s.nombre}`}
                    disabled={i === orden.length - 1}
                    onClick={() => mover(i, 1)}
                  >
                    <i className="arrow down icon" />
                  </button>
                  <button
                    type="button"
                    className="ui button"
                    aria-pressed={!oculta}
                    aria-label={oculta ? `Mostrar ${s.nombre}` : `Ocultar ${s.nombre}`}
                    title={oculta ? 'Mostrar' : 'Ocultar'}
                    onClick={() => alternar(id)}
                  >
                    <i className={`${oculta ? 'eye slash' : 'eye'} icon`} />
                  </button>
                </div>
              </div>
            )
          })}
        </div>
        {ajustes.inicio && (
          <button type="button" className="enlace-sugerencia" onClick={() => void guardarAjustes(usuarioId, { inicio: undefined })}>
            <i className="undo icon" />
            Volver al orden original
          </button>
        )}
      </section>

      <Recordatorios usuarioId={usuarioId} />
    </>
  )
}

export default Personalizar
