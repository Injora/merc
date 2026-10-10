import { useEffect, useRef } from 'react'
import { CAPTIONS, CHAPTERS } from '../../config/story'
import { scrollToY } from '../../lib/scroll'
import { storyTrigger, unitToScroll } from './timeline'

type Register = (id: string) => (el: HTMLElement | null) => void

/** On-screen lines. Words are split so the timeline can stagger them in. */
export function CinematicText({ register }: { register: Register }) {
  return (
    <div className="captions">
      {CAPTIONS.map((c) => (
        <div key={c.id} ref={register(c.id)} className="caption" data-align={c.align ?? 'left'} data-size={c.size ?? 'line'} data-pos={c.pos ?? 'bottom'}>
          {c.kicker && (
            <p className="caption-kicker" data-kicker>
              {c.kicker}
            </p>
          )}
          <p className="caption-line">
            {c.line.split(' ').map((w, i) => (
              <span key={i} className="caption-word" data-word>
                {w}&nbsp;
              </span>
            ))}
          </p>
        </div>
      ))}
    </div>
  )
}

/** Chapter index on the right edge: shows where you are, jumps where you want. */
export function ChapterRail() {
  const root = useRef<HTMLElement>(null)

  useEffect(() => {
    let raf = 0
    let last = ''
    const loop = () => {
      raf = requestAnimationFrame(loop)
      const el = root.current
      if (!el || !storyTrigger) return
      const p = storyTrigger.progress * 100
      let active = CHAPTERS[0].id
      for (const c of CHAPTERS) if (p >= c.at - 1.5) active = c.id
      const inStory = storyTrigger.isActive || (p > 0 && p < 100)
      const key = `${active}|${inStory}`
      if (key === last) return
      last = key
      el.dataset.visible = String(inStory && p < 99)
      el.querySelectorAll<HTMLElement>('[data-chapter]').forEach((li) => {
        li.dataset.active = String(li.dataset.chapter === active)
      })
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [])

  return (
    <nav ref={root} className="rail" aria-label="Story chapters" data-visible="false">
      <ol>
        {CHAPTERS.map((c) => (
          <li key={c.id} data-chapter={c.id}>
            <button type="button" onClick={() => scrollToY(unitToScroll(c.at), { duration: 2.6 })}>
              <span className="rail-index">{c.index}</span>
              <span className="rail-label">{c.label}</span>
            </button>
          </li>
        ))}
      </ol>
    </nav>
  )
}
