import { ArrowUpRight } from 'lucide-react'
import { EVENT } from '../../config/event'
import { Info } from '../ui/Info'

export function RegistrationCTA() {
  return (
    <section className="register" id="register" aria-labelledby="register-title">
      <div className="register-inner">
        <p className="section-label">
          <span className="section-index">08</span>
          <span>Registration</span>
        </p>
        <h2 id="register-title" className="register-title">
          Now it’s your turn.
        </h2>
        <p className="register-deadline">
          Registration closes <Info c={EVENT.facts.deadline} />
        </p>
        <a className="btn btn-primary btn-large" href={EVENT.registration.url} target="_blank" rel="noopener noreferrer">
          <span>{EVENT.registration.label}</span>
          <ArrowUpRight size={20} strokeWidth={1.5} aria-hidden />
        </a>
        {!EVENT.registration.confirmed && (
          <p className="register-note">
            The registration link is a placeholder (<code>{EVENT.registration.url}</code>) until the official form is published.
          </p>
        )}
      </div>
    </section>
  )
}
