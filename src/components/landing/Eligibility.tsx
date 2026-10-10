import { EVENT } from '../../config/event'
import { Info } from '../ui/Info'
import { SectionHeader } from './SectionHeader'

export function Eligibility() {
  return (
    <section className="section" id="eligibility" aria-labelledby="eligibility-title">
      <SectionHeader id="eligibility-title" index="03" label="Eligibility & participation" title="Who can take the wheel." />
      <ul className="rules">
        {EVENT.eligibility.map((e, i) => (
          <li key={i}>
            <span className="rules-n">{String(i + 1).padStart(2, '0')}</span>
            <Info c={e} />
          </li>
        ))}
      </ul>
    </section>
  )
}
