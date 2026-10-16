// Adapted from beUI Morphing Modal (MIT): https://beui.dev/components/motion/morphing-modal
// Native dialog supplies focus containment, Escape, background inertness and focus return.
import { useEffect, useRef } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'

export function MorphingModal({ viewId, onClose, busy = false, titleId, children }) {
  const dialog = useRef(null)
  const returnFocus = useRef(null)
  const parentDialog = useRef(null)
  const reduce = useReducedMotion()
  const open = viewId !== null
  useEffect(() => {
    const element = dialog.current
    if (open && !element.open) {
      returnFocus.current = document.activeElement
      parentDialog.current = document.activeElement?.closest('dialog')
      element.showModal()
    }
    if (!open && element.open) {
      element.close()
      const previous = returnFocus.current
      const fallback = parentDialog.current?.open ? parentDialog.current.querySelector('button:not(:disabled), [tabindex]') : document.getElementById('main')
      ;(previous?.isConnected && !previous.disabled ? previous : fallback)?.focus({ preventScroll: true })
    }
  }, [open])
  return <dialog ref={dialog} className="gh-modal" aria-labelledby={titleId} aria-busy={busy}
    onCancel={event => { event.preventDefault(); if (!busy) onClose() }}
    onClick={event => { if (event.target === dialog.current && !busy) { const r = dialog.current.getBoundingClientRect(); if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) onClose() } }}>
    <motion.div layout={reduce ? false : true} transition={{ duration: .24, ease: [.77, 0, .175, 1] }} className="gh-modal-inner">
      <AnimatePresence mode="sync" initial={false}>{open && <motion.div key={viewId}
        initial={{ opacity: 0, transform: reduce ? 'none' : 'translateY(8px)' }}
        animate={{ opacity: 1, transform: 'none' }} exit={{ opacity: 0 }}
        transition={{ duration: reduce ? 0 : .18, ease: [.23, 1, .32, 1] }}>{children}</motion.div>}</AnimatePresence>
    </motion.div>
  </dialog>
}
