import { EVENT } from '../../config/event'
import { Info } from '../ui/Info'
import { SectionHeader } from './SectionHeader'

export function Tracks() {
  return (
    <section className="section" id="tracks" aria-labelledby="tracks-title">
      <SectionHeader id="tracks-title" index="02" label="Tracks & problem statements" title="Choose your road." />
      <ol className="tracks">
        {EVENT.tracks.map((t) => (
          <li key={t.code} className="track">
            <span className="track-code">{t.code}</span>
            <Info as="h3" className="track-title" c={t.title} />
            <Info as="p" className="track-summary" c={t.summary} />
          </li>
        ))}
      </ol>
    </section>
  )
}
