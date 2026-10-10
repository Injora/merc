import { ArrowDown, ArrowUpRight } from 'lucide-react'
import { EVENT } from '../../config/event'
import { scrollToElement } from '../../lib/scroll'
import { Info, StarMark } from '../ui/Info'

/** The destination frame: closing line, event name, organiser and sponsor. */
export function HeroContent({ headingLevel = 'h2' }: { headingLevel?: 'h1' | 'h2' }) {
  const H = headingLevel
  return (
    <div className="hero">
      <p className="hero-presents">
        <span>{EVENT.organizer.short.text}</span>
        <span className="hero-presents-rule" aria-hidden />
        <span>presents</span>
      </p>
      <H className="hero-title">
        <Info c={EVENT.name} />
      </H>
      <p className="hero-headline">{EVENT.closing.headline.text}</p>
      <p className="hero-support">{EVENT.closing.support.text}</p>
      <div className="hero-actions">
        <a className="btn btn-primary" href={EVENT.registration.url} target="_blank" rel="noopener noreferrer">
          <span>{EVENT.registration.label}</span>
          <ArrowUpRight size={18} strokeWidth={1.5} aria-hidden />
        </a>
        <button type="button" className="btn btn-ghost" onClick={() => scrollToElement(document.getElementById('event'))}>
          <span>Event details</span>
          <ArrowDown size={18} strokeWidth={1.5} aria-hidden />
        </button>
      </div>
      <p className="hero-sponsor">
        <StarMark size={22} />
        <span>{EVENT.sponsor.acknowledgement.text}</span>
      </p>
      {!EVENT.registration.confirmed && <p className="hero-note">Registration link is a placeholder until published.</p>}
    </div>
  )
}
