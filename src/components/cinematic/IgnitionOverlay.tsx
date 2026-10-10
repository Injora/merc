import { gsap } from 'gsap'
import { useEffect, useRef, useSyncExternalStore } from 'react'
import { S, flagStore } from '../../lib/state'
import { ignite, skipIntro } from './ignition'

/**
 * The DOM layer over the 3D ignition button: an accessible, keyboard-operable
 * hit-target exactly the size of the rendered button (sized from WebGL via
 * --ignition-size), the microcopy, the pointer-following light and a skip link.
 */
export function IgnitionOverlay() {
  const flags = useSyncExternalStore(flagStore.subscribe, flagStore.get)
  const root = useRef<HTMLDivElement>(null)

  // pointer-following light (CSS variables, written in rAF — no React renders)
  useEffect(() => {
    const el = root.current
    if (!el) return
    let raf = 0
    let x = window.innerWidth / 2
    let y = window.innerHeight / 2
    const move = (e: PointerEvent) => {
      x = e.clientX
      y = e.clientY
      if (!raf)
        raf = requestAnimationFrame(() => {
          raf = 0
          el.style.setProperty('--mx', `${x}px`)
          el.style.setProperty('--my', `${y}px`)
        })
    }
    window.addEventListener('pointermove', move, { passive: true })
    return () => {
      window.removeEventListener('pointermove', move)
      cancelAnimationFrame(raf)
    }
  }, [])

  const hover = (v: number) => gsap.to(S, { hover: v, duration: v ? 0.5 : 0.8, ease: 'power2.out', overwrite: 'auto' })
  const press = (v: number) => {
    if (!flags.ignited) gsap.to(S, { pressed: v, duration: v ? 0.08 : 0.25, ease: 'power2.out', overwrite: 'auto' })
  }

  return (
    <div ref={root} className="ignition" data-state={flags.unlocked ? 'done' : flags.ignited ? 'running' : flags.stageReady ? 'ready' : 'loading'}>
      <div className="ignition-light" aria-hidden />
      <button
        type="button"
        className="ignition-hit"
        aria-label="Start engine — begin the experience"
        disabled={flags.ignited || !flags.stageReady}
        onPointerEnter={() => hover(1)}
        onPointerLeave={() => {
          hover(0)
          press(0)
        }}
        onFocus={() => hover(1)}
        onBlur={() => hover(0)}
        onPointerDown={() => press(1)}
        onPointerUp={() => press(0)}
        onClick={() => {
          hover(0)
          ignite()
        }}
      >
        <span className="sr-only">Start engine</span>
      </button>
      <p className="ignition-copy" aria-hidden>
        An extraordinary journey awaits
      </p>
      <p className="ignition-hint" aria-hidden>
        Best experienced with sound
      </p>
      <button type="button" className="ignition-skip" onClick={() => skipIntro(document.getElementById('event'))}>
        Skip to event details
      </button>
    </div>
  )
}
