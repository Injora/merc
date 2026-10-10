import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { lazy, Suspense, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { STORY_LENGTH_VH, CAPTIONS } from '../../config/story'
import type { Tier } from '../../lib/device'
import { isMobileViewport } from '../../lib/device'
import { S } from '../../lib/state'
import { HeroContent } from '../landing/HeroContent'
import { ErrorBoundary } from '../ui/ErrorBoundary'
import { CarFallback } from './carseq/CarFallback'
import { Callouts } from './hud/Callouts'
import { ChapterRail, CinematicText } from './StoryLayers'
import { buildStoryTimeline } from './timeline'
import { IgnitionOverlay } from './IgnitionOverlay'

const Stage = lazy(() => import('./Stage'))

/**
 * The film. A tall section whose sticky viewport holds the WebGL stage and
 * its DOM layers; scrolling through the section scrubs the master timeline.
 * When the section ends, its last frame — the hackathon hero — simply
 * scrolls up into the event page.
 */
export function CinematicExperience({ tier, onFail }: { tier: Tier; onFail: () => void }) {
  const section = useRef<HTMLElement>(null)
  const dip = useRef<HTMLDivElement>(null)
  const dim = useRef<HTMLDivElement>(null)
  const line = useRef<HTMLDivElement>(null)
  const hero = useRef<HTMLDivElement>(null)
  const cue = useRef<HTMLDivElement>(null)
  const [layers] = useState(createLayerRegistry)
  const [active, setActive] = useState(true)
  const [mobile] = useState(isMobileViewport)

  useLayoutEffect(() => {
    if (!section.current || !dip.current || !hero.current) return
    const kill = buildStoryTimeline(
      section.current,
      { dip: dip.current, line: line.current, hero: hero.current, cue: cue.current, captions: layers.captions },
      { mobile },
    )
    // the final dim under the hero frame follows S.dim
    let raf = 0
    const loop = () => {
      raf = requestAnimationFrame(loop)
      if (dim.current) dim.current.style.opacity = String(S.dim)
    }
    raf = requestAnimationFrame(loop)
    const refresh = () => ScrollTrigger.refresh()
    void document.fonts?.ready.then(refresh)
    return () => {
      cancelAnimationFrame(raf)
      kill()
    }
  }, [mobile, layers])

  // stop rendering WebGL entirely while the story is off-screen
  useEffect(() => {
    const el = section.current
    if (!el) return
    const io = new IntersectionObserver(([e]) => setActive(e.isIntersecting), { rootMargin: '100px 0px' })
    io.observe(el)
    return () => io.disconnect()
  }, [])

  const length = mobile ? STORY_LENGTH_VH.mobile : STORY_LENGTH_VH.desktop

  return (
    <>
      <section ref={section} className="story" style={{ height: `${length}svh` }} aria-label="Engineered to move. Ready to think. — an interactive film">
        <div className="story-viewport">
          <ErrorBoundary fallback={null} onError={onFail}>
            <Suspense fallback={null}>
              <Stage tier={tier} active={active} onContextLost={onFail} />
            </Suspense>
          </ErrorBoundary>
          <CarFallback />
          <Callouts />
          <div ref={dim} className="story-dim" aria-hidden />
          <div ref={dip} className="story-dip" aria-hidden />
          <div ref={line} className="finale-line" aria-hidden />
          <CinematicText register={layers.registerCaption} />
          <div ref={hero} className="story-hero">
            <HeroContent headingLevel="h1" />
          </div>
          <div ref={cue} className="scroll-cue" aria-hidden>
            <span>Scroll to drive</span>
            <i />
          </div>
          <div className="letterbox" aria-hidden />
        </div>
        <div className="sr-only">
          {CAPTIONS.map((c) => (
            <p key={c.id}>{c.line}</p>
          ))}
        </div>
      </section>
      <IgnitionOverlay />
      <ChapterRail />
    </>
  )
}

/** Caption nodes the master timeline animates, collected through callback refs. */
function createLayerRegistry() {
  const captions = new Map<string, HTMLElement>()
  const registerCaption = (id: string) => (el: HTMLElement | null) => {
    if (el) captions.set(id, el)
    else captions.delete(id)
  }
  return { captions, registerCaption }
}
