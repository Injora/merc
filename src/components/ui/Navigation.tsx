import { ArrowUpRight, Menu, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { EVENT } from '../../config/event'
import { scrollToElement } from '../../lib/scroll'
import { StarMark } from './Info'

const LINKS = [
  ['Event', 'event'],
  ['Tracks', 'tracks'],
  ['Prizes', 'prizes'],
  ['Schedule', 'schedule'],
  ['FAQ', 'faq'],
] as const

/** Minimal top bar. Hidden behind the ignition, then quietly present. */
export function Navigation({ visible }: { visible: boolean }) {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  const go = (id: string) => {
    setOpen(false)
    scrollToElement(document.getElementById(id))
  }

  return (
    // hidden = inert: invisible links must not sit in the tab order before START ENGINE
    <header className="nav" data-visible={visible} data-open={open} inert={!visible}>
      <a
        className="nav-brand"
        href="#top"
        onClick={(e) => {
          e.preventDefault()
          go('top')
        }}
      >
        <span className="nav-org">{EVENT.organizer.short.text}</span>
        <span className="nav-x" aria-hidden>
          ×
        </span>
        <StarMark size={20} />
        <span className="nav-sponsor">{EVENT.sponsor.name.text}</span>
      </a>
      <nav className="nav-links" aria-label="Event sections" id="nav-menu">
        {LINKS.map(([label, id]) => (
          <button key={id} type="button" onClick={() => go(id)}>
            {label}
          </button>
        ))}
        <a className="btn btn-primary btn-small" href={EVENT.registration.url} target="_blank" rel="noopener noreferrer">
          <span>Register</span>
          <ArrowUpRight size={16} strokeWidth={1.5} aria-hidden />
        </a>
      </nav>
      <button type="button" className="nav-toggle" aria-expanded={open} aria-controls="nav-menu" aria-label={open ? 'Close menu' : 'Open menu'} onClick={() => setOpen((o) => !o)}>
        {open ? <X size={22} strokeWidth={1.25} /> : <Menu size={22} strokeWidth={1.25} />}
      </button>
    </header>
  )
}
