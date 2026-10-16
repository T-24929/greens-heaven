import { Loader } from './motion/loader.jsx'
import { useEffect, useState } from 'react'
import { FileText } from 'lucide-react'

export default function ReceiptPdfPreview({ file }) {
  const [preview, setPreview] = useState(null)
  const [error, setError] = useState('')
  useEffect(() => {
    let active = true
    let url
    import('../lib/pdfThumbnail.js').then(({ pdfThumbnail }) => pdfThumbnail(file)).then(result => {
      if (!active) return
      url = URL.createObjectURL(result.blob)
      setPreview({ url, pages: result.pages })
    }).catch(err => {
      if (active) setError(err.name === 'PasswordException'
        ? 'This PDF is password protected. Use an unlocked copy so the organizers can read it.'
        : 'Preview unavailable. Check the PDF on your device before uploading.')
    })
    return () => { active = false; if (url) URL.revokeObjectURL(url) }
  }, [file])
  if (!preview) return <div className="receipt-pdf">{error ? <FileText size={28} aria-hidden="true" /> : <Loader size={24} label="Preparing PDF preview" />}<span>{error ? 'PDF preview unavailable' : 'Preparing PDF preview…'}</span><small role="status">{error || 'Your file stays on this device until you submit it.'}</small></div>
  return <figure className="receipt-pdf-thumbnail"><a href={preview.url} target="_blank" rel="noreferrer" aria-label="Open first page thumbnail"><img src={preview.url} alt={`First page of ${file.name}`} /></a><figcaption>Page 1 of {preview.pages} · Original PDF will be uploaded</figcaption></figure>
}
