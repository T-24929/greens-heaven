// Adapted from beUI OTP Input (MIT): https://beui.dev/components/blocks/otp-input
// Uses a native controlled input for identity data, paste and mobile autofill.
import { motion, useReducedMotion } from 'motion/react'
import { useId, useRef, useState } from 'react'

export function OTPInput({ length = 6, value = '', onChange, onBlur, name, id, disabled, required, autoComplete = 'off', inputMode = 'numeric', placeholder = '', format, error, 'aria-describedby': describedBy }) {
  const uid = useId()
  const reduce = useReducedMotion()
  const input = useRef(null)
  const slots = useRef(null)
  const [focused, setFocused] = useState(false)
  const [active, setActive] = useState(0)
  const clean = raw => (format ? format(raw) : raw.replace(/\D/g, '')).slice(0, length)
  function select(event) { setActive(Math.min(event.currentTarget.selectionStart ?? value.length, length - 1)) }
  function place(event) {
    const boxes = [...slots.current.children]
    const index = boxes.findIndex(box => { const r = box.getBoundingClientRect(); return event.clientX >= r.left && event.clientX <= r.right && event.clientY >= r.top && event.clientY <= r.bottom })
    if (index < 0) return
    const position = Math.min(index, value.length)
    input.current.setSelectionRange(position, position)
    setActive(position)
  }
  return <div className="identity-digits" data-length={length} data-error={Boolean(error)}>
    <div className="identity-slots" ref={slots} aria-hidden="true" style={{ '--digit-count': length }}>
      {Array.from({ length }, (_, index) => <span className="identity-slot" key={index}>
        {focused && active === index && <motion.span className="identity-focus" layoutId={uid} transition={{ duration: reduce ? 0 : .18, ease: [.23, 1, .32, 1] }} />}
        <motion.span key={value[index] || 'empty'} initial={reduce ? false : { opacity: .4, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .15 }}>{value[index] || <span className="identity-placeholder">{placeholder.replace(/\s/g, '')[index] || '0'}</span>}</motion.span>
      </span>)}
    </div>
    <input ref={input} id={id} name={name} type="text" inputMode={inputMode} autoComplete={autoComplete} autoCapitalize="none" spellCheck={false}
      value={value} disabled={disabled} required={required} aria-invalid={Boolean(error) || undefined} aria-describedby={describedBy}
      onChange={event => { const next = clean(event.target.value); onChange(next); setActive(Math.min(event.target.selectionStart ?? next.length, length - 1)) }}
      onSelect={select} onClick={place} onFocus={() => setFocused(true)} onBlur={() => { setFocused(false); onBlur?.() }} />
  </div>
}
