import { lazy, Suspense, useEffect, useState } from 'react'

const SideRays = lazy(() => import('./SideRays.jsx').catch(() => ({ default: () => null })))

export default function HeroRays({ enabled }) {
  const [allowed, setAllowed] = useState(() => !window.matchMedia('(prefers-reduced-motion: reduce)').matches)
  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)')
    const update = () => setAllowed(!query.matches)
    query.addEventListener('change', update)
    return () => query.removeEventListener('change', update)
  }, [])
  if (!enabled || !allowed) return null
  return <Suspense fallback={null}>
    <SideRays className="landing-rays" rayColor1="#c6e6aa" rayColor2="#55bd86"
      origin="top-right" speed={.65} intensity={1.4} opacity={.55} spread={1.8}
      density={5} sharpness={.35} glow={.45} falloff={1.4} dust={0}
      followMouse={false} maxDevicePixelRatio={1} />
  </Suspense>
}
