import { useEffect, useRef } from 'react'
import './BorderGlow.css'

// React Bits BorderGlow adaptation: the mesh and directional glow live in CSS.
// Pointer updates are batched into one frame, without re-rendering card content.
export default function BorderGlow({ children, className = '', as: Tag = 'div' }) {
  const ref = useRef(null)
  useEffect(() => {
    const card = ref.current
    const interactive = window.matchMedia('(hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)')
    let frame = 0
    let point
    const clear = () => {
      cancelAnimationFrame(frame)
      frame = 0
      card.style.setProperty('--border-glow-opacity', '0')
    }
    const move = event => {
      if (!interactive.matches || event.pointerType !== 'mouse') return
      point = { x: event.clientX, y: event.clientY }
      if (frame) return
      frame = requestAnimationFrame(() => {
        frame = 0
        const rect = card.getBoundingClientRect()
        const dx = point.x - rect.left - rect.width / 2
        const dy = point.y - rect.top - rect.height / 2
        const edge = Math.min(1, Math.max(Math.abs(dx) / (rect.width / 2), Math.abs(dy) / (rect.height / 2)))
        card.style.setProperty('--border-glow-angle', `${Math.atan2(dy, dx) * 180 / Math.PI + 90}deg`)
        card.style.setProperty('--border-glow-opacity', `${Math.max(0, (edge - .3) / .7)}`)
      })
    }
    const hide = () => { if (document.hidden) clear() }
    card.addEventListener('pointermove', move, { passive: true })
    card.addEventListener('pointerleave', clear)
    card.addEventListener('pointercancel', clear)
    interactive.addEventListener('change', clear)
    document.addEventListener('visibilitychange', hide)
    return () => {
      clear()
      card.removeEventListener('pointermove', move)
      card.removeEventListener('pointerleave', clear)
      card.removeEventListener('pointercancel', clear)
      interactive.removeEventListener('change', clear)
      document.removeEventListener('visibilitychange', hide)
    }
  }, [])
  return <Tag ref={ref} className={`border-glow ${className}`}>
    <span className="border-glow-edge" aria-hidden="true" />
    <span className="border-glow-halo" aria-hidden="true" />
    {children}
  </Tag>
}
