import { validateReceipt } from './tickets.js'

async function decodeImage(file) {
  if (typeof createImageBitmap === 'function') {
    try { return await createImageBitmap(file, { imageOrientation: 'from-image' }) } catch { /* Safari fallback below. */ }
  }
  const url = URL.createObjectURL(file)
  try {
    const image = new Image()
    image.src = url
    await image.decode()
    return image
  } finally { URL.revokeObjectURL(url) }
}

// PDFs are never rewritten. Only choose the smaller image after a readable resize.
export async function prepareReceipt(file) {
  const isPdf = file?.type === 'application/pdf'
  await validateReceipt(file, (isPdf ? 5 : 20) * 1024 * 1024)
  if (isPdf || file.size <= 1024 * 1024) return { file, originalSize: file.size }
  let image
  try {
    image = await decodeImage(file)
    if (image.width * image.height > 40000000) throw new Error('This image is too large. Export a smaller photo or PDF.')
    const scale = Math.min(1, 2400 / Math.max(image.width, image.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(image.width * scale)
    canvas.height = Math.round(image.height * scale)
    const context = canvas.getContext('2d')
    if (!context) throw new Error('Could not prepare this image. Try a smaller JPG or a PDF.')
    context.fillStyle = '#ffffff'
    context.fillRect(0, 0, canvas.width, canvas.height)
    context.drawImage(image, 0, 0, canvas.width, canvas.height)
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', .88))
    canvas.width = canvas.height = 0
    const result = blob && blob.size < file.size
      ? new File([blob], file.name.replace(/\.[^.]+$/, '') + '.jpg', { type: 'image/jpeg' })
      : file
    await validateReceipt(result)
    return { file: result, originalSize: file.size }
  } catch (error) {
    if (error.name === 'EncodingError' || error.name === 'InvalidStateError') throw new Error('This image could not be opened. Export it as a JPG, PNG or PDF.', { cause: error })
    throw error
  } finally { image?.close?.() }
}
