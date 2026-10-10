import Lenis from 'lenis'
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'

gsap.registerPlugin(ScrollTrigger)
ScrollTrigger.config({ ignoreMobileResize: true })

let lenis: Lenis | null = null
let tick: ((time: number) => void) | null = null

/**
 * Smooth scrolling (desktop only — touch devices keep native momentum).
 * Lenis drives ScrollTrigger from GSAP's ticker so there is a single RAF.
 */
export function initScroll(smooth: boolean) {
  if (!smooth || lenis) return
  // lerp-based smoothing (frame-rate independent): inertia without a fixed tween length
  lenis = new Lenis({ lerp: 0.08, smoothWheel: true, wheelMultiplier: 0.9, autoRaf: false })
  lenis.on('scroll', ScrollTrigger.update)
  tick = (time) => lenis?.raf(time * 1000)
  gsap.ticker.add(tick)
  // keep lag smoothing on: a stalled tab must not make time-based sequences (the ignition) jump to their end
  gsap.ticker.lagSmoothing(500, 33)
}

export function destroyScroll() {
  if (tick) gsap.ticker.remove(tick)
  lenis?.destroy()
  lenis = null
  tick = null
}

/** Lock page scroll (used before START ENGINE). */
export function lockScroll(locked: boolean) {
  document.documentElement.classList.toggle('scroll-locked', locked)
  if (locked) lenis?.stop()
  else lenis?.start()
}

export function scrollToY(y: number, opts: { immediate?: boolean; duration?: number } = {}) {
  if (lenis) lenis.scrollTo(y, { immediate: opts.immediate, duration: opts.duration ?? 2.2, force: true })
  else window.scrollTo({ top: y, behavior: opts.immediate ? 'auto' : 'smooth' })
}

export function scrollToElement(el: Element | null, opts: { immediate?: boolean } = {}) {
  if (!el) return
  const y = el.getBoundingClientRect().top + window.scrollY
  scrollToY(y, opts)
}
