// Adapted from beUI Morphing Modal (MIT): https://beui.dev/components/motion/morphing-modal
// Native dialog supplies focus containment, Escape, background inertness and focus return.
import { useEffect, useRef } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { SPRING_PANEL, EASE_OUT } from '../../lib/ease.js'
import { cn } from '../../lib/utils.js'

export function MorphingModal({
  viewId,
  onClose,
  busy = false,
  titleId,
  ariaLabel,
  className,
  innerClassName,
  children,
}) {
  const dialog = useRef(null)
  const returnFocus = useRef(null)
  const parentDialog = useRef(null)
  const reduce = useReducedMotion()
  const open = viewId !== null

  useEffect(() => {
    const element = dialog.current
    if (!element) return

    if (open && !element.open) {
      returnFocus.current = document.activeElement
      parentDialog.current = document.activeElement?.closest('dialog')
      element.showModal()
    }
    if (!open && element.open) {
      element.close()
      const previous = returnFocus.current
      const fallback = parentDialog.current?.open
        ? parentDialog.current.querySelector('button:not(:disabled), [tabindex]')
        : document.getElementById('main')
      ;(previous?.isConnected && !previous.disabled ? previous : fallback)?.focus({ preventScroll: true })
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [open])

  return (
    <dialog
      ref={dialog}
      className={cn('gh-modal', className)}
      aria-labelledby={titleId}
      aria-label={ariaLabel}
      aria-busy={busy}
      onCancel={(event) => {
        event.preventDefault()
        if (!busy) onClose()
      }}
      onClick={(event) => {
        if (event.target === dialog.current && !busy) {
          const r = dialog.current.getBoundingClientRect()
          if (
            event.clientX < r.left ||
            event.clientX > r.right ||
            event.clientY < r.top ||
            event.clientY > r.bottom
          ) {
            onClose()
          }
        }
      }}
    >
      <motion.div
        layout={reduce ? false : true}
        transition={reduce ? { duration: 0 } : SPRING_PANEL}
        className={cn('gh-modal-inner', innerClassName)}
      >
        <AnimatePresence mode="popLayout" initial={false}>
          {open && (
            <motion.div
              key={viewId}
              data-view={viewId}
              initial={
                reduce
                  ? { opacity: 0 }
                  : { opacity: 0, y: 8, filter: 'blur(4px)' }
              }
              animate={
                reduce
                  ? { opacity: 1, transition: { duration: 0.15 } }
                  : { opacity: 1, y: 0, filter: 'blur(0px)', transition: { duration: 0.22, ease: EASE_OUT } }
              }
              exit={
                reduce
                  ? { opacity: 0, transition: { duration: 0.12 } }
                  : { opacity: 0, y: -6, filter: 'blur(4px)', transition: { duration: 0.16, ease: EASE_OUT } }
              }
            >
              {children}
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </dialog>
  )
}

