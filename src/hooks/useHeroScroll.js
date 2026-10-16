import { useEffect } from 'react'

// Optional, scroll-linked presentation. No pinning or custom scroll behavior.
export default function useHeroScroll(ref, enabled = true) {
  useEffect(() => {
    if (!enabled) return
    const hero = ref.current
    if (!hero) return
    let cancelled = false
    let media

    Promise.all([import('gsap'), import('gsap/ScrollTrigger')]).then(([{ gsap }, { ScrollTrigger }]) => {
      if (cancelled) return
      gsap.registerPlugin(ScrollTrigger)
      media = gsap.matchMedia()
      media.add('(prefers-reduced-motion: no-preference)', () => {
        gsap.to(hero, {
          scale: .94,
          opacity: .18,
          ease: 'none',
          scrollTrigger: {
            trigger: hero.parentElement,
            start: 'top top',
            end: 'bottom top',
            scrub: true,
            invalidateOnRefresh: true,
          },
        })
      })
    }).catch(() => { /* A static hero is the fallback if motion cannot load. */ })

    return () => { cancelled = true; media?.revert() }
  }, [ref, enabled])
}
