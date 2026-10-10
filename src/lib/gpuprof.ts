import { S } from './state'

/**
 * GPU profiling for performance investigation (works in production; off by default).
 *
 *   ?gpu            measure each frame's GPU time with EXT_disjoint_timer_query_webgl2
 *                   → window.__gpu.samples: { t, unit, gpu (ms), cube (reflection-cube re-renders that frame) }
 *   ?no=a,b         switch a suspect off, to isolate it:
 *                   shards · cube (freeze the reflection cube after warm-up) · glass (no transmission pass) · fx (no post-processing)
 *                   · txhalf (undo the half-resolution transmission: the previous, full-resolution pass)
 *
 * Used by scripts/gpu-range.mjs. Costs nothing unless a flag is present.
 */
const params = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : new URLSearchParams()
export const GPU_ON = params.has('gpu')
export const NO = new Set((params.get('no') ?? '').split(',').filter(Boolean))

type Sample = { t: number; unit: number; gpu: number; cube: number }
type Pending = { q: WebGLQuery; t: number; unit: number; cube: number }

const samples: Sample[] = []
const pending: Pending[] = []
let ext: { TIME_ELAPSED_EXT: number; GPU_DISJOINT_EXT: number } | null = null
let gl2: WebGL2RenderingContext | null = null
let active: Pending | null = null
let cubeThisFrame = 0

export const gpuprof = {
  /** called by StudioEnvironment whenever it re-renders the reflection cube */
  cube() {
    cubeThisFrame++
  },
}

if (GPU_ON && typeof window !== 'undefined') Object.assign(window, { __gpu: { samples, reset: () => (samples.length = 0) } })

export function gpuBegin(gl: WebGL2RenderingContext) {
  if (!GPU_ON) return
  if (!ext) {
    gl2 = gl
    ext = gl.getExtension('EXT_disjoint_timer_query_webgl2')
    if (!ext) return
  }
  // collect finished queries (in order)
  while (pending.length) {
    const p = pending[0]
    if (!gl.getQueryParameter(p.q, gl.QUERY_RESULT_AVAILABLE)) break
    const disjoint = gl.getParameter(ext.GPU_DISJOINT_EXT)
    const ns = gl.getQueryParameter(p.q, gl.QUERY_RESULT) as number
    if (!disjoint) samples.push({ t: p.t, unit: p.unit, gpu: ns / 1e6, cube: p.cube })
    gl.deleteQuery(p.q)
    pending.shift()
  }
  const q = gl.createQuery()
  if (!q) return
  cubeThisFrame = 0
  gl.beginQuery(ext.TIME_ELAPSED_EXT, q)
  active = { q, t: performance.now(), unit: S.progress * 100, cube: 0 }
}

export function gpuEnd() {
  if (!GPU_ON || !ext || !gl2 || !active) return
  gl2.endQuery(ext.TIME_ELAPSED_EXT)
  active.cube = cubeThisFrame
  pending.push(active)
  active = null
}
