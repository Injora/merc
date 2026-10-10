// Regression check: lists any frame that compiles shaders or takes >20 ms while scrolling a story range (dev server). — node scripts/check-compiles.mjs [from] [to]
import { chromium } from 'playwright'
const [from, to] = [Number(process.argv[2] ?? 14), Number(process.argv[3] ?? 22)]
const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--headless=new', '--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] })
const p = await b.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 })
await p.addInitScript(() => {
  const counts = {}
  const WATCH = ['compileShader', 'linkProgram', 'getProgramParameter', 'texImage2D', 'texSubImage2D', 'texStorage2D', 'bufferData', 'generateMipmap', 'readPixels', 'framebufferTexture2D', 'renderbufferStorageMultisample']
  for (const C of [WebGL2RenderingContext, WebGLRenderingContext])
    for (const fn of WATCH) {
      const orig = C.prototype[fn]
      if (orig) C.prototype[fn] = function (...a) { counts[fn] = (counts[fn] || 0) + 1; return orig.apply(this, a) }
    }
  window.__frames = []
  const raf = window.requestAnimationFrame.bind(window)
  window.requestAnimationFrame = (cb) => raf((ts) => {
    for (const k in counts) delete counts[k]
    const before = window.__gl ? new Set(window.__gl.info.programs.map((x) => x.cacheKey)) : new Set()
    const t0 = performance.now()
    cb(ts)
    const work = performance.now() - t0
    const fresh = window.__gl ? window.__gl.info.programs.filter((x) => !before.has(x.cacheKey)).map((x) => x.name + ' ' + x.cacheKey.slice(0, 160)) : []
    if (work > 20 || fresh.length) window.__frames.push({ work: Math.round(work), unit: window.__story ? +(window.__story.S.progress * 100).toFixed(2) : -1, calls: { ...counts }, fresh })
  })
})
await p.goto('http://localhost:5199/')
await p.waitForFunction(() => window.__story?.flags.get().stageReady, null, { timeout: 90000 })
await p.waitForTimeout(2500)
await p.click('.ignition-hit')
await p.waitForFunction(() => window.__story.flags.get().unlocked, null, { timeout: 30000 })
await p.evaluate(() => (window.__frames = []))
await p.mouse.move(720, 450)
const y = (u) => p.evaluate((u) => window.__story.timeline.unitToScroll(u), u)
const y0 = await y(from), y1 = await y(to)
await p.evaluate((v) => window.scrollTo(0, v), y0)
await p.waitForTimeout(1500)
const steps = Math.round((y1 - y0) / 80)
for (let i = 0; i < steps; i++) { await p.mouse.wheel(0, (y1 - y0) / steps); await p.waitForTimeout(50) }
await p.waitForTimeout(1500)
console.log(JSON.stringify(await p.evaluate(() => window.__frames)))
await b.close()
