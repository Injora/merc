#!/usr/bin/env node
/**
 * The bottom-right sound control (production preview): music level at the default volume,
 * keyboard volume changes, slide-to-zero mutes, and screenshots of the control.
 *   node scripts/sound-control-check.mjs [--base http://localhost:5299]
 */
import { mkdirSync } from 'node:fs'
import { chromium } from 'playwright'
const base = process.argv.includes('--base') ? process.argv[process.argv.indexOf('--base') + 1] : 'http://localhost:5299'
mkdirSync('shots/sound-control', { recursive: true })
const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--headless=new', '--autoplay-policy=no-user-gesture-required'] })
const tap = () => {
  const orig = AudioNode.prototype.connect
  AudioNode.prototype.connect = function (dest, ...rest) {
    if (dest && dest === this.context.destination && !this.context.__tap) {
      const a = this.context.createAnalyser(); a.fftSize = 4096; this.context.__tap = a; window.__tap = a; orig.call(this, a)
    }
    return orig.call(this, dest, ...rest)
  }
}
const errors = []
async function run(vp, mobile) {
  const ctx = await b.newContext({ viewport: vp, deviceScaleFactor: 2, isMobile: mobile, hasTouch: mobile })
  const p = await ctx.newPage()
  p.on('pageerror', (e) => errors.push(String(e)))
  p.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
  await p.addInitScript(tap)
  await p.goto(base, { waitUntil: 'load' })
  await p.waitForFunction(() => !document.querySelector('.ignition-hit')?.hasAttribute('disabled'), null, { timeout: 90000 })
  await p.waitForTimeout(1000)
  await p.click('.ignition-hit')
  await p.waitForTimeout(9000) // engine gone, music fully in
  return p
}
const rms = (p) => p.evaluate(async () => {
  let best = -Infinity
  for (let k = 0; k < 12; k++) {
    const a = window.__tap, d = new Float32Array(a.fftSize); a.getFloatTimeDomainData(d)
    let s = 0; for (const x of d) s += x * x
    const v = Math.sqrt(s / d.length); best = Math.max(best, v > 0 ? 20 * Math.log10(v) : -Infinity)
    await new Promise((r) => setTimeout(r, 200))
  }
  return +best.toFixed(1)
})
const state = (p) => p.evaluate(() => ({ value: document.querySelector('.sound-volume input').value, muted: document.querySelector('.sound-toggle').getAttribute('aria-pressed') === 'false' }))
const settle = (p) => p.waitForTimeout(800)

// desktop
const p = await run({ width: 1440, height: 900 }, false)
const box = await p.locator('.sound-control').boundingBox()
await p.screenshot({ path: 'shots/sound-control/closed-desktop.png', clip: { x: box.x - 160, y: box.y - 20, width: box.width + 180, height: box.height + 40 } })
console.log('default         ', await state(p), 'music peak-RMS', await rms(p), 'dBFS')
await p.hover('.sound-toggle')
await p.waitForTimeout(600)
const box2 = await p.locator('.sound-control').boundingBox()
await p.screenshot({ path: 'shots/sound-control/open-desktop.png', clip: { x: box2.x - 40, y: box2.y - 20, width: box2.width + 60, height: box2.height + 40 } })
await p.focus('.sound-volume input')
await p.keyboard.press('Home'); for (let i = 0; i < 30; i++) await p.keyboard.press('ArrowRight')
await settle(p); console.log('keyboard → 30%  ', await state(p), 'music peak-RMS', await rms(p), 'dBFS')
await p.keyboard.press('End')
await settle(p); console.log('keyboard → 100% ', await state(p), 'music peak-RMS', await rms(p), 'dBFS')
await p.keyboard.press('Home')
await settle(p); console.log('slider → 0      ', await state(p), 'music peak-RMS', await rms(p), 'dBFS')
await p.click('.sound-toggle')
await settle(p); console.log('toggle (unmute) ', await state(p), 'music peak-RMS', await rms(p), 'dBFS')
await p.close()
// mobile: slider always visible
const m = await run({ width: 390, height: 844 }, true)
const box3 = await m.locator('.sound-control').boundingBox()
await m.screenshot({ path: 'shots/sound-control/mobile.png', clip: { x: Math.max(0, box3.x - 30), y: box3.y - 20, width: box3.width + 50, height: box3.height + 40 } })
await m.screenshot({ path: 'shots/sound-control/mobile-full.png' })
console.log('mobile          ', await state(m), 'music peak-RMS', await rms(m), 'dBFS')
if (errors.length) console.log('errors', errors)
await b.close()
