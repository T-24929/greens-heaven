import { animate, motion, useMotionValue, useReducedMotion, useTransform } from 'motion/react'
import { ArrowRight, Check, LoaderCircle } from 'lucide-react'
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'

const SLIDE_SPRING = { type: 'spring', stiffness: 520, damping: 38, mass: 0.8 }

export default function SlideActionButton({
  children = 'Slide to confirm check-in',
  completeLabel = 'Recorded',
  disabled = false,
  threshold = 0.82,
  onComplete,
  className = '',
}) {
  const reduce = useReducedMotion()
  const trackRef = useRef(null)
  const thumbRef = useRef(null)
  const lockRef = useRef(false)
  const x = useMotionValue(0)
  const [maxDistance, setMaxDistance] = useState(0)
  const [saving, setSaving] = useState(false)
  const [completed, setCompleted] = useState(false)
  const safeDistance = Math.max(maxDistance, 1)
  const progress = useTransform(x, [0, safeDistance], [0, 1])
  const labelOpacity = useTransform(x, [0, safeDistance * 0.38, safeDistance * 0.72], [1, 0.75, 0])
  const arrowOpacity = useTransform(progress, [0, 0.72, 1], [1, 0.4, 0])
  const checkOpacity = useTransform(progress, [0, 0.72, 1], [0, 0.4, 1])

  useLayoutEffect(() => {
    const track = trackRef.current
    const thumb = thumbRef.current
    if (!track || !thumb) return

    const measure = () => setMaxDistance(Math.max(track.clientWidth - thumb.clientWidth - 8, 0))
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(track)
    observer.observe(thumb)
    return () => observer.disconnect()
  }, [])

  const moveTo = useCallback((target) => {
    if (reduce) {
      x.set(target)
      return
    }
    animate(x, target, SLIDE_SPRING)
  }, [reduce, x])

  useEffect(() => {
    if (disabled && !lockRef.current) moveTo(0)
  }, [disabled, moveTo])

  const complete = useCallback(async () => {
    if (disabled || lockRef.current || maxDistance === 0) return
    lockRef.current = true
    setSaving(true)

    try {
      const saved = await onComplete?.()
      if (saved === false) {
        setCompleted(false)
        moveTo(0)
      } else {
        setCompleted(true)
        moveTo(maxDistance)
      }
    } catch {
      setCompleted(false)
      moveTo(0)
    } finally {
      lockRef.current = false
      setSaving(false)
    }
  }, [disabled, maxDistance, moveTo, onComplete])

  function handleKeyDown(event) {
    if (event.key !== 'Enter' && event.key !== ' ') return
    event.preventDefault()
    complete()
  }

  return (
    <div
      ref={trackRef}
      className={`admin-slide-action ${disabled ? 'is-disabled' : ''} ${saving ? 'is-saving' : ''} ${className}`}
      role="group"
      aria-label={typeof children === 'string' ? children : 'Slide to confirm check-in'}
    >
      <motion.span aria-hidden="true" style={{ scaleX: progress }} className="admin-slide-action-fill" />
      <motion.span aria-hidden="true" style={{ opacity: labelOpacity }} className="admin-slide-action-label">
        {saving ? 'Saving check-in…' : children}
      </motion.span>
      <motion.button
        ref={thumbRef}
        type="button"
        aria-label={typeof children === 'string' ? children : 'Slide to confirm check-in'}
        disabled={disabled || saving}
        drag={disabled || saving ? false : 'x'}
        dragConstraints={{ left: 0, right: maxDistance }}
        dragElastic={0}
        dragMomentum={false}
        style={{ x }}
        onDragEnd={() => {
          if (x.get() >= maxDistance * threshold) complete()
          else moveTo(0)
        }}
        onKeyDown={handleKeyDown}
        whileTap={reduce || disabled || saving ? undefined : { scale: 0.94 }}
        transition={SLIDE_SPRING}
        className="admin-slide-action-thumb"
      >
        {saving ? <LoaderCircle size={18} className="admin-slide-action-spinner" aria-hidden="true" /> : (
          <motion.span className="admin-slide-action-icon" aria-hidden="true">
            <motion.span style={{ opacity: arrowOpacity }}><ArrowRight size={18} /></motion.span>
            <motion.span style={{ opacity: checkOpacity }}><Check size={18} /></motion.span>
          </motion.span>
        )}
      </motion.button>
      <span className="sr-only" aria-live="polite">
        {saving ? 'Saving check-in' : completed ? completeLabel : ''}
      </span>
    </div>
  )
}
