import { gsap } from 'gsap'
import { useEffect } from 'react'
import { S, flagStore } from '../lib/state'
import { storyTrigger } from '../components/cinematic/timeline'
import { audio } from './AudioEngine'

/**
 * Bridges scroll → sound. Runs on GSAP's ticker, throttled to ~30 Hz:
 *  - measures raw scroll velocity and smooths it (fast attack, slow release),
 *    so acceleration follows the visitor's hand and decays naturally at rest;
 *  - publishes the smoothed value to the 3D world (S.scrollVelocity);
 *  - forwards the timeline's audio mix plus velocity to the engine;
 *  - plays a soft whoosh on each dip-to-black.
 * No sound is ever retriggered per scroll event.
 */
export function AudioController() {
  useEffect(() => {
    let lastY = window.scrollY
    let lastT = performance.now()
    let acc = 0
    let smoothed = 0
    let lastDip = 0
    let lastWhoosh = 0

    const tick = () => {
      const now = performance.now()
      const dt = (now - lastT) / 1000
      acc += dt
      lastT = now
      if (acc < 1 / 30) return
      const y = window.scrollY
      const raw = Math.min(1.25, Math.abs(y - lastY) / Math.max(acc, 1 / 120) / 2600)
      lastY = y
      const k = raw > smoothed ? 0.22 : 0.045
      smoothed += (raw - smoothed) * k
      if (smoothed < 0.002) smoothed = 0
      acc = 0
      S.scrollVelocity = smoothed

      if (!flagStore.get().ignited) return

      // fade the score out once the visitor has moved on into the event page
      let beyond = 1
      if (storyTrigger) beyond = Math.max(0, 1 - (y - storyTrigger.end) / (window.innerHeight * 1.4))

      audio.update({
        rpm: S.mix.rpm,
        engine: S.mix.engine * beyond,
        muffle: S.mix.muffle,
        road: S.mix.road * beyond,
        future: S.mix.future * beyond,
        velocity: smoothed * beyond,
      })

      if (S.dip > 0.6 && lastDip <= 0.6 && now - lastWhoosh > 700) {
        audio.whoosh(0.8 + smoothed * 0.6)
        lastWhoosh = now
      }
      lastDip = S.dip
    }

    gsap.ticker.add(tick)
    return () => gsap.ticker.remove(tick)
  }, [])

  useEffect(() => () => audio.dispose(), [])
  return null
}
