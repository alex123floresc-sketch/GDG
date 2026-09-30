import { useEffect, useState } from 'react'
import { useAvisos } from '../hooks/useAvisos'
import {
  activarPush,
  cambiarHoraPush,
  desactivarPush,
  estadoPush,
  probarNotificacion,
  type EstadoPush,
} from '../services/pushService'

const CLAVE_HORA = 'gg:horaRecordatorio'

function leerHora(): number {
  try {
    const h = Number(localStorage.getItem(CLAVE_HORA))
    return Number.isInteger(h) && h >= 0 && h <= 23 && localStorage.getItem(CLAVE_HORA) !== null ? h : 8
  } catch {
    return 8
  }
}

function guardarHora(h: number) {
  try {
    localStorage.setItem(CLAVE_HORA, String(h))
  } catch {
    // Sin localStorage se vuelve a 8 la próxima vez (el servidor guarda la real).
  }
}

const HORAS = Array.from({ length: 24 }, (_, h) => h)
const etiquetaHora = (h: number) => `${String(h).padStart(2, '0')}:00`

/** Más → Personalizar → Recordatorios en este dispositivo (Web Push). */
function Recordatorios({ usuarioId }: { usuarioId: string }) {
  const { avisar } = useAvisos()
  const [estado, setEstado] = useState<EstadoPush | null>(null)
  const [hora, setHora] = useState(leerHora)
  const [ocupado, setOcupado] = useState(false)

  useEffect(() => {
    let vigente = true
    void estadoPush().then((e) => vigente && setEstado(e))
    return () => {
      vigente = false
    }
  }, [])

  async function ejecutar(accion: () => Promise<void>, exito?: string) {
    setOcupado(true)
    try {
      await accion()
      if (exito) avisar(exito)
    } catch (e) {
      avisar(e instanceof Error ? e.message : 'No se pudo completar.', 'error')
    } finally {
      setEstado(await estadoPush())
      setOcupado(false)
    }
  }

  function elegirHora(h: number) {
    setHora(h)
    guardarHora(h)
    if (estado === 'activo') void ejecutar(() => cambiarHoraPush(usuarioId, h), `Te avisaremos a las ${etiquetaHora(h)}`)
  }

  return (
    <section className="ui segment">
      <h3 className="ui header">
        <i className="bell outline icon" />
        <div className="content">
          Recordatorios en este dispositivo
          <div className="sub header">
            Un aviso al día cuando vence un pago recurrente, una cuota, el pago de tu tarjeta o una deuda (hoy o
            mañana).
          </div>
        </div>
      </h3>

      {estado === null && <div className="ui active inline mini loader" />}
      {estado === 'no-soportado' && (
        <p className="texto-suave">
          Este navegador no admite notificaciones. En iPhone, primero instala la app («Compartir → Agregar a
          inicio») y ábrela desde el ícono.
        </p>
      )}
      {estado === 'sin-configurar' && (
        <p className="texto-suave" title="Falta VITE_VAPID_PUBLIC_KEY (ver supabase/functions/recordatorios/LEEME.md)">
          Los recordatorios todavía no están disponibles en esta versión de la app.
        </p>
      )}
      {estado === 'bloqueado' && (
        <p className="texto-suave">
          Bloqueaste las notificaciones para esta app. Actívalas en la configuración del navegador (ícono del
          candado junto a la dirección) y vuelve aquí.
        </p>
      )}

      {(estado === 'activo' || estado === 'inactivo') && (
        <div className="ui form">
          <div className="inline field">
            <label htmlFor="hora-recordatorio">Hora del aviso</label>
            <select
              id="hora-recordatorio"
              className="ui dropdown"
              value={hora}
              disabled={ocupado}
              onChange={(e) => elegirHora(Number(e.target.value))}
            >
              {HORAS.map((h) => (
                <option key={h} value={h}>
                  {etiquetaHora(h)}
                </option>
              ))}
            </select>
          </div>
          {estado === 'inactivo' ? (
            <button
              type="button"
              className={`ui primary button ${ocupado ? 'loading' : ''}`}
              disabled={ocupado}
              onClick={() => void ejecutar(() => activarPush(usuarioId, hora), 'Recordatorios activados')}
            >
              <i className="bell icon" />
              Activar recordatorios
            </button>
          ) : (
            <>
              <span className="ui green basic label">
                <i className="check icon" />
                Activados
              </span>{' '}
              <button
                type="button"
                className="ui basic button"
                disabled={ocupado}
                onClick={() => void ejecutar(probarNotificacion)}
              >
                Probar
              </button>
              <button
                type="button"
                className="ui basic button"
                disabled={ocupado}
                onClick={() => void ejecutar(() => desactivarPush(usuarioId), 'Recordatorios desactivados')}
              >
                Desactivar
              </button>
            </>
          )}
        </div>
      )}
    </section>
  )
}

export default Recordatorios
