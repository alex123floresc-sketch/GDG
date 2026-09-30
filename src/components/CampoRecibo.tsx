import { useEffect, useRef, useState } from 'react'
import { obtenerRecibo } from '../services/reciboService'
import type { Transaccion } from '../types'

interface CampoReciboProps {
  /** Movimiento que se edita (puede tener ya una foto guardada). */
  transaccion?: Transaccion
  /** Foto elegida en este formulario (aún no guardada). */
  fotoNueva?: Blob
  /** El usuario quitó la foto que ya tenía. */
  quitada: boolean
  onElegir: (foto: Blob) => void
  onQuitar: () => void
}

/** Muestra un Blob como imagen (la URL temporal se libera al desmontar). */
function ImagenBlob({ blob }: { blob: Blob }) {
  const ref = useRef<HTMLImageElement>(null)
  useEffect(() => {
    const url = URL.createObjectURL(blob)
    if (ref.current) ref.current.src = url
    return () => URL.revokeObjectURL(url)
  }, [blob])
  return <img ref={ref} alt="Foto del recibo" />
}

/** "Foto del recibo" del formulario: adjuntar, ver en grande y quitar. */
function CampoRecibo({ transaccion, fotoNueva, quitada, onElegir, onQuitar }: CampoReciboProps) {
  const archivoRef = useRef<HTMLInputElement>(null)
  const [guardada, setGuardada] = useState<Blob | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [ampliada, setAmpliada] = useState(false)

  const tieneGuardada = !!transaccion?.recibo && !quitada && !fotoNueva
  const foto = fotoNueva ?? (tieneGuardada ? guardada : null)
  const cargando = !!transaccion?.recibo && !guardada && !error

  // La foto ya guardada se carga (o descarga) al abrir el formulario.
  useEffect(() => {
    if (!transaccion?.recibo) return
    let vigente = true
    obtenerRecibo(transaccion)
      .then((b) => {
        if (!vigente) return
        if (b) setGuardada(b)
        else setError('La foto aún no está disponible en este dispositivo.')
      })
      .catch((e: Error) => vigente && setError(e.message))
    return () => {
      vigente = false
    }
  }, [transaccion])

  return (
    <div className="field campo-recibo">
      <label>
        <i className="paperclip icon" />
        Foto del recibo (opcional)
      </label>
      <div className="fila-recibo">
        {foto ? (
          <button
            type="button"
            className={`miniatura-recibo ${ampliada ? 'ampliada' : ''}`}
            onClick={() => setAmpliada(!ampliada)}
            aria-label={ampliada ? 'Achicar la foto' : 'Ver la foto en grande'}
          >
            <ImagenBlob blob={foto} />
          </button>
        ) : (
          tieneGuardada && (
            <span className="texto-suave">
              {cargando ? (
                <>
                  <i className="notched circle loading icon" />
                  Cargando la foto…
                </>
              ) : (
                error
              )}
            </span>
          )
        )}
        <button type="button" className="ui mini basic button" onClick={() => archivoRef.current?.click()}>
          <i className="camera icon" />
          {foto || tieneGuardada ? 'Cambiar foto' : 'Adjuntar foto'}
        </button>
        {(foto || tieneGuardada) && (
          <button type="button" className="ui mini basic button" onClick={onQuitar}>
            Quitar
          </button>
        )}
        <input
          ref={archivoRef}
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => {
            const archivo = e.target.files?.[0]
            e.target.value = ''
            if (archivo) {
              setAmpliada(false)
              onElegir(archivo)
            }
          }}
        />
      </div>
    </div>
  )
}

export default CampoRecibo
