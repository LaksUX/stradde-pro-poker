import { useEffect, useRef, useState } from 'react'

// Animates a number toward `target` (count-up on first show, glide on later
// changes). No animation library: a short requestAnimationFrame ease-out. Skips
// straight to the target when the user prefers reduced motion.
export function useCountUp(target: number, duration = 900): number {
  const [value, setValue] = useState(0)
  const current = useRef(0)

  useEffect(() => {
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    if (reduce || duration <= 0) {
      current.current = target
      setValue(target)
      return
    }
    const from = current.current
    const start = performance.now()
    let raf = 0
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration)
      const eased = 1 - Math.pow(1 - t, 3)
      const next = from + (target - from) * eased
      current.current = next
      setValue(next)
      if (t < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [target, duration])

  return Math.round(value)
}
