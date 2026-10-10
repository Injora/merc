import type { Person } from '../../config/event'
import { EVENT } from '../../config/event'
import { Info } from '../ui/Info'
import { SectionHeader } from './SectionHeader'

function Roster({ title, people }: { title: string; people: readonly Person[] }) {
  return (
    <div className="roster">
      <h3 className="roster-title">{title}</h3>
      <ul>
        {people.map((p, i) => (
          <li key={i} className="person">
            <span className="person-mono" aria-hidden>
              {p.name.confirmed ? p.name.text.split(' ').map((w) => w[0]).slice(0, 2).join('') : '—'}
            </span>
            <span className="person-text">
              <Info as="strong" c={p.name} />
              <span className="person-role">
                <Info c={p.role} /> · <Info c={p.org} />
              </span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

export function People() {
  return (
    <section className="section" id="people" aria-labelledby="people-title">
      <SectionHeader id="people-title" index="06" label="Judges & mentors" title="The people in the passenger seat." />
      <div className="people">
        <Roster title="Judges" people={EVENT.judges} />
        <Roster title="Mentors" people={EVENT.mentors} />
      </div>
    </section>
  )
}
