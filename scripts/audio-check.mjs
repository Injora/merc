#!/usr/bin/env node
/**
 * Audio verification (production preview): taps the page's audio output and logs
 * its level (RMS / peak, dBFS) every 250 ms from the START ENGINE click, then while
 * scrolling through the film, to the hackathon title (music should fade out), the event
 * page, and back up into the film (music should return).
 *   node scripts/audio-check.mjs [--base http://localhost:5299]
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { chromium } from 'playwright'
const args = Object.fromEntries(process.argv.slice(2).join(' ').split('--').filter(Boolean).map((kv) => { const [k, ...v] = kv.trim().split(/\s+/); return [k, v.join(' ')] }))
const base = args.base || 'http://localhost:5299'
mkdirSync('shots/audio', { recursive: true })
const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--headless=new', '--autoplay-policy=no-user-gesture-required'] })
const p = await b.newPage({ viewport: { width: 1440, height: 900 } })
const errors = []
p.on('pageerror', (e) => errors.push(String(e)))
p.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
await p.addInitScript(() => {
  const orig = AudioNode.prototype.connect
  AudioNode.prototype.connect = function (dest, ...rest) {
    if (dest && dest === this.context.destination && !this.context.__tap) {
      const a = this.context.createAnalyser()
      a.fftSize = 2048
      this.context.__tap = a
      window.__tap = a
      orig.call(this, a)
    }
    return orig.call(this, dest, ...rest)
  }
})
await p.goto(base, { waitUntil: 'load' })
await p.waitForFunction(() => !document.querySelector('.ignition-hit')?.hasAttribute('disabled'), null, { timeout: 90000 })
await p.waitForTimeout(1200)
await p.click('.ignition-hit')
const sample = () => p.evaluate(() => {
  const a = window.__tap
  if (!a) return null
  const d = new Float32Array(a.fftSize)
  a.getFloatTimeDomainData(d)
  let s = 0, pk = 0
  for (const x of d) { s += x * x; pk = Math.max(pk, Math.abs(x)) }
  const db = (v) => (v > 0 ? +(20 * Math.log10(v)).toFixed(1) : -Infinity)
  return { rms: db(Math.sqrt(s / d.length)), peak: db(pk), state: a.context.state }
})
const log = []
const t0 = Date.now()
for (let i = 0; i < 56; i++) { log.push({ t: +((Date.now() - t0) / 1000).toFixed(2), ...(await sample()) }); await p.waitForTimeout(250) }
// into the film (finale = most intense) and then the event page
const unitY = (u) => p.evaluate((u) => { const s = document.querySelector('.story'); return s.getBoundingClientRect().top + scrollY + (s.offsetHeight - innerHeight) * u / 100 }, u)
for (const [label, y] of [['film u50', await unitY(50)], ['film u94', await unitY(94)], ['title u97.5', await unitY(97.5)], ['event page', (await unitY(100)) + 2500], ['back u70', await unitY(70)]]) {
  await p.evaluate((y) => window.scrollTo(0, y), y)
  await p.waitForTimeout(5000)
  const r = []
  for (let i = 0; i < 8; i++) { r.push(await sample()); await p.waitForTimeout(250) }
  log.push({ t: label, rms: Math.max(...r.map((x) => x.rms)), peak: Math.max(...r.map((x) => x.peak)) })
}
writeFileSync('shots/audio/levels.json', JSON.stringify({ log, errors }, null, 1))
for (const l of log) console.log(String(l.t).padEnd(11), 'rms', String(l.rms).padStart(6), 'dBFS  peak', String(l.peak).padStart(6))
if (errors.length) console.log('errors', errors)

await b.close()
