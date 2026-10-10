import { ArrowDown } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { audio } from '../../audio/AudioEngine'
import { ASSETS } from '../../config/assets'
import { CAPTIONS } from '../../config/story'
import { scrollToElement } from '../../lib/scroll'
import { HeroContent } from '../landing/HeroContent'
import { StarMark } from '../ui/Info'
import { CarSequence } from './carseq/CarSequence'

/** caption id → its still composition */
const FIGURE: Record<string, 'outline' | 'core' | 'network' | 'horizon'> = {
  twin: 'outline',
  cs: 'network',
  ml: 'network',
  'ml-2': 'outline',
  cv: 'core',
  opt: 'core',
  ai: 'network',
  platform: 'outline',
  tenfold: 'horizon',
  breakthrough: 'horizon',
  bridge: 'horizon',
}

/**
 * The same film without real-time 3D or autonomous motion: used for
 * prefers-reduced-motion, missing WebGL, or a lost GPU context. The car turns
 * only as the reader scrolls (its image sequence); every chapter is a still
 * composition of fine lines — the car's traced outline, a network, orbits,
 * the horizon — and its line of text.
 */
export function StaticStory({ reason }: { reason: 'reduced-motion' | 'no-webgl' | 'error' }) {
  const carSection = useRef<HTMLElement>(null)
  const [outline, setOutline] = useState<{ d: string; viewBox: string } | null>(null)
  const carPosition = useCallback(() => {
    const el = carSection.current
    if (!el) return 0
    const r = el.getBoundingClientRect()
    return Math.max(0, Math.min(1, -r.top / Math.max(1, r.height - window.innerHeight)))
  }, [])

  useEffect(() => {
    const url = ASSETS.sequences.car?.outline
    if (!url) return
    let alive = true
    fetch(url)
      .then((r) => (r.ok ? r.text() : Promise.reject(new Error(String(r.status)))))
      .then((text) => {
        const doc = new DOMParser().parseFromString(text, 'image/svg+xml')
        const d = [...doc.querySelectorAll('path')].map((p) => p.getAttribute('d') ?? '').join(' ')
        const vb = doc.querySelector('svg')?.getAttribute('viewBox') ?? '0 0 2000 734'
        if (alive && d) setOutline({ d, viewBox: vb })
      })
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [])

  return (
    <div className="static-story">
      <section className="static-open">
        <StarMark size={88} className="static-star" />
        <p className="caption-kicker">NST-SDC · With Mercedes-Benz</p>
        <h2 className="static-title">Engineered to move. Ready to think.</h2>
        <button
          type="button"
          className="btn btn-ghost"
          onClick={() => {
            if (audio.unlock()) {
              audio.click()
              audio.ignition()
            }
            scrollToElement(document.getElementById('static-car'))
          }}
        >
          <span>Start engine</span>
          <ArrowDown size={18} strokeWidth={1.5} aria-hidden />
        </button>
        <p className="static-reason">
          {reason === 'reduced-motion'
            ? 'Showing the still version of the film because your device prefers reduced motion.'
            : 'Showing the still version of the film because 3D graphics are unavailable on this device.'}
        </p>
      </section>
      {ASSETS.sequences.car && (
        <section ref={carSection} id="static-car" className="static-car" aria-label="The car">
          <div className="static-car-sticky">
            <CarSequence position={carPosition} />
          </div>
        </section>
      )}
      {CAPTIONS.filter((c) => c.id !== 'title' && c.size !== 'note').map((c) => {
        const fig = FIGURE[c.id]
        return (
          <section key={c.id} id={`static-${c.id}`} className="static-frame" data-figure={fig}>
            <div className="static-figure" aria-hidden>
              {fig === 'outline' && outline && (
                <svg viewBox={outline.viewBox} preserveAspectRatio="xMidYMid meet">
                  <path d={outline.d} />
                </svg>
              )}
              {fig === 'core' && (
                <span className="static-core">
                  <i />
                  <i />
                  <i />
                </span>
              )}
              {fig === 'network' && <span className="static-network" />}
            </div>
            <div className="static-frame-text">
              {c.kicker && <p className="caption-kicker">{c.kicker}</p>}
              <p className="static-line">{c.line}</p>
            </div>
          </section>
        )
      })}
      <section className="static-hero">
        <HeroContent headingLevel="h1" />
      </section>
    </div>
  )
}
