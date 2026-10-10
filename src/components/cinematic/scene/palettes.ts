import { Color } from 'three'

/**
 * Colour script for the real-time scenes: the studio (the machine, the X-ray,
 * the data and the core all sit in its darkness), the grid's first light, and
 * the finale. `S.sky` interpolates between these indices.
 */
export type Palette = {
  skyTop: string
  skyHorizon: string
  ground: string
  fog: string
  fogNear: number
  fogFar: number
  sun: string
  sunDir: [number, number, number]
  sunIntensity: number
  hemiSky: string
  hemiGround: string
  hemi: number
  env: number // environment reflection strength
  exposure: number
  /** wet road 0 → 1 */
  wet?: number
}

export const PALETTES: Palette[] = [
  // 0 · studio — black, controlled
  { skyTop: '#000000', skyHorizon: '#050607', ground: '#020203', fog: '#000000', fogNear: 9, fogFar: 34, sun: '#ffffff', sunDir: [0.3, 1, 0.4], sunIntensity: 0, hemiSky: '#20242a', hemiGround: '#000000', hemi: 0.06, env: 1, exposure: 1.0 },
  // 1 · the grid's first light — blue-black, one low cold glow on the horizon
  { skyTop: '#020306', skyHorizon: '#0c1018', ground: '#07080b', fog: '#05070b', fogNear: 18, fogFar: 190, sun: '#9fb2ff', sunDir: [0, 0.035, -1], sunIntensity: 0.14, hemiSky: '#2a3550', hemiGround: '#05060a', hemi: 0.3, env: 0.6, exposure: 1.04, wet: 0.7 },
  // 2 · the future — black, silver, a whisper of cyan
  { skyTop: '#000002', skyHorizon: '#071319', ground: '#010203', fog: '#020507', fogNear: 30, fogFar: 260, sun: '#bfefff', sunDir: [0, 0.035, -1], sunIntensity: 0.1, hemiSky: '#1c2a33', hemiGround: '#000000', hemi: 0.22, env: 0.65, exposure: 1.0 },
]

type Resolved = {
  skyTop: Color
  skyHorizon: Color
  ground: Color
  fog: Color
  sun: Color
  hemiSky: Color
  hemiGround: Color
  sunDir: [number, number, number]
  fogNear: number
  fogFar: number
  sunIntensity: number
  hemi: number
  env: number
  exposure: number
  wet: number
}

const cache = PALETTES.map((p) => ({
  skyTop: new Color(p.skyTop),
  skyHorizon: new Color(p.skyHorizon),
  ground: new Color(p.ground),
  fog: new Color(p.fog),
  sun: new Color(p.sun),
  hemiSky: new Color(p.hemiSky),
  hemiGround: new Color(p.hemiGround),
}))

const out: Resolved = {
  skyTop: new Color(),
  skyHorizon: new Color(),
  ground: new Color(),
  fog: new Color(),
  sun: new Color(),
  hemiSky: new Color(),
  hemiGround: new Color(),
  sunDir: [0, 1, 0],
  fogNear: 10,
  fogFar: 100,
  sunIntensity: 0,
  hemi: 0,
  env: 1,
  exposure: 1,
  wet: 0,
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t

/** Interpolated palette for a fractional index. Returns a shared object — read, don't keep. */
export function samplePalette(index: number): Resolved {
  const max = PALETTES.length - 1
  const i = Math.max(0, Math.min(max, index))
  const a = Math.floor(i)
  const b = Math.min(max, a + 1)
  const t = i - a
  const A = PALETTES[a]
  const B = PALETTES[b]
  const cA = cache[a]
  const cB = cache[b]
  for (const k of ['skyTop', 'skyHorizon', 'ground', 'fog', 'sun', 'hemiSky', 'hemiGround'] as const) {
    out[k].copy(cA[k]).lerp(cB[k], t)
  }
  // mutate in place: no per-frame allocation
  for (let j = 0; j < 3; j++) out.sunDir[j] = lerp(A.sunDir[j], B.sunDir[j], t)
  out.fogNear = lerp(A.fogNear, B.fogNear, t)
  out.fogFar = lerp(A.fogFar, B.fogFar, t)
  out.sunIntensity = lerp(A.sunIntensity, B.sunIntensity, t)
  out.hemi = lerp(A.hemi, B.hemi, t)
  out.env = lerp(A.env, B.env, t)
  out.exposure = lerp(A.exposure, B.exposure, t)
  out.wet = lerp(A.wet ?? 0, B.wet ?? 0, t)
  return out
}
