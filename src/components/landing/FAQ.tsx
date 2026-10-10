import { Plus } from 'lucide-react'
import { EVENT } from '../../config/event'
import { Info } from '../ui/Info'
import { SectionHeader } from './SectionHeader'

export function FAQ() {
  return (
    <section className="section" id="faq" aria-labelledby="faq-title">
      <SectionHeader id="faq-title" index="07" label="Questions" title="Before you set off." />
      <div className="faq">
        {EVENT.faq.map((f, i) => (
          <details key={i} className="faq-item">
            <summary>
              <span>{f.q}</span>
              <Plus className="faq-icon" size={20} strokeWidth={1.25} aria-hidden />
            </summary>
            <div className="faq-answer">
              <Info as="p" c={f.a} />
            </div>
          </details>
        ))}
      </div>
    </section>
  )
}
