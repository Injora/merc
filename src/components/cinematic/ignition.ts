import { gsap } from 'gsap'
import { audio } from '../../audio/AudioEngine'
import { S, flagStore } from '../../lib/state'
import { lockScroll, scrollToElement } from '../../lib/scroll'

/** The button emerges from the dark once the stage is ready. */
export function playIntro() {
  gsap.to(S, { intro: 1, duration: 2.6, ease: 'power2.inOut', delay: 0.2 })
  // a single glint travels across the chrome — "a tiny metallic reflection appears"
  gsap.fromTo(S, { ignSweep: 0 }, { ignSweep: 1, duration: 1.8, ease: 'power1.inOut', delay: 1.4, onComplete: () => void (S.ignSweep = 0) })
}

let running = false

/**
 * START ENGINE. Timed to the synthesized audio: the starter cranks for
 * ~0.55 s, the engine catches at ≈0.7 s (lights come up), the instruments
 * sweep, and the button blooms into the star while the camera moves in.
 * The engine is heard, not seen: there is no camera shake.
 */
export function ignite() {
  if (running || flagStore.get().ignited) return
  running = true
  audio.unlock()
  audio.click()
  flagStore.set({ ignited: true })

  const tl = gsap.timeline({
    onComplete: () => {
      running = false
      lockScroll(false)
      flagStore.set({ unlocked: true })
    },
  })
  tl.to(S, { pressed: 1, duration: 0.09, ease: 'power2.out' }, 0)
    .call(() => audio.ignition(), [], 0.12)
    .to(S, { pressed: 0.4, duration: 0.6, ease: 'power2.out' }, 0.32)
    .to(S, { ign: 1, duration: 2.4, ease: 'power2.inOut' }, 0.62)
    .to(S, { horizon: 1, duration: 1.8, ease: 'expo.out' }, 0.7)
    .fromTo(S, { ignPulse: 0 }, { ignPulse: 1, duration: 1.7, ease: 'power2.out', immediateRender: false }, 0.68)
    .to(S, { gauge: 1, duration: 0.8, ease: 'power2.inOut' }, 0.72)
    .to(S, { gauge: 0, duration: 0.85, ease: 'power2.inOut' }, 1.56)
    .fromTo(S, { ignSweep: 0 }, { ignSweep: 1, duration: 1.5, ease: 'power1.inOut', immediateRender: false }, 1.1)
    .set(S, { ignSweep: 0 }, 2.7)
    // the emblem exists from this instant on — never before the button is pressed
    .set(S, { revealed: 1 }, 1.98)
    .to(S, { morph: 1, duration: 2.3, ease: 'back.out(1.25)' }, 2.0)
    .to(S, { ignCamZ: 0, duration: 2.8, ease: 'power3.inOut' }, 1.9)
    .to(S, { horizon: 0.18, duration: 1.6, ease: 'power2.inOut' }, 2.8)
    .to(S, { pressed: 0, duration: 0.4 }, 2.4)

  // once the star has settled: one deliberate studio sweep across its facets (separate
  // tween, so it never delays unlocking the scroll; the star itself stays perfectly still)
  tl.call(() => void gsap.fromTo(S, { ignSweep: 0 }, { ignSweep: 1, duration: 2.6, ease: 'sine.inOut', onComplete: () => void (S.ignSweep = 0) }), [], 4.0)
  return tl
}

/** Jump to the settled post-ignition state (star on screen, scrolling unlocked). */
export function completeIgnition() {
  if (!flagStore.get().ignited) {
    gsap.set(S, { intro: 1, ign: 1, revealed: 1, morph: 1, ignCamZ: 0, pressed: 0, horizon: 0.18, gauge: 0 })
    flagStore.set({ ignited: true })
  }
  lockScroll(false)
  flagStore.set({ unlocked: true })
}

/** Skip the opening: jump straight to the event details, story left intact above. */
export function skipIntro(target: Element | null) {
  completeIgnition()
  requestAnimationFrame(() => scrollToElement(target, { immediate: true }))
}
