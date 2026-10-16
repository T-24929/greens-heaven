import { useEffect } from 'react'
import 'lenis/dist/lenis.css'

export default function useSmoothScroll() {
  useEffect(() => {
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)')
    let disposed = false
    let generation = 0
    let cleanup = () => {}

    async function sync() {
      const current = ++generation
      cleanup()
      cleanup = () => {}
      if (motion.matches) return
      try {
        const [{ default: Lenis }, { gsap }, { ScrollTrigger }] = await Promise.all([
          import('lenis'), import('gsap'), import('gsap/ScrollTrigger'),
        ])
        if (disposed || current !== generation || motion.matches) return
        gsap.registerPlugin(ScrollTrigger)
        const lenis = new Lenis({
          lerp: .1,
          smoothWheel: true,
          syncTouch: false,
          anchors: { offset: -24 },
        })
        // One shared animation clock, synchronized with the hero scroll effect.
        const tick = seconds => lenis.raf(seconds * 1000)
        lenis.on('scroll', ScrollTrigger.update)
        gsap.ticker.add(tick)
        cleanup = () => {
          gsap.ticker.remove(tick)
          lenis.off('scroll', ScrollTrigger.update)
          lenis.destroy()
        }
      } catch { /* Native scrolling remains available if motion fails to load. */ }
    }

    sync()
    motion.addEventListener('change', sync)
    return () => { disposed = true; generation++; cleanup(); motion.removeEventListener('change', sync) }
  }, [])
}
