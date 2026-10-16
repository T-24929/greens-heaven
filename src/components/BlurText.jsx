import { useLayoutEffect, useRef } from 'react'

/** Word-stagger adaptation of the supplied React Bits BlurText.
 * Uses CSS + IntersectionObserver for this one-shot effect, keeping Motion's
 * runtime in the deferred velocity banner instead of the initial hero bundle.
 */
export default function BlurText({ text, as: Tag = 'span', className = '', enabled = true,
  delay = 35, startDelay = 0, stepDuration = .55, blur = 3, distance = 8, ...props }) {
  const ref = useRef(null)
  useLayoutEffect(() => {
    const element = ref.current
    if (!element || !enabled) return
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)')
    if (motion.matches) return
    element.dataset.reveal = 'waiting'
    const show = () => { element.dataset.reveal = 'visible'; observer.disconnect() }
    const immediate = () => { element.dataset.reveal = 'ready'; observer.disconnect() }
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) show()
    }, { threshold: .1 })
    observer.observe(element)
    const control = element.closest('a, button, summary') || element
    control.addEventListener('focusin', immediate)
    const onMotion = event => { if (event.matches) immediate() }
    motion.addEventListener('change', onMotion)
    return () => { observer.disconnect(); control.removeEventListener('focusin', immediate); motion.removeEventListener('change', onMotion); delete element.dataset.reveal }
  }, [text, enabled])

  return <Tag ref={ref} className={`blur-text ${className}`} style={{ '--word-delay': `${delay}ms`, '--word-start': `${startDelay}ms`, '--word-duration': `${stepDuration}s`, '--word-blur': `${blur}px`, '--word-distance': `${distance}px` }} {...props}>
    <span className="sr-only">{text}</span>
    <span aria-hidden="true">{text.split(' ').map((word, index, words) => <span key={index}><span className="blur-word" style={{ '--word-index': index }}>{word}</span>{index < words.length - 1 ? ' ' : ''}</span>)}</span>
  </Tag>
}
