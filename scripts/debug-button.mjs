// Dev debug: what makes the ignition face grey? Hides objects one by one and samples the centre pixel.
import { chromium } from 'playwright'
const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--headless=new', '--use-angle=metal', '--enable-gpu'] })
const p = await b.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 })
await p.goto('http://localhost:5199/')
await p.waitForFunction(() => window.__story?.flags.get().stageReady, null, { timeout: 90000 })
await p.waitForTimeout(4500)
const sample = async () => {
  await p.waitForTimeout(250)
  const buf = await p.screenshot({ clip: { x: 700, y: 470, width: 40, height: 20 } })
  return buf.length
}
const centre = async () => {
  const img = await p.screenshot({ clip: { x: 715, y: 478, width: 10, height: 10 } })
  // decode via the page (PNG → pixel)
  return p.evaluate(async (b64) => {
    const bmp = await createImageBitmap(await (await fetch('data:image/png;base64,' + b64)).blob())
    const c = new OffscreenCanvas(bmp.width, bmp.height).getContext('2d')
    c.drawImage(bmp, 0, 0)
    const d = c.getImageData(0, 0, bmp.width, bmp.height).data
    let s = 0
    for (let i = 0; i < d.length; i += 4) s += (d[i] + d[i + 1] + d[i + 2]) / 3
    return Math.round(s / (d.length / 4))
  }, img.toString('base64'))
}
void sample
console.log('baseline centre luminance:', await centre())
const test = async (label, on, off, arg) => {
  await p.evaluate(on, arg)
  const l = await centre()
  await p.evaluate(off)
  console.log(String(l).padStart(4), label)
}
await test('no scene.environment', () => { window.__env = window.__scene.environment; window.__scene.environment = null }, () => { window.__scene.environment = window.__env })
const lights = await p.evaluate(() => {
  const out = []
  window.__scene.traverse((o) => o.isLight && out.push(o.uuid + '|' + o.type + '|' + o.intensity.toFixed(2)))
  return out
})
for (const l of lights) {
  const [id, type, inten] = l.split('|')
  await test(`without ${type} (intensity ${inten})`, (id) => { window.__scene.getObjectByProperty('uuid', id).visible = false }, () => {}, id)
  await p.evaluate((id) => (window.__scene.getObjectByProperty('uuid', id).visible = true), id)
}
const dom = await p.evaluate(() => {
  const el = document.elementFromPoint(720, 483)
  return el ? el.className + ' bg=' + getComputedStyle(el).backgroundColor : 'none'
})
console.log('DOM at centre:', dom)
await b.close()
