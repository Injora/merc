import { useEffect, useLayoutEffect, useState, useSyncExternalStore } from 'react'
import { AudioController } from './audio/AudioController'
import { SoundToggle } from './audio/SoundToggle'
import { CinematicExperience } from './components/cinematic/CinematicExperience'
import { playIntro, skipIntro } from './components/cinematic/ignition'
import { StaticStory } from './components/cinematic/StaticStory'
import { HackathonLanding } from './components/landing/HackathonLanding'
import { LoadingScreen } from './components/ui/LoadingScreen'
import { Navigation } from './components/ui/Navigation'
import { DEV_NOSMOOTH, detectMode, detectTier, type Tier } from './lib/device'
import { destroyScroll, initScroll, lockScroll } from './lib/scroll'
import { flagStore } from './lib/state'

type Mode = { mode: 'cinematic' } | { mode: 'static'; reason: 'reduced-motion' | 'no-webgl' | 'error' }

export default function App() {
  const [mode, setMode] = useState<Mode>(() => {
    const d = detectMode()
    return d.mode === 'cinematic' ? { mode: 'cinematic' } : { mode: 'static', reason: d.reason === 'no-webgl' ? 'no-webgl' : 'reduced-motion' }
  })
  const [tier] = useState<Tier>(detectTier)
  const flags = useSyncExternalStore(flagStore.subscribe, flagStore.get)
  const cinematic = mode.mode === 'cinematic'

  // always start at the ignition, never mid-film after a reload
  useLayoutEffect(() => {
    if ('scrollRestoration' in history) history.scrollRestoration = 'manual'
    window.scrollTo(0, 0)
  }, [])

  useEffect(() => {
    const smooth = cinematic && !DEV_NOSMOOTH && !window.matchMedia('(pointer: coarse)').matches
    initScroll(smooth)
    lockScroll(cinematic && !flagStore.get().unlocked)
    return () => destroyScroll()
  }, [cinematic])

  useEffect(() => {
    if (cinematic && flags.stageReady) playIntro()
  }, [cinematic, flags.stageReady])

  const fail = () => {
    // WebGL failed or the GPU context was lost: keep the story and the event page working
    lockScroll(false)
    flagStore.set({ ignited: true, unlocked: true })
    setMode({ mode: 'static', reason: 'error' })
  }

  return (
    <div className="app" id="top" data-mode={mode.mode}>
      <a className="skip-link" href="#event" onClick={() => skipIntro(document.getElementById('event'))}>
        Skip to event information
      </a>
      <Navigation visible={!cinematic || flags.unlocked} />
      {cinematic ? <CinematicExperience tier={tier} onFail={fail} /> : <StaticStory reason={mode.reason} />}
      <HackathonLanding />
      <SoundToggle />
      <AudioController />
      {cinematic && <LoadingScreen done={flags.stageReady || flags.unlocked} onSkip={() => skipIntro(document.getElementById('event'))} />}
    </div>
  )
}
