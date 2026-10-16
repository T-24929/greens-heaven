// beUI Loader dots variant (MIT): https://beui.dev/components/motion/loader
import { motion, useReducedMotion } from 'motion/react'
export function Loader({ size = 20, speed = 1, label = 'Loading', variant = 'dots' }) {
  const reduce = useReducedMotion()
  if (variant === 'spinner') return <span role="status" aria-label={label} className={`micro-loader micro-spinner${reduce ? ' micro-spinner-reduced' : ''}`} style={{ width: size, height: size, animationDuration: `${speed}s` }} />
  return <span role="status" aria-label={label} className="micro-loader" style={{ gap: size * .14, height: size }}>
    {[0, 1, 2].map(index => <motion.span key={index} style={{ width: size * .24, height: size * .24, borderRadius: '50%', background: 'currentColor' }}
      animate={reduce ? { opacity: [.4, 1, .4] } : { transform: ['translateY(0)', `translateY(-${size * .3}px)`, 'translateY(0)'], opacity: [.5, 1, .5] }}
      transition={{ duration: speed, ease: [.77, 0, .175, 1], repeat: Infinity, delay: index * speed * .16 }} />)}
  </span>
}
