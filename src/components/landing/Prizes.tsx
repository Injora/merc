import { EVENT } from '../../config/event'
import { Info } from '../ui/Info'
import { SectionHeader } from './SectionHeader'

export function Prizes() {
  return (
    <section className="section" id="prizes" aria-labelledby="prizes-title">
      <SectionHeader id="prizes-title" index="04" label="Prizes" title="What awaits at the finish." />
      <ol className="prizes">
        {EVENT.prizes.map((p) => (
          <li key={p.rank} className="prize">
            <span className="prize-rank" aria-hidden>
              {p.rank}
            </span>
            <div>
              <Info as="h3" className="prize-title" c={p.title} />
              <Info as="p" className="prize-detail" c={p.detail} />
            </div>
          </li>
        ))}
      </ol>
    </section>
  )
}
