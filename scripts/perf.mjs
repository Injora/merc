#!/usr/bin/env node
/**
 * Frame-time profile of the film, per chapter, driven by real wheel input
 * (so Lenis, ScrollTrigger, R3F and the GPU all run as for a visitor).
 *
 *   npm run build && npx vite preview --port 5299 --strictPort &
 *   node scripts/perf.mjs [--base http://localhost:5299] [--label after] [--vp desktop|mobile]
 *
 * Measured at the display's real (vsync-capped) rate — never with
 * --disable-frame-rate-limit, where rAF decouples from what is drawn.
 * Only animation-frame ticks that issued WebGL draws or 2D drawImage calls count as frames:
 *   fps      rendered frames per second (60 = every vsync on a 60 Hz display)
 *   p95/max  interval between rendered frames (16.7 ms = on time; 33 = one dropped)
 *   dropped  rendered intervals longer than 20 ms
 *   js p95   main-thread time inside rAF callbacks per frame (the 120 Hz budget is 8.3 ms)
 * Writes perf/<label>-<vp>.json.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { chromium } from 'playwright'

const args = Object.fromEntries(
  process.argv
    .slice(2)
    .join(' ')
    .split('--')
    .filter(Boolean)
    .map((kv) => {
      const [k, ...v] = kv.trim().split(/\s+/)
      return [k, v.join(' ')]
    }),
)
const base = args.base || 'http://localhost:5299'
const label = args.label || 'run'
const vpName = args.vp || 'desktop'
const VP = { desktop: { width: 1440, height: 900 }, mobile: { width: 390, height: 844 } }

const CHAPTERS = [
  ['star', 2, 7],
  ['assembly', 8, 15],
  ['reveal', 16, 28],
  ['first light', 30, 37],
  ['childhood', 37.5, 44],
  ['teenage', 44.5, 51],
  ['the keys', 51, 65],
  ['together', 65.5, 73],
  ['full circle', 73.5, 80],
  ['the future', 81, 93],
]

const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--headless=new', '--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] })
const page = await browser.newPage({ viewport: VP[vpName], deviceScaleFactor: vpName === 'mobile' ? 3 : 2, isMobile: vpName === 'mobile', hasTouch: vpName === 'mobile' })

// instrumentation: WebGL draw counter + per-tick rAF callback time
await page.addInitScript(() => {
  let draws = 0
  for (const C of [WebGL2RenderingContext, WebGLRenderingContext]) {
    for (const fn of ['drawElements', 'drawArrays', 'drawElementsInstanced', 'drawArraysInstanced']) {
      const orig = C.prototype[fn]
      if (orig)
        C.prototype[fn] = function (...a) {
          draws++
          return orig.apply(this, a)
        }
    }
  }
  // the photographed chapters draw on a 2D canvas (WebGL sleeps under them): count those too
  const drawImage = CanvasRenderingContext2D.prototype.drawImage
  CanvasRenderingContext2D.prototype.drawImage = function (...a) {
    draws++
    return drawImage.apply(this, a)
  }
  const ticks = new Map() // rAF timestamp → { work, draws0 }
  window.__ticks = []
  const raf = window.requestAnimationFrame.bind(window)
  window.requestAnimationFrame = (cb) =>
    raf((ts) => {
      let t = ticks.get(ts)
      if (!t) {
        t = { ts, work: 0, draws0: draws, draws: 0 }
        ticks.set(ts, t)
        // close the tick after all its callbacks have run
        setTimeout(() => {
          t.draws = draws - t.draws0
          window.__ticks.push(t)
          ticks.delete(ts)
        }, 0)
      }
      const t0 = performance.now()
      cb(ts)
      t.work += performance.now() - t0
    })
})

await page.goto(base, { waitUntil: 'load' })
await page.waitForFunction(() => !document.querySelector('.ignition-hit')?.hasAttribute('disabled'), null, { timeout: 90_000 })
await page.waitForTimeout(2500)
await page.click('.ignition-hit')
await page.waitForFunction(() => !document.documentElement.classList.contains('scroll-locked'), null, { timeout: 30_000 })
await page.waitForTimeout(800)

const unitY = (u) =>
  page.evaluate((u) => {
    const s = document.querySelector('.story')
    const top = s.getBoundingClientRect().top + window.scrollY
    return top + (s.offsetHeight - window.innerHeight) * (u / 100)
  }, u)

const pct = (a, p) => a[Math.min(a.length - 1, Math.floor(a.length * p))]
const results = []
for (const [name, from, to] of CHAPTERS) {
  const y0 = await unitY(from)
  const y1 = await unitY(to)
  await page.evaluate((y) => window.scrollTo(0, y), y0)
  await page.waitForTimeout(1200)
  await page.mouse.move(VP[vpName].width / 2, VP[vpName].height / 2)
  await page.evaluate(() => (window.__ticks = []))
  const steps = Math.max(20, Math.round((y1 - y0) / 80))
  for (let i = 0; i < steps; i++) {
    await page.mouse.wheel(0, (y1 - y0) / steps)
    await page.waitForTimeout(50)
  }
  await page.waitForTimeout(600)
  const ticks = await page.evaluate(() => window.__ticks.slice())
  const frames = ticks.filter((t) => t.draws > 0).sort((a, b) => a.ts - b.ts)
  const intervals = []
  for (let i = 1; i < frames.length; i++) intervals.push(frames[i].ts - frames[i - 1].ts)
  const span = (frames.at(-1).ts - frames[0].ts) / 1000
  const iv = intervals.slice().sort((a, b) => a - b)
  const work = frames.map((f) => f.work).sort((a, b) => a - b)
  const r = {
    chapter: name,
    fps: +((frames.length - 1) / span).toFixed(1),
    p95: +pct(iv, 0.95).toFixed(1),
    max: +iv.at(-1).toFixed(1),
    dropped: iv.filter((x) => x > 20).length,
    frames: frames.length,
    jsP95: +pct(work, 0.95).toFixed(2),
    jsMax: +work.at(-1).toFixed(1),
  }
  results.push(r)
  console.log(
    `${name.padEnd(12)} fps ${String(r.fps).padStart(5)}   p95 ${String(r.p95).padStart(5)} ms   max ${String(r.max).padStart(6)} ms   dropped ${r.dropped}/${r.frames}   js p95 ${r.jsP95} ms (max ${r.jsMax})`,
  )
}
mkdirSync('perf', { recursive: true })
writeFileSync(`perf/${label}-${vpName}.json`, JSON.stringify(results, null, 2))
await browser.close()
