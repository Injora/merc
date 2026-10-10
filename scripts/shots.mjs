#!/usr/bin/env node
/**
 * Visual verification: renders the film at given story units and saves PNGs.
 *
 *   node scripts/shots.mjs --phase p1 --units idle,ign,2,6 [--vp desktop,mobile] [--base http://localhost:5199]
 *
 * Units:
 *   idle      ignition screen, before START ENGINE (after the intro has settled)
 *   ign       real ignition: presses START ENGINE and waits for the star to settle
 *   <number>  instant post-ignition state, then scroll to that story unit (0–100)
 *
 * Runs the installed Chrome in new-headless mode on the real GPU, against the
 * dev server with ?nosmooth (no Lenis, instant scrub) so frames are deterministic.
 * Output: shots/<phase>/<unit>-<viewport>.png
 *
 *   --car fixture | fixture-opt   load scripts/fixtures/CarConcept[.opt].glb (Khronos sample, CC-BY 4.0,
 *                   a generic concept car — local pipeline test only, never shipped)
 *                   through request interception, via the dev-only ?car= override.
 */
import { mkdirSync } from 'node:fs'
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
const phase = args.phase || 'misc'
const units = (args.units || 'idle').split(',')
const viewports = (args.vp || 'desktop').split(',')
const base = args.base || 'http://localhost:5199'
const settle = Number(args.settle || 900)
// --car fixture | fixture-opt | <path under scripts/fixtures/> (e.g. cars/c63.glb)
const carFixture = !args.car ? null : args.car === 'fixture' ? 'CarConcept.glb' : args.car === 'fixture-opt' ? 'CarConcept.opt.glb' : args.car
const VP = { desktop: { width: 1440, height: 900 }, tablet: { width: 1024, height: 768 }, mobile: { width: 390, height: 844 } }

const outDir = `shots/${phase}`
mkdirSync(outDir, { recursive: true })

const browser = await chromium.launch({
  channel: 'chrome',
  headless: true,
  args: ['--headless=new', '--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'],
})

for (const vpName of viewports) {
  const vp = VP[vpName]
  const context = await browser.newContext({ viewport: vp, deviceScaleFactor: 1, isMobile: vpName === 'mobile', hasTouch: vpName === 'mobile' })
  const page = await context.newPage()
  const errors = []
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
  page.on('pageerror', (e) => errors.push(String(e)))
  page.on('console', (m) => m.text().startsWith('[vehicle]') && console.log('  ' + m.text()))
  if (carFixture) await page.route((url) => url.pathname === '/models/__fixture-car.glb', (route) => route.fulfill({ path: `scripts/fixtures/${carFixture}`, contentType: 'model/gltf-binary' }))

  const load = async () => {
    const q = carFixture ? '&car=/models/__fixture-car.glb' : ''
    await page.goto(`${base}/?nosmooth${q}`, { waitUntil: 'load' })
    await page.waitForFunction(() => window.__story?.flags.get().stageReady, null, { timeout: 90_000 })
  }
  await load()
  const renderer = await page.evaluate(() => {
    const gl = document.createElement('canvas').getContext('webgl2')
    const ext = gl?.getExtension('WEBGL_debug_renderer_info')
    return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : 'unknown'
  })
  console.log(`[${vpName}] renderer: ${renderer}`)

  let ignited = false
  for (const unit of units) {
    const file = `${outDir}/${unit}-${vpName}.png`
    if (unit === 'idle') {
      if (ignited) {
        await load()
        ignited = false
      }
      await page.waitForTimeout(4500)
    } else if (unit === 'ign') {
      if (ignited) await load()
      await page.waitForTimeout(3500)
      await page.click('.ignition-hit')
      await page.waitForFunction(() => window.__story.flags.get().unlocked, null, { timeout: 30_000 })
      await page.waitForTimeout(1500)
      ignited = true
    } else {
      const u = Number(unit)
      await page.evaluate((u) => {
        const st = window.__story
        st.ignition.completeIgnition()
        window.scrollTo(0, st.timeline.unitToScroll(u))
      }, u)
      ignited = true
      // wait for the instant scrub to land, then for freshly rendered WebGL frames
      await page.waitForFunction(
        (u) => {
          const st = window.__story
          const tl = st.timeline.storyTimeline
          return tl && Math.abs(tl.progress() - u / 100) < 0.002
        },
        u,
        { timeout: 15_000 },
      )
      const f0 = await page.evaluate(() => window.__story.S.frame)
      await page.waitForFunction((f0) => window.__story.S.frame > f0 + 12, f0, { timeout: 30_000 })
      await page.waitForTimeout(settle)
    }
    // a throwaway capture first: flushes any stale compositor frame after a long jump
    await page.screenshot()
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))))
    await page.screenshot({ path: file })
    console.log(`  saved ${file}`)
  }
  if (errors.length) console.log(`[${vpName}] console errors:\n  ` + errors.slice(0, 10).join('\n  '))
  await context.close()
}
await browser.close()
