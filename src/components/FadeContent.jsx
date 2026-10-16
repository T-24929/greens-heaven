import { useEffect, useRef } from 'react'

const toSeconds = value => Math.max(0, value > 10 ? value / 1000 : value)

/**
 * Fade-only adaptation of the React Bits FadeContent supplied for this project.
 * GSAP is loaded on demand. IntersectionObserver replaces ScrollTrigger for
 * one-time reveals; unused SVG noise masks, filters and scroll scrubbing are
 * deliberately omitted. Content remains readable if the animation can't load.
 */
export default function FadeContent({
  children,
  duration = .7,
  ease = 'power2.out',
  delay = 0,
  threshold = .1,
  initialOpacity = 0,
  stagger = 0,
  trigger = 'scroll',
  enabled = true,
  className = '',
  ...props
}) {
  const ref = useRef(null)

  useEffect(() => {
    if (!enabled) return
    const element = ref.current
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)')
    if (!element || motion.matches) return

    let cancelled = false
    let observer
    let context
    let tween
    let started = false
    const targets = stagger > 0 && element.children.length ? Array.from(element.children) : [element]

    const showImmediately = () => {
      cancelled = true
      observer?.disconnect()
      tween?.kill()
      context?.revert()
    }
    const onMotionChange = event => { if (event.matches) showImmediately() }
    // Keyboard navigation never waits for an appearance animation.
    element.addEventListener('focusin', showImmediately)
    motion.addEventListener('change', onMotionChange)

    import('gsap').then(({ gsap }) => {
      if (cancelled || element.contains(document.activeElement)) return
      context = gsap.context(() => {
        // Prepare before observing, so scrolling never flashes fully visible
        // content and then hides it again at the reveal threshold.
        gsap.set(targets, { opacity: Math.min(1, Math.max(0, initialOpacity)) })
        const reveal = () => {
          if (started || cancelled) return
          started = true
          observer?.disconnect()
          context.add(() => {
            tween = gsap.fromTo(targets,
              { opacity: Math.min(1, Math.max(0, initialOpacity)) },
              {
                opacity: 1,
                duration: toSeconds(duration),
                delay: toSeconds(delay),
                ease,
                stagger: toSeconds(stagger),
                clearProps: 'opacity',
              },
            )
          })
        }
        // Set up after context assignment; this also handles Strict Mode cleanup.
        queueMicrotask(() => {
          if (cancelled) return
          if (trigger === 'mount' || !('IntersectionObserver' in window)) reveal()
          else {
            observer = new IntersectionObserver(entries => {
              if (entries.some(entry => entry.isIntersecting)) reveal()
            }, { threshold: Math.min(.9, Math.max(0, threshold)) })
            observer.observe(element)
          }
        })
      }, element)
    }).catch(showImmediately)

    return () => {
      showImmediately()
      element.removeEventListener('focusin', showImmediately)
      motion.removeEventListener('change', onMotionChange)
    }
  }, [enabled, duration, ease, delay, threshold, initialOpacity, stagger, trigger])

  return <div ref={ref} className={className} data-fade-content="" {...props}>{children}</div>
}
