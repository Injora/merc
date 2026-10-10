import { ASSETS } from '../../config/assets'
import { EVENT } from '../../config/event'
import { Info, StarMark } from '../ui/Info'

export function Footer() {
  return (
    <footer className="footer">
      <div className="footer-top">
        <div className="footer-brand">
          <p className="footer-org">{EVENT.organizer.short.text}</p>
          <p className="footer-org-full">{EVENT.organizer.full.text}</p>
        </div>
        <div className="footer-sponsor">
          <StarMark size={40} />
          <p>{EVENT.sponsor.acknowledgement.text}</p>
        </div>
      </div>
      <div className="footer-grid">
        <div>
          <h3>Contact</h3>
          <p>
            <Info c={EVENT.contact.email} />
          </p>
        </div>
        <div>
          <h3>Follow</h3>
          <ul className="footer-links">
            {EVENT.contact.socials.map((s) => (
              <li key={s.label}>
                {s.confirmed ? (
                  <a href={s.href} target="_blank" rel="noopener noreferrer">
                    {s.label}
                  </a>
                ) : (
                  <span className="tba" title="Link to be confirmed">
                    {s.label}
                    <span className="tba-badge">TBA</span>
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h3>Legend</h3>
          <p className="footer-legend">
            <span className="tba">
              Dotted<span className="tba-badge">TBA</span>
            </span>{' '}
            marks details awaiting confirmation.
          </p>
        </div>
      </div>
      <p className="footer-legal">{EVENT.legal.trademark.text}</p>
      <details className="footer-credits">
        <summary>Model and texture credits</summary>
        <ul>
          {CREDITS.map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ul>
      </details>
    </footer>
  )
}

/** credit lines from the asset manifest */
const CREDITS = [ASSETS.models.car.credit, 'Studio HDRI and floor textures: Poly Haven, CC0', 'Every other visual is rendered in real time.']
