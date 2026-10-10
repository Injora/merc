#!/usr/bin/env node
/**
 * Emblem stability verification against the production preview (?probe).
 *   node scripts/verify-emblem.mjs [--base http://localhost:5299] [--out shots/p2-emblem]
 *
 * Records every rendered frame's emblem transform + highlight (centre crop of the
 * drawing buffer) through the post-ignition sweep and the rest that follows, plus
 * a video of the same window. Reports, for 30 consecutive frames at rest and 30
 * during the sweep: transform drift, frame-to-frame rotation, highlight motion and
 * intensity changes, and frame intervals. Writes <out>/emblem-probe.json and
 * extracts 30 consecutive video frames to <out>/frames/.
 */
import { execFileSync } from 'node:child_process'
import { mkdirSync, readdirSync, renameSync, writeFileSync } from 'node:fs'
import { chromium } from 'playwright'

const args = Object.fromEntries(
  process.argv.slice(2).join(' ').split('--').filter(Boolean).map((kv) => {
    const [k, ...v] = kv.trim().split(/\s+/)
    return [k, v.join(' ')]
  }),
)
const base = args.base || 'http://localhost:5299'
const out = args.out || 'shots/p2-emblem'
mkdirSync(`${out}/frames`, { recursive: true })

const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--headless=new', '--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] })
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, recordVideo: { dir: `${out}/_video`, size: { width: 1440, height: 900 } } })
const page = await context.newPage()
await page.goto(`${base}/?probe`)
await page.waitForFunction(() => !document.querySelector('.ignition-hit')?.hasAttribute('disabled'), null, { timeout: 90_000 })
await page.waitForTimeout(1500)
await page.click('.ignition-hit')
await page.waitForFunction(() => !document.documentElement.classList.contains('scroll-locked'), null, { timeout: 30_000 })
const tUnlocked = await page.evaluate(() => performance.now())
await page.waitForTimeout(5500) // the post-settle sweep (2.6 s) and a few seconds of rest
const samples = await page.evaluate(() => window.__probe.samples.slice())
await context.close()
await browser.close()

const after = samples.filter((s) => s.t >= tUnlocked)
const stats = (a) => {
  const n = a.length
  const mean = a.reduce((x, y) => x + y, 0) / n
  const max = Math.max(...a)
  const min = Math.min(...a)
  return { min: +min.toFixed(5), max: +max.toFixed(5), range: +(max - min).toFixed(5), mean: +mean.toFixed(5) }
}
const window30 = (from) => after.slice(from, from + 30)
const analyse = (w, label) => {
  const d = (k) => w.slice(1).map((s, i) => s[k] - w[i][k])
  return {
    label,
    frames: w.length,
    frameIntervalMs: stats(w.slice(1).map((s, i) => s.t - w[i].t)),
    position: { x: stats(w.map((s) => s.px)), y: stats(w.map((s) => s.py)), z: stats(w.map((s) => s.pz)) },
    rotation: { x: stats(w.map((s) => s.rx)), y: stats(w.map((s) => s.ry)), z: stats(w.map((s) => s.rz)) },
    rotationStepY: stats(d('ry')),
    highlightX: stats(w.map((s) => s.hx)),
    highlightStepX: stats(d('hx')),
    highlightIntensity: stats(w.map((s) => s.hi)),
    highlightIntensityStep: stats(d('hi').map(Math.abs)),
    exposureMean: stats(w.map((s) => s.mean)),
    exposureStep: stats(d('mean').map(Math.abs)),
  }
}
// sweep: starts ~0.1 s after unlock; rest: the last 30 frames
const sweepStart = after.findIndex((s) => s.t - tUnlocked > 900)
const report = {
  totalFrames: after.length,
  sweep: analyse(window30(sweepStart), 'during the light sweep'),
  rest: analyse(after.slice(-30), 'at rest after the sweep'),
}
writeFileSync(`${out}/emblem-probe.json`, JSON.stringify({ report, samples: after }, null, 1))
console.log(JSON.stringify(report, null, 1))

// video → 30 consecutive frames from the rest window
const vid = readdirSync(`${out}/_video`).find((f) => f.endsWith('.webm'))
if (vid) {
  renameSync(`${out}/_video/${vid}`, `${out}/emblem.webm`)
  execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-sseof', '-2.5', '-i', `${out}/emblem.webm`, '-frames:v', '30', `${out}/frames/f%02d.png`])
  console.log(`video: ${out}/emblem.webm · 30 consecutive frames: ${out}/frames/`)
}
