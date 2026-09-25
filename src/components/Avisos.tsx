import { useCallback, useMemo, useRef, useState, type ReactNode } from 'react'
import { AvisosContext, type Aviso, type TipoAviso } from '../hooks/useAvisos'

const DURACION_MS = 3500
const ICONOS: Record<TipoAviso, string> = {
  exito: 'check circle',
  error: 'exclamation circle',
  info: 'info circle',
}

/** Proveedor de avisos (toasts): envuelve la app y los dibuja. */
function Avisos({ children }: { children: ReactNode }) {
  const [avisos, setAvisos] = useState<Aviso[]>([])
  const siguienteId = useRef(1)

  const cerrar = useCallback((id: number) => {
    setAvisos((actuales) => actuales.filter((a) => a.id !== id))
  }, [])

  const avisar = useCallback(
    (texto: string, tipo: TipoAviso = 'exito', accion?: Aviso['accion']) => {
      const id = siguienteId.current++
      setAvisos((actuales) => [...actuales.slice(-2), { id, tipo, texto, accion }])
      window.setTimeout(() => cerrar(id), accion ? DURACION_MS * 1.6 : DURACION_MS)
    },
    [cerrar],
  )

  const valor = useMemo(() => ({ avisar }), [avisar])

  return (
    <AvisosContext.Provider value={valor}>
      {children}
      <div className="contenedor-avisos" role="status" aria-live="polite">
        {avisos.map((a) => (
          <div key={a.id} className={`aviso aviso-${a.tipo}`}>
            <i className={`${ICONOS[a.tipo]} icon`} />
            <span className="texto">{a.texto}</span>
            {a.accion && (
              <button
                type="button"
                className="accion"
                onClick={() => {
                  a.accion?.onClick()
                  cerrar(a.id)
                }}
              >
                {a.accion.texto}
              </button>
            )}
            <button type="button" className="cerrar" aria-label="Cerrar aviso" onClick={() => cerrar(a.id)}>
              <i className="close icon" />
            </button>
          </div>
        ))}
      </div>
    </AvisosContext.Provider>
  )
}

export default Avisos
