export function supportsWebGL(): boolean {
  try {
    const canvas = document.createElement('canvas')
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl')
    const ok = !!gl
    // release the probe context immediately
    ;(gl as WebGLRenderingContext | null)?.getExtension('WEBGL_lose_context')?.loseContext()
    return ok
  } catch {
    return false
  }
}

export function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

export type Tier = 'high' | 'low'

/** Coarse device tier: phones/tablets and low-core machines get the lighter scene. */
export function detectTier(): Tier {
  const coarse = window.matchMedia('(pointer: coarse)').matches
  const small = Math.min(window.innerWidth, window.innerHeight) < 700
  const cores = navigator.hardwareConcurrency ?? 8
  const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 8
  if ((coarse && small) || cores <= 4 || memory <= 4) return 'low'
  return 'high'
}

export const isMobileViewport = () => window.innerWidth < 760

/** Which version of the story to render, decided once on load. */
export type ExperienceMode = 'cinematic' | 'static'

export function detectMode(): { mode: ExperienceMode; reason: 'ok' | 'reduced-motion' | 'no-webgl' } {
  const params = new URLSearchParams(window.location.search)
  if (params.has('static')) return { mode: 'static', reason: 'reduced-motion' }
  if (!supportsWebGL()) return { mode: 'static', reason: 'no-webgl' }
  if (prefersReducedMotion()) return { mode: 'static', reason: 'reduced-motion' }
  return { mode: 'cinematic', reason: 'ok' }
}

/**
 * Dev-only `?nosmooth`: no Lenis, instant scrub. Used by scripts/shots.mjs so
 * a screenshot at a story unit is deterministic. Ignored in production.
 */
export const DEV_NOSMOOTH = import.meta.env.DEV && typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('nosmooth')
