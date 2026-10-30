import { useEffect, useRef, useState } from 'react'
import { FileText, Image as ImageIcon, Trash2, Upload } from 'lucide-react'
import { Loader } from './motion/loader.jsx'
import ReceiptPdfPreview from './ReceiptPdfPreview.jsx'
import { prepareReceipt } from '../lib/prepareReceipt.js'

export default function ReceiptUpload({
  file,
  onFileChange,
  disabled = false,
  error = '',
  onError,
  onPreparingChange,
  idPrefix = 'receipt',
}) {
  const [preparing, setPreparing] = useState(false)
  const [preview, setPreview] = useState('')
  const [originalSize, setOriginalSize] = useState(0)
  const selection = useRef(0)
  const input = useRef(null)
  const previewRef = useRef('')

  function clearPreview() {
    if (previewRef.current) {
      URL.revokeObjectURL(previewRef.current)
      previewRef.current = ''
    }
    setPreview('')
  }

  useEffect(() => {
    return () => {
      if (previewRef.current) {
        URL.revokeObjectURL(previewRef.current)
        previewRef.current = ''
      }
    }
  }, [])

  async function choose(selected) {
    const request = ++selection.current
    clearPreview()
    onError?.('')
    setPreparing(true)
    onPreparingChange?.(true)

    try {
      const result = await prepareReceipt(selected)
      if (request === selection.current) {
        setOriginalSize(result.originalSize)
        if (result.file.type !== 'application/pdf') {
          previewRef.current = URL.createObjectURL(result.file)
          setPreview(previewRef.current)
        }
        onFileChange?.(result.file, result.originalSize)
      }
    } catch (err) {
      if (request === selection.current) {
        onFileChange?.(null, 0)
        onError?.(err.message)
      }
    } finally {
      if (request === selection.current) {
        setPreparing(false)
        onPreparingChange?.(false)
      }
    }
  }

  function remove() {
    selection.current++
    clearPreview()
    setOriginalSize(0)
    onError?.('')
    onFileChange?.(null, 0)
    if (input.current) {
      input.current.value = ''
      input.current.focus()
    }
  }

  const fileSize = bytes =>
    bytes < 1024 * 1024 ? `${Math.ceil(bytes / 1024)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`

  return (
    <div className="receipt-upload-container stack">
      <label className="receipt-picker">
        <Upload size={24} aria-hidden="true" />
        <strong>{file ? 'Choose a different receipt' : 'Choose your receipt'}</strong>
        <span>Tap to browse · JPG, PNG or PDF</span>
        <input
          ref={input}
          type="file"
          aria-label="Payment receipt"
          accept="image/jpeg,image/png,application/pdf"
          disabled={disabled || preparing}
          onChange={e => {
            if (e.target.files?.[0]) void choose(e.target.files[0])
          }}
          aria-describedby={`${idPrefix}-help`}
        />
      </label>
      <p id={`${idPrefix}-help`} className="payment-help">
        PDF up to 5 MB · JPG/PNG up to 20 MB. Large photos are reduced automatically.
      </p>
      {preparing && (
        <p className="payment-help">
          <Loader size={18} label="Preparing receipt" /> Preparing your receipt…
        </p>
      )}
      {file && (
        <div className="receipt-preview">
          {file.type !== 'application/pdf' && preview ? (
            <a href={preview} target="_blank" rel="noreferrer" aria-label="Open receipt image preview">
              <img src={preview} alt="Your selected receipt. Check that the payment details are readable." />
            </a>
          ) : (
            <ReceiptPdfPreview file={file} />
          )}
          <div className="receipt-file-info">
            {file.type === 'application/pdf' ? <FileText size={18} /> : <ImageIcon size={18} />}
            <div>
              <strong title={file.name}>{file.name}</strong>
              <span>
                {fileSize(file.size)}
                {file.size < originalSize && ` · Reduced from ${fileSize(originalSize)}`}
              </span>
            </div>
            <button
              type="button"
              className="receipt-remove"
              aria-label="Remove receipt"
              title="Remove receipt"
              disabled={disabled}
              onClick={remove}
            >
              <Trash2 size={18} aria-hidden="true" />
            </button>
          </div>
        </div>
      )}
      {error && <p className="reserve-field-error" role="alert">{error}</p>}
    </div>
  )
}
