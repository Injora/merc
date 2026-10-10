import { ArrowUpRight } from 'lucide-react'
import { EVENT } from '../../config/event'
import { Info } from '../ui/Info'
import { SectionHeader } from './SectionHeader'

export function EventOverview() {
  const f = EVENT.facts
  const facts = [
    ['Dates', f.dates],
    ['Venue', f.venue],
    ['Format', f.format],
    ['Team size', f.teamSize],
    ['Registration closes', f.deadline],
  ] as const
  return (
    <section className="section overview" aria-labelledby="overview-title">
      <SectionHeader id="overview-title" index="01" label="The event" title="Build what moves the next generation." />
      <div className="overview-grid">
        <div className="overview-copy">
          <Info as="p" className="lede" c={EVENT.description} />
          <p className="overview-org">
            Organised by <strong>{EVENT.organizer.full.text}</strong>. {EVENT.sponsor.acknowledgement.text}
          </p>
          <a className="btn btn-primary" href={EVENT.registration.url} target="_blank" rel="noopener noreferrer">
            <span>{EVENT.registration.label}</span>
            <ArrowUpRight size={18} strokeWidth={1.5} aria-hidden />
          </a>
        </div>
        <dl className="facts">
          {facts.map(([label, value]) => (
            <div key={label} className="fact">
              <dt>{label}</dt>
              <dd>
                <Info c={value} />
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  )
}
