import { lazy, Suspense, useEffect, useState } from 'react'

const RippleDistortion = lazy(() => import('./RippleDistortion.jsx').catch(() => ({ default: () => null })))

export default function HeroRipple({ src, enabled }) {
  const [motionAllowed, setMotionAllowed] = useState(() => !window.matchMedia('(prefers-reduced-motion: reduce)').matches)
  useEffect(() => {
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)')
    const update = event => setMotionAllowed(!event.matches)
    motion.addEventListener('change', update)
    return () => motion.removeEventListener('change', update)
  }, [])
  if (!enabled || !motionAllowed) return null
  return <Suspense fallback={null}>
    <RippleDistortion src={src} className="landing-ripple" brushSize={110} strength={.012}
      swirl={.3} rings={1.5} spread={2.5} fade={1.5} spacing={28}
      dispersion={0} glint={.025} tint="#74bd80" tintAmount={.015}
      grayscale={false} trigger="both" clickStrength={1.15} quality="low" />
  </Suspense>
}
