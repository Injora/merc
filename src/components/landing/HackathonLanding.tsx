import { EventOverview } from './EventOverview'
import { Eligibility } from './Eligibility'
import { FAQ } from './FAQ'
import { Footer } from './Footer'
import { People } from './People'
import { Prizes } from './Prizes'
import { RegistrationCTA } from './RegistrationCTA'
import { Schedule } from './Schedule'
import { Tracks } from './Tracks'

/** The destination: every word comes from src/config/event.ts. */
export function HackathonLanding() {
  return (
    <main className="landing" id="event" tabIndex={-1}>
      <EventOverview />
      <Tracks />
      <Eligibility />
      <Prizes />
      <Schedule />
      <People />
      <FAQ />
      <RegistrationCTA />
      <Footer />
    </main>
  )
}
