import { lazy, Suspense, useEffect, useRef, useState } from 'react'

const ScrollVelocity = lazy(() => import('./ScrollVelocity.jsx'))
const texts = ['GREENS HEAVEN · XXVI', 'ONE EVENING. THE WHOLE BATCH.']

export default function VelocityBanner() {
  const ref = useRef(null)
  const [nearby, setNearby] = useState(false)

  useEffect(() => {
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) {
        setNearby(true)
        observer.disconnect()
      }
    }, { rootMargin: '300px' })
    observer.observe(ref.current)
    return () => observer.disconnect()
  }, [])

  const fallback = <div className="landing-velocity-placeholder">{texts.map(text => <div key={text}>{text}</div>)}</div>
  return <section ref={ref} className="landing-velocity" aria-label="Reunion message">
    <div className="landing-velocity-art" aria-hidden="true">
      {nearby ? <Suspense fallback={fallback}>
        <ScrollVelocity texts={texts} velocity={12} skewWithVelocity={0} scaleWithVelocity={0}
          fontSize="clamp(32px, 4.4vw, 68px)" fontWeight={700} gap={20} separator="·"
          className="landing-velocity-text opacity-35" pauseOnHover fadeEdges
          velocityMapping={{ input: [0, 1000], output: [0, 2.5] }} />
      </Suspense> : fallback}
    </div>
  </section>
}
