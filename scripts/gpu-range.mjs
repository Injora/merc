#!/usr/bin/env node
/**
 * Controlled, repeatable profile of one scroll range (production preview).
 *
 *   node scripts/gpu-range.mjs [--from 6] [--to 34] [--secs 16] [--passes 3] [--no shards,cube,glass,fx] [--vp desktop|mobile] [--label x]
 *
 * Real ignition, then `passes` identical wheel-paced scrolls from→to (wall-clock paced),
 * jumping back to `from` (and letting it settle) between passes. Per pass and per band:
 *   frames · dropped (rendered interval > 20 ms) · interval p50/p95/max · GPU time p50/p95/max
 *   (EXT_disjoint_timer_query_webgl2, via ?gpu) · reflection-cube re-renders · main-thread rAF work p95.
 * Writes perf/gpu-<label>-<vp>.json.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { chromium } from 'playwright'

const args = Object.fromEntries(process.argv.slice(2).join(' ').split('--').filter(Boolean).map((kv) => {
  const [k, ...v] = kv.trim().split(/\s+/)
  return [k, v.join(' ')]
}))
const base = args.base || 'http://localhost:5299'
const from = Number(args.from ?? 6)
const to = Number(args.to ?? 34)
const secs = Number(args.secs ?? 16)
const passes = Number(args.passes ?? 3)
const vpName = args.vp || 'desktop'
const label = args.label || (args.no ? `no-${args.no.replace(/,/g, '+')}` : 'base')
const VP = { desktop: { width: 1440, height: 900 }, mobile: { width: 390, height: 844 } }
const BANDS = [[6, 8], [8, 16], [16, 23], [23, 27.5], [27.5, 34]]

const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--headless=new', '--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] })
const page = await browser.newPage({ viewport: VP[vpName], deviceScaleFactor: vpName === 'mobile' ? 3 : 2, isMobile: vpName === 'mobile', hasTouch: vpName === 'mobile' })
const errors = []
page.on('pageerror', (e) => errors.push(String(e)))
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
await page.addInitScript(() => {
  let draws = 0
  for (const C of [WebGL2RenderingContext, WebGLRenderingContext])
    for (const fn of ['drawElements', 'drawArrays', 'drawElementsInstanced', 'drawArraysInstanced']) {
      const orig = C.prototype[fn]
      if (orig) C.prototype[fn] = function (...a) { draws++; return orig.apply(this, a) }
    }
  const ticks = new Map()
  window.__ticks = []
  const raf = window.requestAnimationFrame.bind(window)
  window.requestAnimationFrame = (cb) => raf((ts) => {
    let t = ticks.get(ts)
    if (!t) {
      t = { ts, work: 0, d0: draws, draws: 0 }
      ticks.set(ts, t)
      setTimeout(() => { t.draws = draws - t.d0; window.__ticks.push(t); ticks.delete(ts) }, 0)
    }
    const t0 = performance.now(); cb(ts); t.work += performance.now() - t0
  })
})
const q = `?gpu${args.no ? `&no=${args.no}` : ''}`
await page.goto(`${base}/${q}`, { waitUntil: 'load' })
await page.waitForFunction(() => !document.querySelector('.ignition-hit')?.hasAttribute('disabled'), null, { timeout: 90_000 })
await page.waitForTimeout(1500)
await page.click('.ignition-hit')
await page.waitForFunction(() => !document.documentElement.classList.contains('scroll-locked'), null, { timeout: 30_000 })
await page.waitForTimeout(3000)
const unitY = (u) => page.evaluate((u) => {
  const s = document.querySelector('.story')
  return s.getBoundingClientRect().top + window.scrollY + (s.offsetHeight - window.innerHeight) * (u / 100)
}, u)
const y0 = await unitY(from)
const y1 = await unitY(to)
await page.mouse.move(VP[vpName].width / 2, VP[vpName].height / 2)

const pct = (a, p) => (a.length ? a[Math.min(a.length - 1, Math.floor(a.length * p))] : 0)
const stat = (a) => { const s = a.slice().sort((x, y) => x - y); return { p50: +pct(s, 0.5).toFixed(2), p95: +pct(s, 0.95).toFixed(2), max: +(s.at(-1) ?? 0).toFixed(2) } }
const results = []
for (let pass = 1; pass <= passes; pass++) {
  await page.evaluate((y) => window.scrollTo(0, y), y0)
  await page.waitForTimeout(2500)
  await page.evaluate(() => { window.__ticks = []; window.__gpu?.reset() })
  const t0 = Date.now()
  for (;;) {
    const k = Math.min(1, (Date.now() - t0) / (secs * 1000))
    const at = await page.evaluate(() => window.scrollY)
    const d = Math.max(0, Math.min(600, (y0 + (y1 - y0) * k - at) * 1.15))
    if (d > 0.5) await page.mouse.wheel(0, d)
    if (k >= 1) break
    await page.waitForTimeout(60)
  }
  await page.waitForTimeout(1500)
  const { ticks, gpu } = await page.evaluate(() => ({ ticks: window.__ticks.slice(), gpu: window.__gpu?.samples.slice() ?? [] }))
  const unit = await page.evaluate(() => {
    // map timestamps → story unit via the gpu samples (they carry the unit at render time)
    return null
  })
  void unit
  const frames = ticks.filter((t) => t.draws > 0).sort((a, b) => a.ts - b.ts)
  // tag each frame with the unit of the nearest GPU sample in time
  const g = gpu.slice().sort((a, b) => a.t - b.t)
  let j = 0
  for (const f of frames) {
    while (j + 1 < g.length && Math.abs(g[j + 1].t - f.ts) < Math.abs(g[j].t - f.ts)) j++
    f.unit = g[j]?.unit ?? -1
  }
  const bands = BANDS.map(([a, b]) => {
    const fr = frames.filter((f) => f.unit >= a && f.unit < b)
    const iv = fr.slice(1).map((f, i) => f.ts - fr[i].ts).filter((x) => x < 500)
    const gs = gpu.filter((s) => s.unit >= a && s.unit < b)
    return {
      band: `${a}-${b}`,
      frames: fr.length,
      dropped: iv.filter((x) => x > 20).length,
      interval: stat(iv),
      gpu: stat(gs.map((s) => s.gpu)),
      cube: gs.reduce((n, s) => n + s.cube, 0),
      jsP95: stat(fr.map((f) => f.work)).p95,
    }
  })
  const all = frames.slice(1).map((f, i) => f.ts - frames[i].ts).filter((x) => x < 500)
  results.push({ pass, dropped: all.filter((x) => x > 20).length, frames: frames.length, gpu: stat(gpu.map((s) => s.gpu)), bands })
  console.log(`pass ${pass}: dropped ${all.filter((x) => x > 20).length}/${frames.length}  gpu p50 ${stat(gpu.map((s) => s.gpu)).p50} p95 ${stat(gpu.map((s) => s.gpu)).p95} max ${stat(gpu.map((s) => s.gpu)).max} ms`)
  for (const b of bands) console.log(`   ${b.band.padEnd(9)} dropped ${String(b.dropped).padStart(3)}/${String(b.frames).padEnd(4)} interval p95 ${b.interval.p95} max ${b.interval.max} · gpu p50 ${b.gpu.p50} p95 ${b.gpu.p95} max ${b.gpu.max} ms · cube ${b.cube} · js p95 ${b.jsP95}`)
}
mkdirSync('perf', { recursive: true })
writeFileSync(`perf/gpu-${label}-${vpName}.json`, JSON.stringify({ label, vp: vpName, from, to, secs, results, errors: [...new Set(errors)] }, null, 1))
if (errors.length) console.log('errors:', [...new Set(errors)].slice(0, 5))
await browser.close()
