import { motion, useReducedMotion } from 'motion/react'
import { Check } from 'lucide-react'

export default function ReservationProgress({ step, completed = step - 1 }) {
  const reduce = useReducedMotion()
  return <ol className="reserve-progress" aria-label="Reservation steps">
    {['Your details', 'Payment', 'Review'].map((label, index) => <li key={label} data-complete={index < completed} aria-current={step === index + 1 ? 'step' : undefined}>
      <span>{step === index + 1 && <motion.i className="reserve-step-focus" layoutId="reservation-active-step" transition={{ duration: reduce ? 0 : .24, ease: [.77, 0, .175, 1] }} />}{index < completed ? <Check size={14} aria-label="Completed" /> : String(index + 1).padStart(2, '0')}</span>
      {label}
    </li>)}
  </ol>
}
