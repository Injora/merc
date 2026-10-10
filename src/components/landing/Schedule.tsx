import { EVENT } from '../../config/event'
import { Info } from '../ui/Info'
import { SectionHeader } from './SectionHeader'

export function Schedule() {
  return (
    <section className="section" id="schedule" aria-labelledby="schedule-title">
      <SectionHeader id="schedule-title" index="05" label="Schedule" title="The route." />
      <ol className="schedule">
        {EVENT.schedule.map((s, i) => (
          <li key={i} className="stop">
            <span className="stop-dot" aria-hidden />
            <Info className="stop-time" c={s.time} />
            <Info as="h3" className="stop-title" c={s.title} />
            <Info as="p" className="stop-detail" c={s.detail} />
          </li>
        ))}
      </ol>
    </section>
  )
}
