/**
 * Reduce una foto a JPEG de como máximo `ladoMaximo` px por lado (una foto
 * de celular de 4 MB queda en ~200–400 kB, legible para una boleta). Si el
 * navegador no puede procesarla, devuelve la original.
 */
export async function comprimirImagen(original: Blob, ladoMaximo = 1600, calidad = 0.8): Promise<Blob> {
  if (typeof createImageBitmap !== 'function') return original
  let bitmap: ImageBitmap
  try {
    // 'from-image' respeta la rotación EXIF de las fotos del celular.
    bitmap = await createImageBitmap(original, { imageOrientation: 'from-image' })
  } catch {
    return original
  }
  try {
    const escala = Math.min(1, ladoMaximo / Math.max(bitmap.width, bitmap.height))
    const ancho = Math.max(1, Math.round(bitmap.width * escala))
    const alto = Math.max(1, Math.round(bitmap.height * escala))
    const canvas = document.createElement('canvas')
    canvas.width = ancho
    canvas.height = alto
    const ctx = canvas.getContext('2d')
    if (!ctx) return original
    // Fondo blanco: los PNG con transparencia no quedan negros en JPEG.
    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, ancho, alto)
    ctx.drawImage(bitmap, 0, 0, ancho, alto)
    const jpeg = await new Promise<Blob | null>((ok) => canvas.toBlob(ok, 'image/jpeg', calidad))
    // Si "comprimir" la agrandó (imagen ya pequeña), se queda la original.
    return jpeg && (jpeg.size < original.size || original.type !== 'image/jpeg') ? jpeg : original
  } finally {
    bitmap.close()
  }
}
