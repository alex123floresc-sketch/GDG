import { useCallback, useEffect, useRef, useState } from 'react'

/** Lo mínimo de la Web Speech API que se usa (no viene en los tipos de TS). */
interface Reconocedor {
  lang: string
  interimResults: boolean
  maxAlternatives: number
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null
  onerror: ((e: { error: string }) => void) | null
  onend: (() => void) | null
  start: () => void
  abort: () => void
}

type ConstructorReconocedor = new () => Reconocedor

function constructorReconocedor(): ConstructorReconocedor | null {
  const w = window as unknown as { SpeechRecognition?: ConstructorReconocedor; webkitSpeechRecognition?: ConstructorReconocedor }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

const MENSAJES: Record<string, string> = {
  'not-allowed': 'Permite el uso del micrófono para dictar.',
  'service-not-allowed': 'Tu navegador no permite dictar aquí.',
  'no-speech': 'No te escuché. Toca el micrófono e inténtalo de nuevo.',
  network: 'El dictado necesita conexión a internet.',
  'audio-capture': 'No se encontró un micrófono.',
}

/**
 * Dictado por voz (Web Speech API, en español de Perú). `disponible` es
 * false en navegadores que no la tienen (p. ej. Firefox).
 */
export function useDictado(onTexto: (texto: string) => void) {
  const [escuchando, setEscuchando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const reconocedor = useRef<Reconocedor | null>(null)
  const callback = useRef(onTexto)
  const disponible = constructorReconocedor() !== null

  useEffect(() => {
    callback.current = onTexto
  }, [onTexto])

  useEffect(() => () => reconocedor.current?.abort(), [])

  const escuchar = useCallback(() => {
    const Constructor = constructorReconocedor()
    if (!Constructor) return
    reconocedor.current?.abort()
    const r = new Constructor()
    r.lang = 'es-PE'
    r.interimResults = false
    r.maxAlternatives = 1
    r.onresult = (e) => {
      const texto = e.results[0]?.[0]?.transcript ?? ''
      if (texto) callback.current(texto)
    }
    r.onerror = (e) => {
      if (e.error !== 'aborted') setError(MENSAJES[e.error] ?? 'No se pudo usar el dictado.')
    }
    r.onend = () => setEscuchando(false)
    reconocedor.current = r
    setError(null)
    setEscuchando(true)
    try {
      r.start()
    } catch {
      setEscuchando(false)
      setError('No se pudo iniciar el dictado.')
    }
  }, [])

  const detener = useCallback(() => {
    reconocedor.current?.abort()
    setEscuchando(false)
  }, [])

  return { disponible, escuchando, error, escuchar, detener }
}
