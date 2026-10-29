import { useId, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import {
  Camera,
  Check,
  CheckCircle2,
  Copy,
  Edit2,
  Image as ImageIcon,
  Plus,
  Save,
  ScanLine,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react'
import { supabase } from '../../utils/supabase.js'
import { useToast } from '../../lib/toasts.js'

function parseBulkNames(raw) {
  if (!raw) return []
  // Split on commas, semicolons, or newlines
  return raw
    .split(/[\n,;]+/)
    .map((item) => item.replace(/["']/g, '').trim())
    .filter(Boolean)
}

export default function PhotoSessionManager({
  ticket,
  onSave,
  onNextGuest,
  disabled = false,
}) {
  const toast = useToast()
  const reduceMotion = useReducedMotion()
  const composerInputId = useId()

  const [images, setImages] = useState(() => {
    return Array.isArray(ticket?.images) ? ticket.images.filter(Boolean) : []
  })
  const [inputVal, setInputVal] = useState('')
  const [editingIndex, setEditingIndex] = useState(null)
  const [editVal, setEditVal] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [copiedIndex, setCopiedIndex] = useState(null)
  const [copiedAll, setCopiedAll] = useState(false)

  const composerRef = useRef(null)

  // Has changes compared to ticket.images
  const savedImages = Array.isArray(ticket?.images) ? ticket.images.filter(Boolean) : []
  const hasUnsavedChanges =
    images.length !== savedImages.length ||
    images.some((img, idx) => img !== savedImages[idx])

  // Suggested quick-presets based on attendee
  const presets = useMemo(() => {
    const ref = ticket?.reference || 'GH'
    const namePart = (ticket?.full_name || '')
      .trim()
      .split(/\s+/)[0]
      .replace(/[^a-zA-Z0-9]/g, '')
    const nextNum = String(images.length + 1).padStart(2, '0')

    const list = [
      `${ref}_${nextNum}.jpg`,
      namePart ? `${ref}_${namePart}_${nextNum}.jpg` : null,
      `DSC_${1000 + images.length + 1}.JPG`,
      `IMG_${2000 + images.length + 1}.JPG`,
    ].filter(Boolean)

    return list
  }, [ticket, images.length])

  function handleAddNames(raw) {
    const parsed = parseBulkNames(raw)
    if (!parsed.length) return

    setImages((current) => [...current, ...parsed])
    setInputVal('')
    setError('')
    composerRef.current?.focus()
  }

  function handleComposerKeyDown(event) {
    if (event.key === 'Enter') {
      event.preventDefault()
      handleAddNames(inputVal)
    }
  }

  function startEdit(index) {
    setEditingIndex(index)
    setEditVal(images[index] || '')
  }

  function commitEdit(index) {
    const cleaned = editVal.trim()
    if (!cleaned) {
      // If cleared, delete
      handleDelete(index)
    } else {
      setImages((current) =>
        current.map((item, idx) => (idx === index ? cleaned : item))
      )
    }
    setEditingIndex(null)
  }

  function cancelEdit() {
    setEditingIndex(null)
    setEditVal('')
  }

  function handleDelete(index) {
    setImages((current) => current.filter((_, idx) => idx !== index))
    if (editingIndex === index) {
      setEditingIndex(null)
    }
  }

  async function handleCopy(text, index) {
    try {
      await navigator.clipboard.writeText(text)
      setCopiedIndex(index)
      setTimeout(() => setCopiedIndex(null), 1600)
    } catch {
      // Fallback ignore
    }
  }

  async function handleCopyAll() {
    if (!images.length) return
    try {
      await navigator.clipboard.writeText(images.join(', '))
      setCopiedAll(true)
      toast.show({ status: 'success', title: `Copied ${images.length} photo names` })
      setTimeout(() => setCopiedAll(false), 2000)
    } catch {
      // Fallback ignore
    }
  }

  function handleClearAll() {
    if (!images.length) return
    setImages([])
    setEditingIndex(null)
  }

  async function saveToDatabase() {
    if (!ticket?.id || saving) return

    setSaving(true)
    setError('')

    try {
      const cleaned = images.map((img) => img.trim()).filter(Boolean)
      const { data, error: rpcError } = await supabase.rpc('save_ticket_images', {
        p_reservation_id: ticket.id,
        p_images: cleaned,
      })

      if (rpcError) throw rpcError

      const saved = Array.isArray(data) ? data : cleaned
      setImages(saved)
      onSave?.(saved)
      toast.show({
        status: 'success',
        title: `Saved ${saved.length} photo ${saved.length === 1 ? 'name' : 'names'}`,
      })
    } catch (err) {
      const missingRpc =
        ['PGRST202', 'PGRST203'].includes(err?.code) ||
        /could not find the function.*schema cache/i.test(err?.message || '')

      setError(
        missingRpc
          ? 'Photo-name saving is not available in the database yet. Check migrations and refresh.'
          : err.message || 'Photo names could not be saved.'
      )
      toast.show({ status: 'error', title: 'Could not save photo names' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="admin-photo-session" aria-label="Photo booth image session">
      {/* Session Header */}
      <div className="admin-photo-session-heading">
        <div>
          <h3>
            <Camera size={15} aria-hidden="true" />
            <span>PHOTO BOOTH CAPTURES</span>
            {hasUnsavedChanges ? (
              <span className="admin-photo-unsaved-pill">UNSAVED</span>
            ) : (
              <span className="admin-photo-count-pill">{images.length} SAVED</span>
            )}
          </h3>
        </div>

        <div className="admin-photo-header-actions">
          {images.length > 0 && (
            <>
              <button
                type="button"
                className="admin-photo-link-btn"
                onClick={handleCopyAll}
                title="Copy all photo names to clipboard"
              >
                {copiedAll ? <Check size={13} /> : <Copy size={13} />}
                <span>{copiedAll ? 'Copied' : 'Copy all'}</span>
              </button>
              <button
                type="button"
                className="admin-photo-link-btn is-danger"
                onClick={handleClearAll}
                title="Clear all photo names"
              >
                <Trash2 size={13} />
                <span>Clear</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* Quick Suggestion Chips */}
      <div className="admin-photo-presets" aria-label="Suggested image names">
        <span className="admin-photo-presets-label">
          <Sparkles size={12} aria-hidden="true" />
          <span>Quick add:</span>
        </span>
        <div className="admin-photo-presets-row">
          {presets.map((preset) => (
            <button
              key={preset}
              type="button"
              className="admin-photo-preset-chip"
              onClick={() => handleAddNames(preset)}
              title={`Add ${preset}`}
            >
              <Plus size={11} aria-hidden="true" />
              <span>{preset}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Editable List */}
      <div className="admin-photo-list" role="list" aria-label="Captured photo list">
        <AnimatePresence initial={false}>
          {images.length === 0 ? (
            <motion.div
              key="empty-list"
              className="admin-photo-empty"
              initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -4 }}
            >
              <ImageIcon size={22} aria-hidden="true" />
              <p>No photos tagged yet for {ticket?.full_name || 'this guest'}.</p>
              <span>Type below, paste camera names, or click a quick suggestion.</span>
            </motion.div>
          ) : (
            images.map((img, idx) => {
              const isEditing = editingIndex === idx
              const isCopied = copiedIndex === idx

              return (
                <motion.div
                  key={`${img}-${idx}`}
                  layout
                  className={`admin-photo-item ${isEditing ? 'is-editing' : ''}`}
                  initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 6, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.92, y: -6 }}
                  transition={reduceMotion ? { duration: 0 } : { type: 'spring', stiffness: 420, damping: 32 }}
                  role="listitem"
                >
                  <span className="admin-photo-item-badge">#{idx + 1}</span>

                  {isEditing ? (
                    <div className="admin-photo-item-edit-row">
                      <input
                        type="text"
                        className="admin-photo-item-edit-input"
                        value={editVal}
                        onChange={(e) => setEditVal(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault()
                            commitEdit(idx)
                          } else if (e.key === 'Escape') {
                            cancelEdit()
                          }
                        }}
                        autoFocus
                        placeholder="Image filename"
                        maxLength={500}
                      />
                      <button
                        type="button"
                        className="admin-photo-item-btn is-save"
                        onClick={() => commitEdit(idx)}
                        aria-label="Save name"
                        title="Save name (Enter)"
                      >
                        <Check size={14} aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        className="admin-photo-item-btn is-cancel"
                        onClick={cancelEdit}
                        aria-label="Cancel editing"
                        title="Cancel (Esc)"
                      >
                        <X size={14} aria-hidden="true" />
                      </button>
                    </div>
                  ) : (
                    <>
                      <span className="admin-photo-item-name" title={img}>
                        <ImageIcon size={13} className="admin-photo-item-icon" aria-hidden="true" />
                        <span>{img}</span>
                      </span>

                      <div className="admin-photo-item-actions">
                        <button
                          type="button"
                          className="admin-photo-item-btn"
                          onClick={() => handleCopy(img, idx)}
                          aria-label={`Copy filename ${img}`}
                          title="Copy name"
                        >
                          {isCopied ? <Check size={13} /> : <Copy size={13} />}
                        </button>
                        <button
                          type="button"
                          className="admin-photo-item-btn"
                          onClick={() => startEdit(idx)}
                          aria-label={`Edit ${img}`}
                          title="Edit name"
                        >
                          <Edit2 size={13} />
                        </button>
                        <button
                          type="button"
                          className="admin-photo-item-btn is-delete"
                          onClick={() => handleDelete(idx)}
                          aria-label={`Delete ${img}`}
                          title="Remove from list"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </>
                  )}
                </motion.div>
              )
            })
          )}
        </AnimatePresence>
      </div>

      {/* Composer Input Bar (beUI style) */}
      <div className="admin-photo-composer">
        <label htmlFor={composerInputId} className="sr-only">
          Add image filename or paste multiple
        </label>
        <div className="admin-photo-composer-field">
          <Camera size={15} className="admin-photo-composer-icon" aria-hidden="true" />
          <input
            id={composerInputId}
            ref={composerRef}
            type="text"
            className="admin-photo-composer-input"
            value={inputVal}
            onChange={(e) => setInputVal(e.target.value)}
            onKeyDown={handleComposerKeyDown}
            placeholder="Type or paste image name(s)..."
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            disabled={disabled || saving}
          />
          <button
            type="button"
            className="admin-photo-composer-add-btn"
            onClick={() => handleAddNames(inputVal)}
            disabled={!inputVal.trim()}
            title="Add to photo list (Enter)"
          >
            <Plus size={14} aria-hidden="true" />
            <span>Add</span>
          </button>
        </div>
      </div>

      {error && <p className="admin-error" role="alert">{error}</p>}

      {/* Session Actions */}
      <div className="admin-photo-session-actions">
        <button
          type="button"
          className={`admin-photo-save ${hasUnsavedChanges ? 'is-dirty' : ''}`}
          onClick={saveToDatabase}
          disabled={saving || !hasUnsavedChanges}
        >
          {saving ? (
            <>
              <Save size={15} className="admin-spin" aria-hidden="true" />
              <span>Saving…</span>
            </>
          ) : hasUnsavedChanges ? (
            <>
              <Save size={15} aria-hidden="true" />
              <span>Save photo names</span>
            </>
          ) : (
            <>
              <CheckCircle2 size={15} aria-hidden="true" />
              <span>All names saved</span>
            </>
          )}
        </button>

        {onNextGuest && (
          <button
            type="button"
            className="admin-attendance-next"
            onClick={onNextGuest}
          >
            <ScanLine size={16} aria-hidden="true" />
            <span>Next guest</span>
          </button>
        )}
      </div>
    </div>
  )
}
