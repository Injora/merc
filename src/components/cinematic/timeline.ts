import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { CAPTIONS } from '../../config/story'
import { DEV_NOSMOOTH } from '../../lib/device'
import { S } from '../../lib/state'

/**
 * THE MASTER TIMELINE
 *
 * One paused GSAP timeline, 100 units long, scrubbed by a single ScrollTrigger
 * across the sticky story section. Camera, lighting, every real-time scene,
 * world speed and every caption live on this one timeline, so they
 * can never drift apart — and scrolling back up plays it all in reverse.
 *
 * Shot list (story units):
 *   0–8     the star turns, its components separate
 *   8–16    fragments stream onto the surface of the car
 *   16–27   the machine: close-ups, the hero frame; a scan reveals what lies beneath (callouts)
 *   27–40   the digital twin: geometry (feature edges), data (nodes, directed streams), the twin (ghost paint)
 *   40–50   computer science: data structures (a voxel map), algorithms (a graph search, the shortest path)
 *   50–61   machine learning: raw signals → features (k-means) → a layered model → a prediction
 *   61–69   computer vision: a sensor sweep, objects, an occupancy map, a path
 *   69–76   optimization: candidates scored by a cost over the scene; the chosen one smooths
 *   76–82   AI systems: sensing → perception → prediction → planning → control
 *   82–91   the tenfold idea: connections branch out; the car returns, with its traces
 *   91–100  the grid, its nodes connecting; the hackathon resolves on screen
 */

export type TimelineDom = {
  dip: HTMLElement
  /** the line of light that opens into the title */
  line: HTMLElement | null
  captions: Map<string, HTMLElement>
  hero: HTMLElement
  cue: HTMLElement | null
}

type Cam = Partial<typeof S.cam>

export let storyTrigger: ScrollTrigger | null = null
export let storyTimeline: gsap.core.Timeline | null = null

/** Scroll position (px) of a story unit — used by the chapter rail. */
export function unitToScroll(unit: number) {
  if (!storyTrigger) return 0
  return storyTrigger.start + (storyTrigger.end - storyTrigger.start) * (unit / 100)
}

export function buildStoryTimeline(trigger: HTMLElement, dom: TimelineDom, opts: { mobile: boolean }) {
  const tl = gsap.timeline({ paused: true, defaults: { ease: 'none' } })
  const m = opts.mobile

  const cam = (at: number, dur: number, to: Cam, ease = 'power2.inOut') => tl.to(S.cam, { ...to, duration: dur, ease }, at)
  const to = (at: number, dur: number, vars: gsap.TweenVars, ease = 'power1.inOut') => tl.to(S, { ...vars, duration: dur, ease }, at)
  const set = (at: number, vars: gsap.TweenVars) => tl.set(S, vars, at)
  const setCam = (at: number, vars: Cam) => tl.set(S.cam, vars, at)
  const tech = (at: number, dur: number, vars: Partial<typeof S.tech>, ease = 'power1.inOut') => tl.to(S.tech, { ...vars, duration: dur, ease }, at)
  const setTech = (at: number, vars: Partial<typeof S.tech>) => tl.set(S.tech, vars, at)
  /** A dip to black; everything inside `cut` happens at full black, which can be held a little (`hold`). */
  const dip = (at: number, cut: () => void, len = 0.5, hold = 0) => {
    tl.to(S, { dip: 1, duration: len, ease: 'power2.in' }, at - len)
    cut()
    tl.to(S, { dip: 0, duration: len * 1.3, ease: 'power2.out' }, at + hold)
  }

  /* ── 0–8 · THE STAR ───────────────────────────────────────────── */
  cam(0, 3, { pz: 3.25 }, 'power1.inOut')
  to(0, 8.5, { starTurn: 1.9 }, 'power2.inOut')
  to(3, 5.5, { starSplit: 1 }, 'power2.inOut')
  cam(3, 5, { px: 1.0, py: 1.32, pz: 3.5, ty: 1.1 })

  /* ── 8–15.5 · THE TRANSFORMATION ──────────────────────────────── */
  to(7.6, 8, { shards: 1 }, 'power1.inOut')
  cam(8, 7.5, { px: 3.7, py: 2.05, pz: m ? 7.6 : 6.4, tx: 0, ty: 0.72, tz: 0, fov: 32 })
  to(8, 7, { keyLight: 0.6 })

  /* ── 15.5–21 · THE MACHINE: CLOSE-UPS ────────────────────────── */
  dip(16, () => setCam(16, { px: 1.72, py: 0.84, pz: -3.62, tx: 0.42, ty: 0.7, tz: -2.3, fov: 28 }), 0.4)
  cam(16, 2.6, { px: 1.5, py: 0.8, pz: -3.3 }, 'power1.out')
  to(16.5, 1.2, { headlights: 1 }, 'power2.in')
  dip(18.7, () => setCam(18.7, { px: 2.25, py: 0.96, pz: -1.4, tx: 0.8, ty: 0.86, tz: -0.4, fov: 30 }), 0.35)
  cam(18.7, 3, { px: 2.3, py: 1.04, pz: 1.5, tx: 0.82, ty: 0.86, tz: 2.1 }, 'power1.inOut')
  to(18.7, 3, { sweep: 1 }, 'power1.inOut')
  tech(16.4, 2.5, { grid: 1 })

  /* ── 21–27 · ENGINEERED TO MOVE. READY TO THINK. ─────────────────
     The hero frame. One scanning beam crosses the bodywork; as it passes
     each point, a callout names what lies beneath: sensing, perception,
     prediction, optimisation, decision systems — then lets it go. */
  const hero = { px: m ? 6.6 : 5.4, py: 1.5, pz: m ? -7.2 : -5.6, tx: 0, ty: 0.62, tz: 0, fov: 30 }
  cam(21.5, 5, hero)
  to(21.5, 4, { keyLight: 1 })
  setTech(22.8, { scan: -1.3, labels: 1 })
  tech(22.8, 0.5, { scanOn: 1 })
  tech(22.8, 3.8, { scan: 1.3 }, 'power1.inOut')
  tech(26.4, 0.5, { scanOn: 0 })
  tech(26.6, 1, { labels: 0 })

  /* ── 27–40 · THE DIGITAL TWIN ────────────────────────────────────
     A · GEOMETRY: side profile; behind the gate the paint dissolves into the
         model's own feature edges.
     B · DATA: structural nodes; directed streams flow between them.
     C · THE TWIN: the paint returns as a ghost — physical vehicle,
         computational representation and the information in it, together. */
  const side = { px: m ? 9.6 : 7.8, py: 1.18, pz: 0.25, tx: 0, ty: 1.02, tz: 0.1, fov: 30 }
  cam(27.2, 2.6, side, 'power2.inOut')
  to(27.2, 2.4, { keyLight: 0.55, headlights: 0 })
  setTech(29.2, { scan: -1.25, edges: 1 })
  tech(29.2, 0.5, { scanOn: 1, xray: 1 })
  tech(29.2, 5.2, { scan: 1.25 }, 'power1.inOut')
  tech(34.2, 0.5, { scanOn: 0 })
  tech(34.2, 2.2, { nodes: 1 })
  tech(35.2, 2.2, { stream: 1, edges: 0.5 })
  // C: the ghost of the paint returns while the twin and its data stay
  tech(37.2, 1.4, { xray: 0.74 })
  cam(37, 3, { px: m ? 6.6 : 5.6, py: 2.4, pz: m ? -6.2 : -5.2, tx: 0, ty: 0.7, tz: 0, fov: 31 })
  tech(39.4, 1, { xray: 1 })

  /* ── 40–50 · COMPUTER SCIENCE ────────────────────────────────────
     DATA STRUCTURES: the samples snap into an ordered spatial map of the car.
     ALGORITHMS: a search crosses the car's structural graph — explored edges
     dim, and the shortest path from nose to tail lights. */
  tech(40, 1.4, { stream: 0, points: 1, edges: 0.28 })
  tech(41.6, 2.6, { voxel: 1 }, 'power2.inOut')
  to(40.5, 2, { keyLight: 0 })
  tech(40.5, 2, { grid: 0 })
  set(43, { studio: 0 })
  tech(45.2, 0.8, { points: 0.25, edges: 0.18 })
  tech(45.4, 3, { search: 1 }, 'none')
  tech(48.2, 1.6, { solve: 1 })
  cam(41, 9, { px: m ? 7.0 : 5.9, py: 3.0, pz: m ? -5.2 : -4.2, tx: 0, ty: 0.6, tz: 0.2, fov: 32 }, 'power1.inOut')

  /* ── 50–61 · MACHINE LEARNING ────────────────────────────────────
     Raw signals (noisy samples) → features (k-means clusters) → a model that
     activates layer by layer and keeps its strong connections → a prediction
     projected ahead of the nose, with its uncertainty. */
  tech(50, 1.2, { search: 0, solve: 0, nodes: 0, voxel: 0, points: 1, edges: 0.55 })
  tech(50.4, 1.6, { raw: 1 })
  tech(52, 2.2, { raw: 0, cluster: 1 }, 'power2.inOut')
  tech(54.2, 3.8, { model: 1 }, 'none')
  tech(57.4, 1.6, { prune: 1 })
  tech(57.8, 1.2, { points: 0.35 })
  tech(58.6, 2.2, { predict: 1, fan: 1 }, 'power1.inOut')
  // side on: the car at left, the model on the road ahead, the prediction beyond — one reading direction
  // A rear three-quarter: the car large in the foreground, its features on its body, the model receding
  // ahead of the nose in depth — then a slow dolly across the chapter for parallax between car and data.
  cam(50, 3, m ? { px: 3.6, py: 3.4, pz: 8.6, tx: 0, ty: 1.05, tz: -2.4, fov: 44 } : { px: 6.6, py: 2.05, pz: 5.9, tx: 0, ty: 0.95, tz: -2.0, fov: 34 })
  cam(53, 5.2, m ? { px: 4.0, py: 3.6, pz: 7.8, tx: 0, ty: 1.1, tz: -2.9 } : { px: 7.3, py: 2.3, pz: 5.2, tx: 0, ty: 1.0, tz: -2.6 }, 'power1.inOut')
  cam(58.4, 2.6, { px: m ? 14 : 11.5, py: 6.2, pz: m ? -5 : -4.4, tx: 0.6, ty: 0.4, tz: -9.5, fov: 40 })

  /* ── 61–69 · COMPUTER VISION ─────────────────────────────────────
     A scene around the car appears as the sensor sweep turns; points resolve
     into objects; an occupancy map; then a path through the free space. */
  tech(61, 1.2, { model: 0, prune: 0, cluster: 0, points: 0, predict: 0, fan: 0, edges: 0.6 })
  tech(61.4, 0.8, { env: 1 })
  tech(61.6, 3, { sweep: 1 }, 'none')
  tech(64.6, 1.4, { resolve: 1 })
  tech(65.8, 1.6, { occ: 1 })
  tech(67.2, 1.8, { path: 1 }, 'power1.inOut')
  cam(61, 3, { px: m ? 6.8 : 5.6, py: m ? 13 : 10.5, pz: m ? 12 : 9.5, tx: 0, ty: 0, tz: -9, fov: 40 })

  /* ── 69–76 · OPTIMIZATION ────────────────────────────────────────
     Candidate trajectories, scored by a cost over the scene (its contours on
     the floor); the worst are discarded first; the chosen one loses its wobble
     while a marker travels it. */
  tech(69, 1, { path: 0, occ: 0.25 })
  tech(69.4, 1.2, { cands: 1, costField: 1 })
  tech(70.8, 3.2, { evaluate: 1 }, 'none')
  tech(72.2, 3.4, { opt: 1 }, 'power1.inOut')
  cam(69, 7, { px: m ? 8.8 : 7.6, py: m ? 14 : 11.5, pz: m ? 7 : 5.5, tx: 0.8, ty: 0, tz: -11, fov: 40 }, 'power1.inOut')

  /* ── 76–82 · AI SYSTEMS ──────────────────────────────────────────
     Sensors → sensing → perception → prediction → planning → control; each
     stage lights only when the signal reaches it; then the chosen trajectory. */
  tech(75.8, 1.4, { cands: 0, costField: 0, env: 0, occ: 0, resolve: 0, opt: 0, evaluate: 0, edges: 0.45 })
  tech(76.4, 1, { pipe: 1 })
  tech(76.8, 4.4, { signal: 1 }, 'none')
  tech(80.8, 1.4, { path: 1 })
  cam(75.8, 3, m ? { px: 15, py: 2.6, pz: -0.8, tx: 0, ty: 1.9, tz: -0.8, fov: 36 } : { px: 7.0, py: 3.0, pz: -3.6, tx: 0, ty: 1.55, tz: -1.2, fov: 36 })

  /* ── 82–91 · THE TENFOLD IDEA ────────────────────────────────────
     The system is not fixed: new connections branch out of the car. A reverse
     scan returns it to its physical form — with the traces left visible. */
  tech(81.8, 1.2, { pipe: 0, path: 0, signal: 0 })
  set(82, { studio: 1 })
  to(82, 2, { keyLight: 1 })
  setTech(82.2, { scan: 1.3 })
  tech(82.2, 0.5, { scanOn: 1 })
  tech(82.2, 3.2, { scan: -1.3 }, 'power1.inOut')
  tech(85.2, 0.6, { scanOn: 0, edges: 0.22, nodes: 0.5 })
  tech(83, 4.8, { net: 1 }, 'none')
  tech(87.4, 2, { netPulse: 1 })
  // the hero framing, with the car shifted right of centre on wide screens: the lower left stays free for the platform line
  cam(82, 3.4, m ? hero : { ...hero, tx: 0.9, tz: 0.85 })
  // the scan done, the camera rises and pulls back: the car settles into the lower third (looking above it),
  // opening the negative space the headline will occupy — settled by 87, before the headline peaks
  cam(85.4, 1.8, m ? { px: 11.2, py: 5.1, pz: -11.6, tx: 0, ty: 3.35, tz: 0, fov: 40 } : { px: 9.0, py: 4.0, pz: -9.2, tx: 0, ty: 2.75, tz: 0, fov: 34 }, 'power2.inOut')

  /* ── 91–96 · THE GRID: YOU ARE PART OF THE SYSTEM ────────────────
     The network reaches out into a vast grid; selected nodes light and
     connect as the camera travels through it; one pulse comes towards you. */
  dip(91, () => {
    set(91, { road: 1, studio: 0, sky: 1, speed: 8, digital: 0 })
    setTech(91, { net: 0, netPulse: 0, edges: 0, nodes: 0, xray: 0, scan: -1.3 })
    setCam(91, { px: 0, py: 1.7, pz: 14, tx: 0, ty: 1.6, tz: -40, fov: 44 })
  }, 0.5, 0.3)
  to(91.4, 6, { sky: 2 })
  to(91.6, 5.4, { digital: 1 }, 'power1.inOut')
  tech(91.8, 5.6, { gridNet: 1 }, 'none')
  cam(91.2, 6.6, { px: 0, py: 2.4, pz: -60, tx: 0, ty: 2.2, tz: -150, fov: 40 }, 'power1.inOut')
  tech(93, 4, { gridPulse: 1 }, 'power1.in')
  cam(96.6, 3.4, { px: 0, py: 3.8, pz: -68, tx: 0, ty: 3.6, tz: -160, fov: 42 })

  /* ── 96–100 · THE HACKATHON ───────────────────────────────────── */
  to(95.6, 3, { dim: 0.72 }, 'power1.inOut')
  // the grid's last line of light opens across the frame, and the title resolves out of it
  if (dom.line) {
    tl.fromTo(dom.line, { autoAlpha: 0, scaleX: 0 }, { autoAlpha: 1, scaleX: 1, duration: 1.4, ease: 'power3.inOut' }, 95.4)
    tl.to(dom.line, { autoAlpha: 0, duration: 0.7, ease: 'power2.in' }, 96.8)
  }
  tl.fromTo(dom.hero, { autoAlpha: 0, y: 30, filter: 'blur(8px)' }, { autoAlpha: 1, y: 0, filter: 'blur(0px)', duration: 3, ease: 'power2.out' }, 96.6)
  tl.set(dom.hero, { clearProps: 'filter' }, 99.7)

  /* ── captions ─────────────────────────────────────────────────── */
  for (const c of CAPTIONS) {
    const el = dom.captions.get(c.id)
    if (!el) continue
    const words = el.querySelectorAll<HTMLElement>('[data-word]')
    const kicker = el.querySelector<HTMLElement>('[data-kicker]')
    const inDur = Math.min(1.6, (c.to - c.from) * 0.28)
    tl.set(el, { autoAlpha: 1 }, c.from)
    if (kicker) tl.fromTo(kicker, { autoAlpha: 0, letterSpacing: '0.6em' }, { autoAlpha: 1, letterSpacing: '0.32em', duration: inDur, ease: 'power2.out' }, c.from)
    tl.fromTo(words, { autoAlpha: 0, yPercent: 40, filter: 'blur(10px)' }, { autoAlpha: 1, yPercent: 0, filter: 'blur(0px)', duration: inDur, stagger: inDur * 0.08, ease: 'power3.out' }, c.from + 0.2)
    tl.to(el, { autoAlpha: 0, y: -18, filter: 'blur(6px)', duration: inDur * 0.8, ease: 'power2.in' }, c.to - inDur * 0.8)
    tl.set(el, { y: 0, filter: 'blur(0px)' }, c.to + 0.01)
  }

  if (dom.cue) tl.to(dom.cue, { autoAlpha: 0, duration: 1.2 }, 0.2)

  // make the timeline exactly 100 units long
  tl.set({}, {}, 100)

  const dipStyle = dom.dip.style
  storyTrigger = ScrollTrigger.create({
    trigger,
    start: 'top top',
    end: 'bottom bottom',
    // numeric scrub: the timeline eases towards the scroll position rather than snapping to it
    scrub: DEV_NOSMOOTH ? true : 1,
    animation: tl,
    onUpdate: (self) => {
      S.progress = self.progress
    },
  })
  storyTimeline = tl
  // the dip overlay follows S.dip on every render of the timeline
  tl.eventCallback('onUpdate', () => {
    dipStyle.opacity = String(S.dip)
  })

  return () => {
    storyTrigger?.kill()
    storyTrigger = null
    storyTimeline = null
    tl.kill()
  }
}
