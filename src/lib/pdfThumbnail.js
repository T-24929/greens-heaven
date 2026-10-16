// Loaded only for a selected PDF; document bytes stay in the browser.
export async function pdfThumbnail(file) {
  const [pdfjs, worker] = await Promise.all([
    import('pdfjs-dist/legacy/build/pdf.mjs'),
    import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url'),
  ])
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default
  const task = pdfjs.getDocument({
    data: new Uint8Array(await file.arrayBuffer()),
    isEvalSupported: false, useSystemFonts: true, useWasm: false,
  })
  const canvas = document.createElement('canvas')
  let timer
  try {
    return await Promise.race([
      (async () => {
        const document = await task.promise
        const page = await document.getPage(1)
        const base = page.getViewport({ scale: 1 })
        const viewport = page.getViewport({ scale: Math.min(1.5, 640 / base.width, 900 / base.height) })
        canvas.width = Math.max(1, Math.ceil(viewport.width))
        canvas.height = Math.max(1, Math.ceil(viewport.height))
        const context = canvas.getContext('2d')
        if (!context) throw new Error('Preview unavailable')
        await page.render({ canvasContext: context, viewport }).promise
        const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'))
        if (!blob) throw new Error('Preview unavailable')
        return { blob, pages: document.numPages }
      })(),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Preview timed out')), 12000) }),
    ])
  } finally {
    clearTimeout(timer)
    await task.destroy()
    canvas.width = canvas.height = 0
  }
}
