#!/usr/bin/env node
/**
 * 60-second continuous scroll trace of the whole film (production preview).
 *
 *   npm run build && npx vite preview --port 5299 --strictPort &
 *   node scripts/trace60.mjs --label before [--vp desktop|mobile] [--base http://localhost:5299]
 *
 * Same conditions every run: real ignition, then wheel input paced by the wall clock
 * from story unit 0 to 100 over exactly 60 s, at the display's vsync-capped rate. Every animation
 * frame that issued WebGL draws or 2D canvas drawImage calls is a rendered frame; each is tagged with the story
 * unit at that moment. Reports per unit band: fps, p95 / max frame interval,
 * dropped frames (>20 ms interval) and main-thread rAF work.
 * Writes perf/trace60-<label>-<vp>.json and a Chrome trace perf/trace60-<label>-<vp>.trace.json
 * (open in chrome://tracing or the DevTools Performance panel).
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
// unit bands (the chapter rail's ranges; see src/config/story.ts)
const BANDS = (args.bands || '0-8,8-16,16-30,30-40,40-51,51-62,62-72,72-80,80-94,94-100').split(',').map((b) => b.split('-').map(Number))

mkdirSync('perf', { recursive: true })
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--headless=new', '--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] })
const page = await browser.newPage({ viewport: VP[vpName], deviceScaleFactor: vpName === 'mobile' ? 3 : 2, isMobile: vpName === 'mobile', hasTouch: vpName === 'mobile' })
const errors = []
page.on('pageerror', (e) => errors.push(String(e)))
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))

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
  const unit = () => {
    const s = document.querySelector('.story')
    if (!s) return -1
    const top = s.getBoundingClientRect().top + window.scrollY
    return ((window.scrollY - top) / (s.offsetHeight - window.innerHeight)) * 100
  }
  const ticks = new Map()
  window.__ticks = []
  const raf = window.requestAnimationFrame.bind(window)
  window.requestAnimationFrame = (cb) =>
    raf((ts) => {
      let t = ticks.get(ts)
      if (!t) {
        t = { ts, work: 0, draws0: draws, draws: 0, u: 0 }
        ticks.set(ts, t)
        setTimeout(() => {
          t.draws = draws - t.draws0
          t.u = unit()
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
await page.waitForTimeout(2500) // the post-ignition sweep finishes

const unitY = (u) =>
  page.evaluate((u) => {
    const s = document.querySelector('.story')
    const top = s.getBoundingClientRect().top + window.scrollY
    return top + (s.offsetHeight - window.innerHeight) * (u / 100)
  }, u)
const y0 = await unitY(0)
const y1 = await unitY(100)
await page.evaluate((y) => window.scrollTo(0, y), y0)
await page.waitForTimeout(1200)
await page.mouse.move(VP[vpName].width / 2, VP[vpName].height / 2)

await browser.startTracing(page, { path: `perf/trace60-${label}-${vpName}.trace.json`, screenshots: false, categories: ['devtools.timeline', 'disabled-by-default-devtools.timeline.frame', 'blink', 'gpu', 'v8.execute'] })
await page.evaluate(() => (window.__ticks = []))
// wall-clock paced: the wanted position moves linearly from unit 0 to 100 over 60 s and
// wheel deltas chase it (a steady reader, independent of Playwright round-trip time)
const DURATION = 60_000
const tStart = Date.now()
for (;;) {
  const k = Math.min(1, (Date.now() - tStart) / DURATION)
  const want = y0 + (y1 - y0) * k
  const at = await page.evaluate(() => window.scrollY)
  const delta = Math.max(0, Math.min(600, (want - at) * 1.15))
  if (delta > 0.5) await page.mouse.wheel(0, delta)
  if (k >= 1) break
  await page.waitForTimeout(60)
}
await page.waitForTimeout(2000)
const ticks = await page.evaluate(() => window.__ticks.slice())
await browser.stopTracing()
await browser.close()

const frames = ticks.filter((t) => t.draws > 0).sort((a, b) => a.ts - b.ts)
const pct = (a, p) => (a.length ? a[Math.min(a.length - 1, Math.floor(a.length * p))] : 0)
const summarise = (fr, name) => {
  const iv = []
  for (let i = 1; i < fr.length; i++) iv.push(fr[i].ts - fr[i - 1].ts)
  const sorted = iv.slice().sort((a, b) => a - b)
  const work = fr.map((f) => f.work).sort((a, b) => a - b)
  const span = fr.length > 1 ? (fr.at(-1).ts - fr[0].ts) / 1000 : 0
  return {
    band: name,
    frames: fr.length,
    seconds: +span.toFixed(1),
    fps: span ? +((fr.length - 1) / span).toFixed(1) : 0,
    p95: +pct(sorted, 0.95).toFixed(1),
    max: +(sorted.at(-1) ?? 0).toFixed(1),
    dropped: sorted.filter((x) => x > 20).length,
    jsP95: +pct(work, 0.95).toFixed(2),
    jsMax: +(work.at(-1) ?? 0).toFixed(1),
  }
}
// bands: consecutive runs of frames inside [from, to) (intervals across a band edge count for the later band)
const bands = BANDS.map(([a, b]) => summarise(frames.filter((f) => f.u >= a && f.u < (b === 100 ? 100.01 : b)), `${a}-${b}`))
const total = summarise(frames, 'total')
const report = { label, vp: vpName, viewport: VP[vpName], date: new Date().toISOString(), total, bands, errors: [...new Set(errors)] }
writeFileSync(`perf/trace60-${label}-${vpName}.json`, JSON.stringify({ ...report, frames: frames.map((f) => [+f.ts.toFixed(2), +f.u.toFixed(2), +f.work.toFixed(2)]) }))
const row = (r) =>
  `${r.band.padEnd(8)} fps ${String(r.fps).padStart(5)}  p95 ${String(r.p95).padStart(5)} ms  max ${String(r.max).padStart(6)} ms  dropped ${String(r.dropped).padStart(3)}/${String(r.frames).padEnd(5)} js p95 ${r.jsP95} ms (max ${r.jsMax})`
console.log(row(total))
bands.forEach((b) => console.log(row(b)))
if (report.errors.length) console.log('errors:', report.errors.slice(0, 10))
console.log(`wrote perf/trace60-${label}-${vpName}.json and .trace.json`)
