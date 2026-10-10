#!/usr/bin/env node
/**
 * Motion stability at rest (production preview, ?probe):
 *   node scripts/verify-jitter.mjs [--base http://localhost:5299] [--units 5,27,58.8,85,97]
 *
 * After a real ignition, scrolls to each story unit, lets Lenis + the scrub +
 * the damped camera settle (4 s), then samples 60 consecutive frames:
 *   camera   position / view-direction range (WebGL frames; from the probe)
 *   emblem   world position / rotation range (when on screen)
 *   caption  bounding-rect range of the visible caption (DOM)
 *   rail     bounding-rect range of the chapter rail (DOM)
 *   plates   number of distinct pixel checksums in a 64×64 centre crop of the plate canvas
 * Any non-zero range at rest is jitter. Writes perf/jitter.json.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { chromium } from 'playwright'

const args = Object.fromEntries(
  process.argv.slice(2).join(' ').split('--').filter(Boolean).map((kv) => {
    const [k, ...v] = kv.trim().split(/\s+/)
    return [k, v.join(' ')]
  }),
)
const base = args.base || 'http://localhost:5299'
const units = (args.units || '5,27,58.8,85,97').split(',').map(Number)

const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--headless=new', '--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] })
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 })
await page.goto(`${base}/?probe`)
await page.waitForFunction(() => !document.querySelector('.ignition-hit')?.hasAttribute('disabled'), null, { timeout: 90_000 })
await page.waitForTimeout(1200)
await page.click('.ignition-hit')
await page.waitForFunction(() => !document.documentElement.classList.contains('scroll-locked'), null, { timeout: 30_000 })
await page.waitForTimeout(3500)

const unitY = (u) =>
  page.evaluate((u) => {
    const s = document.querySelector('.story')
    const top = s.getBoundingClientRect().top + window.scrollY
    return top + (s.offsetHeight - window.innerHeight) * (u / 100)
  }, u)

const range = (a) => {
  const f = a.filter((x) => Number.isFinite(x))
  return f.length ? +(Math.max(...f) - Math.min(...f)).toFixed(6) : null
}
const results = []
for (const u of units) {
  await page.evaluate((y) => window.scrollTo(0, y), await unitY(u))
  await page.waitForTimeout(4000)
  await page.evaluate(() => window.__probe.reset())
  const dom = await page.evaluate(
    () =>
      new Promise((resolve) => {
        const out = { caption: [], rail: [], plates: [], t: [] }
        const cv = document.querySelector('.plate-canvas')
        const ctx = cv?.getContext('2d')
        let n = 0
        const step = (ts) => {
          out.t.push(ts)
          const cap = [...document.querySelectorAll('.caption')].find((c) => getComputedStyle(c).visibility !== 'hidden' && +getComputedStyle(c).opacity > 0.05)
          const r = cap?.getBoundingClientRect()
          out.caption.push(r ? [r.x, r.y, +getComputedStyle(cap).opacity] : null)
          const rail = document.querySelector('.rail')?.getBoundingClientRect()
          out.rail.push(rail ? [rail.x, rail.y] : null)
          if (ctx && +cv.style.opacity > 0) {
            const d = ctx.getImageData(Math.floor(cv.width / 2 - 32), Math.floor(cv.height / 2 - 32), 64, 64).data
            let h = 0
            for (let i = 0; i < d.length; i += 7) h = (h * 31 + d[i]) | 0
            out.plates.push(h)
          }
          if (++n < 60) requestAnimationFrame(step)
          else resolve(out)
        }
        requestAnimationFrame(step)
      }),
  )
  const probe = await page.evaluate(() => window.__probe.samples.slice(-60))
  const cam = (k) => range(probe.map((s) => s.cam[k]))
  const intervals = dom.t.slice(1).map((t, i) => t - dom.t[i])
  const r = {
    unit: u,
    frames: dom.t.length,
    webglFrames: probe.length,
    frameIntervalMs: { mean: +(intervals.reduce((a, b) => a + b, 0) / intervals.length).toFixed(2), max: +Math.max(...intervals).toFixed(2) },
    camera: probe.length ? { pos: [cam(0), cam(1), cam(2)], dir: [cam(3), cam(4), cam(5)] } : 'not rendered (plates cover the frame)',
    emblem: probe.length && Number.isFinite(probe[0].px) ? { pos: [range(probe.map((s) => s.px)), range(probe.map((s) => s.py))], rotY: range(probe.map((s) => s.ry)) } : null,
    caption: dom.caption.some(Boolean) ? { x: range(dom.caption.map((c) => c?.[0])), y: range(dom.caption.map((c) => c?.[1])), opacity: range(dom.caption.map((c) => c?.[2])) } : null,
    rail: { x: range(dom.rail.map((c) => c?.[0])), y: range(dom.rail.map((c) => c?.[1])) },
    plates: dom.plates.length ? { distinctFrames: new Set(dom.plates).size, sampled: dom.plates.length } : null,
  }
  results.push(r)
  console.log(JSON.stringify(r))
}
mkdirSync('perf', { recursive: true })
writeFileSync('perf/jitter.json', JSON.stringify(results, null, 1))
await browser.close()
