// Dev debug: brightness of each env-cube face, and of each env-scene object's contribution
import { chromium } from 'playwright'
const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--headless=new', '--use-angle=metal', '--enable-gpu'] })
const p = await b.newPage({ viewport: { width: 1440, height: 900 } })
await p.goto('http://localhost:5199/')
await p.waitForFunction(() => window.__story?.flags.get().stageReady && window.__env, null, { timeout: 90000 })
await p.waitForTimeout(4500)
const r = await p.evaluate(() => {
  const { envScene, target, cubeCamera } = window.__env
  const gl = window.__gl
  const faces = () => {
    const out = []
    const size = target.width
    const buf = new Uint16Array(size * size * 4)
    for (let f = 0; f < 6; f++) {
      gl.readRenderTargetPixels(target, 0, 0, size, size, buf, f)
      let max = 0, sum = 0
      for (let i = 0; i < buf.length; i += 4) {
        // half float → float
        const h = buf[i + 1]
        const e = (h >> 10) & 31, m = h & 1023
        const v = e === 0 ? m * 2 ** -24 : e === 31 ? Infinity : (1 + m / 1024) * 2 ** (e - 15)
        max = Math.max(max, v); sum += v
      }
      out.push(`${['+x', '-x', '+y', '-y', '+z', '-z'][f]} avg ${(sum / (size * size)).toFixed(3)} max ${max.toFixed(2)}`)
    }
    return out
  }
  const res = { all: faces(), objects: [] }
  for (const o of envScene.children) {
    const was = o.visible
    o.visible = false
    cubeCamera.update(gl, envScene)
    res.objects.push(`${o.type} ${o.geometry?.type} scale ${o.scale.toArray().map((x) => +x.toFixed(2))} visibleBefore=${was} → ` + faces().find((x) => x.startsWith('+z')))
    o.visible = was
  }
  cubeCamera.update(gl, envScene)
  return res
})
console.log(r.all.join('\n'))
console.log('--- +z face with each object hidden:')
console.log(r.objects.join('\n'))
await b.close()
