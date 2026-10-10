#!/usr/bin/env node
/**
 * Production-build capture (no dev handles needed).
 *
 *   npm run build && npx vite preview --port 5299 --strictPort &
 *   node scripts/capture.mjs --phase before [--vp desktop|mobile] [--button] [--units 5,20,33] [--video] [--settle 2600]
 *
 *  --button   ignition-button states: loading, idle-early, idle-late, hover, focus, pressed, ignition frames
 *  --units    story units to screenshot after a real ignition (scrolls the real page; waits for Lenis + scrub)
 *  --video    records a 60 s full-journey wheel scroll (units 0 → 100) to shots/<phase>/journey-<vp>.webm
 * Output: shots/<phase>/*.png
 */
import { mkdirSync, readdirSync, renameSync } from 'node:fs'
import { chromium } from 'playwright'

const args = Object.fromEntries(
  process.argv
    .slice(2)
    .join(' ')
    .split('--')
    .filter(Boolean)
    .map((kv) => {
      const [k, ...v] = kv.trim().split(/\s+/)
      return [k, v.join(' ') || 'true']
    }),
)
const phase = args.phase || 'misc'
const vpName = args.vp || 'desktop'
const base = args.base || 'http://localhost:5299'
const settle = Number(args.settle || 2600)
const VP = { desktop: { width: 1440, height: 900 }, tablet: { width: 1024, height: 768 }, mobile: { width: 390, height: 844 } }
const out = `shots/${phase}`
mkdirSync(out, { recursive: true })

const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--headless=new', '--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] })
const context = await browser.newContext({
  viewport: VP[vpName],
  deviceScaleFactor: vpName === 'mobile' ? 3 : 2,
  isMobile: vpName === 'mobile',
  hasTouch: vpName === 'mobile',
  ...(args.video ? { recordVideo: { dir: `${out}/_video`, size: VP[vpName] } } : {}),
})
const page = await context.newPage()
const errors = []
const failed = []
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
page.on('pageerror', (e) => errors.push(String(e)))
page.on('requestfailed', (r) => failed.push(`${r.url()} — ${r.failure()?.errorText}`))
page.on('response', (r) => r.status() >= 400 && failed.push(`${r.url()} — HTTP ${r.status()}`))

const shot = async (name) => {
  await page.screenshot({ path: `${out}/${name}-${vpName}.png` })
  console.log(`  saved ${out}/${name}-${vpName}.png`)
}

await page.goto(base, { waitUntil: 'domcontentloaded' })
if (args.button) {
  await page.waitForTimeout(150)
  await shot('btn-loading')
}
await page.waitForFunction(() => !document.querySelector('.ignition-hit')?.hasAttribute('disabled'), null, { timeout: 90_000 })
const hit = page.locator('.ignition-hit')
const box = await hit.boundingBox()
const cx = box.x + box.width / 2
const cy = box.y + box.height / 2

if (args.button) {
  await page.mouse.move(20, 20)
  await page.waitForTimeout(600)
  await shot('btn-idle-early')
  await page.waitForTimeout(3200)
  await shot('btn-idle-late')
  await page.mouse.move(cx, cy)
  await page.waitForTimeout(900)
  await shot('btn-hover')
  await page.mouse.move(20, 20)
  await page.waitForTimeout(900)
  // keyboard focus: tab until the ignition button is focused
  for (let i = 0; i < 6; i++) {
    await page.keyboard.press('Tab')
    if (await page.evaluate(() => document.activeElement?.classList.contains('ignition-hit'))) break
  }
  await page.waitForTimeout(700)
  await shot('btn-focus')
  await page.mouse.move(cx, cy)
  await page.mouse.down()
  await page.waitForTimeout(160)
  await shot('btn-pressed')
  await page.mouse.up()
  let elapsed = 0
  for (const t of [250, 600, 1100, 1800, 2800, 4200]) {
    await page.waitForTimeout(t - elapsed)
    elapsed = t
    await shot(`btn-ignition-${t}ms`)
  }
} else {
  await page.waitForTimeout(1500)
  await page.mouse.click(cx, cy)
}
await page.waitForFunction(() => !document.documentElement.classList.contains('scroll-locked'), null, { timeout: 30_000 })
await page.waitForTimeout(1000)

const unitY = (u) =>
  page.evaluate((u) => {
    const s = document.querySelector('.story')
    const top = s.getBoundingClientRect().top + window.scrollY
    return top + (s.offsetHeight - window.innerHeight) * (u / 100)
  }, u)

if (args.units) {
  for (const u of args.units.split(',').map(Number)) {
    await page.evaluate((y) => window.scrollTo(0, y), await unitY(u))
    await page.waitForTimeout(settle)
    await shot(`u${u}`)
  }
}

if (args.cta) {
  await page.evaluate(() => document.getElementById('register')?.scrollIntoView())
  await page.waitForTimeout(1500)
  await shot('cta')
}

if (args.video) {
  await page.evaluate((y) => window.scrollTo(0, y), await unitY(0))
  await page.waitForTimeout(1500)
  await page.mouse.move(VP[vpName].width / 2, VP[vpName].height / 2)
  const start = await page.evaluate(() => window.scrollY)
  const end = await unitY(100)
  // wall-clock paced: the wanted position moves linearly over 60 s, wheel deltas chase it
  const t0 = Date.now()
  for (;;) {
    const k = Math.min(1, (Date.now() - t0) / 60_000)
    const at = await page.evaluate(() => window.scrollY)
    const delta = Math.max(0, Math.min(600, (start + (end - start) * k - at) * 1.15))
    if (delta > 0.5) await page.mouse.wheel(0, delta)
    if (k >= 1) break
    await page.waitForTimeout(60)
  }
  await page.waitForTimeout(1500)
}

await context.close()
if (args.video) {
  const dir = `${out}/_video`
  const f = readdirSync(dir).find((x) => x.endsWith('.webm'))
  if (f) {
    renameSync(`${dir}/${f}`, `${out}/journey-${vpName}.webm`)
    console.log(`  saved ${out}/journey-${vpName}.webm`)
  }
}
await browser.close()
if (errors.length) console.log('console errors:\n  ' + [...new Set(errors)].slice(0, 15).join('\n  '))
if (failed.length) console.log('failed requests:\n  ' + [...new Set(failed)].slice(0, 15).join('\n  '))
