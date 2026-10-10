import type { Camera, Object3D, WebGLRenderer } from 'three'

/**
 * Verification probe (works in production): add `?probe` to the URL.
 * After every rendered frame it records the emblem's world transform, the
 * camera's position and view direction, and the
 * brightest highlight in a centre crop of the frame (read straight from the
 * drawing buffer in the same task as the render), into window.__probe.
 * Off by default; costs nothing unless enabled.
 */
export const PROBE_ON = typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('probe')

type Sample = {
  t: number
  frame: number
  px: number
  py: number
  pz: number
  rx: number
  ry: number
  rz: number
  hx: number
  hy: number
  hi: number
  mean: number
  /** camera position and forward direction */
  cam: [number, number, number, number, number, number]
}

const samples: Sample[] = []
const SIZE = 192
let buf: Uint8Array | null = null
let frame = 0
if (PROBE_ON) Object.assign(window, { __probe: { samples, reset: () => (samples.length = 0) } })

export function probeFrame(gl: WebGLRenderer, emblem: Object3D | null | undefined, camera?: Camera) {
  if (!PROBE_ON) return
  frame++
  const ctx = gl.getContext()
  const w = ctx.drawingBufferWidth
  const h = ctx.drawingBufferHeight
  const x0 = Math.floor(w / 2 - SIZE / 2)
  const y0 = Math.floor(h / 2 - SIZE / 2)
  buf ??= new Uint8Array(SIZE * SIZE * 4)
  ctx.bindFramebuffer(ctx.FRAMEBUFFER, null)
  ctx.readPixels(x0, y0, SIZE, SIZE, ctx.RGBA, ctx.UNSIGNED_BYTE, buf)
  // highlight = luminance-weighted centroid of the brightest pixels; mean = overall exposure
  let max = 0
  let sum = 0
  for (let i = 0; i < buf.length; i += 4) {
    const l = buf[i] * 0.2126 + buf[i + 1] * 0.7152 + buf[i + 2] * 0.0722
    sum += l
    if (l > max) max = l
  }
  const thr = max * 0.92
  let cx = 0
  let cy = 0
  let wsum = 0
  for (let i = 0, p = 0; i < buf.length; i += 4, p++) {
    const l = buf[i] * 0.2126 + buf[i + 1] * 0.7152 + buf[i + 2] * 0.0722
    if (l >= thr) {
      cx += (p % SIZE) * l
      cy += Math.floor(p / SIZE) * l
      wsum += l
    }
  }
  const e = emblem
  e?.updateWorldMatrix(true, false)
  const m = e?.matrixWorld.elements
  const c = camera ? camera.matrixWorld.elements : []
  samples.push({
    t: performance.now(),
    frame,
    px: m ? m[12] : NaN,
    py: m ? m[13] : NaN,
    pz: m ? m[14] : NaN,
    rx: e ? e.rotation.x : NaN,
    ry: e ? e.rotation.y : NaN,
    rz: e ? e.rotation.z : NaN,
    hx: wsum ? cx / wsum : NaN,
    hy: wsum ? cy / wsum : NaN,
    hi: max,
    mean: sum / (SIZE * SIZE),
    cam: camera ? [c[12], c[13], c[14], -c[8], -c[9], -c[10]] : [NaN, NaN, NaN, NaN, NaN, NaN],
  })
  if (samples.length > 2000) samples.shift()
}
