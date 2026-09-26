import { useRef, useState } from 'react'
import { useAvisos } from '../hooks/useAvisos'
import {
  descargarRespaldo,
  leerRespaldo,
  restaurarRespaldo,
  type Respaldo as DatosRespaldo,
  type ResumenRespaldo,
} from '../services/respaldoService'
import type { TablaSincronizable } from '../types'
import { formatearFecha } from '../utils/formato'
import Modal from './Modal'

const NOMBRES: Record<TablaSincronizable, string> = {
  transacciones: 'movimientos',
  categorias: 'categorías',
  cuentas: 'cuentas',
  presupuestos: 'presupuestos',
  metas: 'metas',
  deudas: 'deudas',
  recurrentes: 'recurrentes',
  chanchitos: 'chanchitos',
}

interface RespaldoProps {
  usuarioId: string
  email: string
}

/** Descargar todos los datos en un archivo y restaurarlos desde él. */
function Respaldo({ usuarioId, email }: RespaldoProps) {
  const { avisar } = useAvisos()
  const entrada = useRef<HTMLInputElement>(null)
  const [leido, setLeido] = useState<{ respaldo: DatosRespaldo; resumen: ResumenRespaldo } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [trabajando, setTrabajando] = useState(false)

  async function descargar() {
    setTrabajando(true)
    try {
      const total = await descargarRespaldo(usuarioId, email)
      avisar(`Respaldo descargado (${total} registros)`)
    } catch {
      avisar('No se pudo generar el respaldo', 'error')
    } finally {
      setTrabajando(false)
    }
  }

  async function elegirArchivo(archivo: File | undefined) {
    if (!archivo) return
    setError(null)
    try {
      setLeido(await leerRespaldo(archivo, usuarioId))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo leer el archivo.')
    } finally {
      if (entrada.current) entrada.current.value = ''
    }
  }

  async function restaurar() {
    if (!leido) return
    setTrabajando(true)
    try {
      const total = await restaurarRespaldo(leido.respaldo, usuarioId)
      avisar(`Respaldo restaurado (${total} registros); se subirá a la nube al sincronizar`)
      setLeido(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo restaurar.')
    } finally {
      setTrabajando(false)
    }
  }

  return (
    <div className="ui segment">
      <h3 className="ui header">
        <i className="save icon" />
        <div className="content">
          Respaldo de tus datos
          <div className="sub header">Una copia propia de todo, además de lo que guarda la nube.</div>
        </div>
      </h3>

      <p className="texto-suave">
        El archivo tiene tus movimientos, cuentas, categorías, presupuestos, metas, deudas, recurrentes
        y chanchitos. Guárdalo en un lugar seguro: cualquiera que lo abra puede ver tus finanzas.
      </p>

      <div className="botones-seguridad">
        <button type="button" className={`ui primary button ${trabajando ? 'loading' : ''}`} disabled={trabajando} onClick={() => void descargar()}>
          <i className="download icon" />
          Descargar respaldo
        </button>
        <button type="button" className="ui basic button" disabled={trabajando} onClick={() => entrada.current?.click()}>
          <i className="upload icon" />
          Restaurar desde archivo
        </button>
        <input
          ref={entrada}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={(e) => void elegirArchivo(e.target.files?.[0])}
        />
      </div>

      {error && !leido && (
        <div className="ui visible negative message" role="alert">
          {error}
        </div>
      )}

      <Modal abierto={leido !== null} titulo="¿Restaurar este respaldo?" icono="upload" tamano="tiny" onCerrar={() => setLeido(null)}>
        {leido && (
          <>
            <p>
              Respaldo del <strong>{formatearFecha(leido.resumen.exportado)}</strong>
              {leido.resumen.email ? ` (${leido.resumen.email})` : ''}. Contiene:
            </p>
            <ul className="ui list">
              {Object.entries(leido.resumen.conteos).map(([tabla, n]) => (
                <li key={tabla}>
                  {n} {NOMBRES[tabla as TablaSincronizable]}
                </li>
              ))}
            </ul>
            <p>
              Se <strong>agrega</strong> lo que falte y se <strong>reemplaza</strong> lo que ya existe con
              los datos del respaldo. No se borra nada que no esté en el archivo.
            </p>
            {!leido.resumen.mismoUsuario && (
              <div className="ui visible info message">
                Es de otra cuenta: se copiará a esta con identificadores nuevos. Si ya tienes cuentas o
                categorías con el mismo nombre, se unirán solas al sincronizar.
              </div>
            )}
            {error && (
              <div className="ui visible negative message" role="alert">
                {error}
              </div>
            )}
            <div className="acciones-formulario">
              <button type="button" className="ui basic button" onClick={() => setLeido(null)}>
                Cancelar
              </button>
              <button type="button" className={`ui primary button ${trabajando ? 'loading' : ''}`} disabled={trabajando} onClick={() => void restaurar()}>
                <i className="upload icon" />
                Restaurar
              </button>
            </div>
          </>
        )}
      </Modal>
    </div>
  )
}

export default Respaldo
