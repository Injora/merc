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
 *  - tells the engine whether the music should play (in the film, before the hackathon title);
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

      // the music plays through the film and fades out as the hackathon name appears (units 95.2 → 96.6);
      // scrolling back up into the film brings it back
      let presence = 1
      if (storyTrigger) {
        const unit = storyTrigger.progress * 100
        presence = 1 - Math.min(1, Math.max(0, (unit - 95.2) / 1.4))
      }
      audio.update({ presence })

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
