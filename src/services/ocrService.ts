import { interpretarBoleta, type DatosBoleta } from '../utils/boleta'

/** Lado mayor (px) al que se reduce la foto antes del OCR: más rápido y suficiente para boletas. */
const LADO_MAXIMO = 1800

/** Reduce la imagen y la pasa a escala de grises (mejora el OCR de boletas térmicas). */
async function prepararImagen(archivo: Blob): Promise<Blob> {
  try {
    const bitmap = await createImageBitmap(archivo)
    const escala = Math.min(1, LADO_MAXIMO / Math.max(bitmap.width, bitmap.height))
    const lienzo = document.createElement('canvas')
    lienzo.width = Math.round(bitmap.width * escala)
    lienzo.height = Math.round(bitmap.height * escala)
    const ctx = lienzo.getContext('2d')
    if (!ctx) return archivo
    ctx.filter = 'grayscale(1) contrast(1.3)'
    ctx.drawImage(bitmap, 0, 0, lienzo.width, lienzo.height)
    bitmap.close()
    return await new Promise((resolver) => lienzo.toBlob((b) => resolver(b ?? archivo), 'image/png'))
  } catch {
    return archivo
  }
}

export interface ResultadoOcr extends DatosBoleta {
  texto: string
}

/**
 * Lee una foto de una boleta con OCR (Tesseract, en el propio navegador) y
 * extrae total, fecha y comercio. tesseract.js se carga recién aquí (pesa y
 * pocos lo usan); la primera vez descarga el modelo de español (~2 MB), así
 * que necesita conexión.
 */
export async function leerBoleta(archivo: Blob, onProgreso?: (fraccion: number) => void): Promise<ResultadoOcr> {
  const [{ createWorker }, imagen] = await Promise.all([import('tesseract.js'), prepararImagen(archivo)])
  const worker = await createWorker('spa', 1, {
    logger: (m: { status: string; progress: number }) => {
      if (m.status === 'recognizing text') onProgreso?.(m.progress)
    },
  })
  try {
    const { data } = await worker.recognize(imagen)
    return { texto: data.text, ...interpretarBoleta(data.text) }
  } finally {
    await worker.terminate()
  }
}
