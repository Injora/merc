/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  EVENT CONTENT — the single source of truth for every piece of event copy.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *  Edit this file to publish real event details. Nothing in the cinematic
 *  animation code needs to change.
 *
 *  Every value is wrapped in either:
 *    tba("…")        → placeholder. Rendered with a dotted underline and a
 *                      "TBA" marker so visitors never mistake it for fact.
 *    confirmed("…")  → approved, final information. Rendered normally.
 *
 *  When a detail is approved, change `tba(...)` to `confirmed(...)`.
 *  Do not invent dates, prizes, judges, rules, or sponsor claims.
 */

export type Content = {
  text: string
  confirmed: boolean
}

export const tba = (text: string): Content => ({ text, confirmed: false })
export const confirmed = (text: string): Content => ({ text, confirmed: true })

export type Track = { code: string; title: Content; summary: Content }
export type Prize = { rank: string; title: Content; detail: Content }
export type Person = { name: Content; role: Content; org: Content }
export type ScheduleItem = { time: Content; title: Content; detail: Content }
export type FaqItem = { q: string; a: Content }
export type Link = { label: string; href: string; confirmed: boolean }

export const EVENT = {
  name: tba('[HACKATHON NAME]'),
  tagline: tba('[One-line event tagline]'),

  organizer: {
    short: confirmed('NST-SDC'),
    full: confirmed('Newton School of Technology Student Developer Community'),
  },

  /** Use the exact wording approved by the sponsor if it differs. */
  sponsor: {
    name: confirmed('Mercedes-Benz'),
    acknowledgement: confirmed('With sponsorship support from Mercedes-Benz.'),
  },

  closing: {
    headline: confirmed('Every great journey begins with an idea.'),
    support: confirmed('Every generation moves the world forward. Now it’s your turn.'),
  },

  description: tba(
    '[Event description — what participants will build, who it is for, and what makes this hackathon distinct. Two or three sentences.]',
  ),

  facts: {
    dates: tba('[Event dates]'),
    venue: tba('[Venue / campus / online]'),
    format: tba('[Format — e.g. in-person, hybrid, duration]'),
    teamSize: tba('[Team size]'),
    deadline: tba('[Registration deadline]'),
  },

  registration: {
    /**
     * PLACEHOLDER URL. Replace with the real registration form (Devfolio,
     * Unstop, Google Form, etc.) and set `confirmed: true`.
     */
    url: 'https://example.com/register-placeholder',
    confirmed: false,
    label: 'Register now',
  },

  eligibility: [
    tba('[Who can participate — e.g. student status, institutions, year of study]'),
    tba('[Team composition rules]'),
    tba('[Required documents or ID at check-in]'),
    tba('[Code of conduct link / acceptance]'),
  ],

  tracks: [
    { code: 'T—01', title: tba('[Track / problem statement 01]'), summary: tba('[Short description of the challenge and expected outcome]') },
    { code: 'T—02', title: tba('[Track / problem statement 02]'), summary: tba('[Short description of the challenge and expected outcome]') },
    { code: 'T—03', title: tba('[Track / problem statement 03]'), summary: tba('[Short description of the challenge and expected outcome]') },
    { code: 'T—04', title: tba('[Open innovation / wildcard track]'), summary: tba('[Short description of the challenge and expected outcome]') },
  ] satisfies Track[],

  prizes: [
    { rank: '01', title: tba('[First prize]'), detail: tba('[Prize details]') },
    { rank: '02', title: tba('[Second prize]'), detail: tba('[Prize details]') },
    { rank: '03', title: tba('[Third prize]'), detail: tba('[Prize details]') },
    { rank: '✦', title: tba('[Special / track prizes]'), detail: tba('[Prize details]') },
  ] satisfies Prize[],

  judges: [
    { name: tba('[Judge name]'), role: tba('[Role]'), org: tba('[Organisation]') },
    { name: tba('[Judge name]'), role: tba('[Role]'), org: tba('[Organisation]') },
    { name: tba('[Judge name]'), role: tba('[Role]'), org: tba('[Organisation]') },
  ] satisfies Person[],

  mentors: [
    { name: tba('[Mentor name]'), role: tba('[Role]'), org: tba('[Organisation]') },
    { name: tba('[Mentor name]'), role: tba('[Role]'), org: tba('[Organisation]') },
    { name: tba('[Mentor name]'), role: tba('[Role]'), org: tba('[Organisation]') },
    { name: tba('[Mentor name]'), role: tba('[Role]'), org: tba('[Organisation]') },
  ] satisfies Person[],

  schedule: [
    { time: tba('[Date · time]'), title: tba('Registrations open'), detail: tba('[Details]') },
    { time: tba('[Date · time]'), title: tba('Registrations close'), detail: tba('[Details]') },
    { time: tba('[Date · time]'), title: tba('Opening ceremony'), detail: tba('[Details]') },
    { time: tba('[Date · time]'), title: tba('Hacking begins'), detail: tba('[Details]') },
    { time: tba('[Date · time]'), title: tba('Mentor checkpoints'), detail: tba('[Details]') },
    { time: tba('[Date · time]'), title: tba('Final submissions'), detail: tba('[Details]') },
    { time: tba('[Date · time]'), title: tba('Demos, judging & awards'), detail: tba('[Details]') },
  ] satisfies ScheduleItem[],

  faq: [
    { q: 'Who can participate?', a: tba('[Eligibility answer — to be confirmed by the organisers.]') },
    { q: 'How large can a team be?', a: tba('[Team size answer — to be confirmed by the organisers.]') },
    { q: 'Is there a registration fee?', a: tba('[Fee answer — to be confirmed by the organisers.]') },
    { q: 'What should I bring?', a: tba('[Checklist — laptop, charger, ID, etc. — to be confirmed.]') },
    { q: 'Will food and accommodation be provided?', a: tba('[Logistics answer — to be confirmed by the organisers.]') },
    { q: 'How do I register?', a: confirmed('Use the Register button on this page. It will always point to the official registration form once it is published.') },
    { q: 'Who do I contact with questions?', a: tba('[Contact channel — email / community link — to be confirmed.]') },
  ] satisfies FaqItem[],

  contact: {
    email: tba('[contact@example.com]'),
    socials: [
      { label: 'Instagram', href: '#', confirmed: false },
      { label: 'LinkedIn', href: '#', confirmed: false },
      { label: 'X / Twitter', href: '#', confirmed: false },
      { label: 'Community', href: '#', confirmed: false },
    ] satisfies Link[],
  },

  legal: {
    trademark: confirmed(
      'Mercedes-Benz and the three-pointed star are trademarks of Mercedes-Benz Group AG. This is an NST-SDC student event website and is not operated by Mercedes-Benz.',
    ),
  },
} as const
