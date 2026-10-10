import type { Camera, Vector3 } from 'three'

/**
 * Callouts: DOM labels pinned to points in the scene. The scene positions them
 * inside its own frame (so they never lag the 3D by a frame); the DOM only
 * registers the elements here. Words, not specifications.
 */
export const CALLOUTS = {
  /** the opening: revealed one by one as the scan passes each point */
  machine: [
    { title: 'Sensing', note: 'the world, measured' },
    { title: 'Perception', note: 'measurements, understood' },
    { title: 'Prediction', note: 'what happens next' },
    { title: 'Optimization', note: 'a better way, found' },
    { title: 'Decision systems', note: 'from choice to action' },
  ],
  /** the AI pipeline: each stage is named when the signal reaches it */
  pipeline: [
    { title: 'Sensing', note: 'signals in' },
    { title: 'Perception', note: 'objects and space' },
    { title: 'Prediction', note: 'future states' },
    { title: 'Planning', note: 'candidate actions' },
    { title: 'Control', note: 'the chosen action' },
  ],
} as const

export type CalloutGroup = keyof typeof CALLOUTS

export const hud = {
  els: { machine: [] as (HTMLElement | null)[], pipeline: [] as (HTMLElement | null)[] },
}

type Slot = { x: number; y: number; on: boolean }

/**
 * Place a group of callouts: a vertical leader from each anchor up to a shared
 * baseline above the highest anchor (two alternating rows so neighbours never
 * collide), the label at its top. `vis[i]` is each callout's visibility (0–1).
 * Allocation-free: `slots` and `rank` are caller-owned scratch.
 */
export function placeCallouts(
  els: (HTMLElement | null)[],
  anchors: Vector3[],
  vis: ArrayLike<number>,
  camera: Camera,
  width: number,
  height: number,
  v: Vector3,
  slots: Slot[],
  rank: Int8Array,
  lift = 70,
) {
  let top = Infinity
  for (let i = 0; i < anchors.length; i++) {
    const p = slots[i]
    v.copy(anchors[i]).project(camera)
    p.x = ((v.x + 1) / 2) * width
    p.y = ((1 - v.y) / 2) * height
    p.on = vis[i] > 0.001 && v.z < 1 && Math.abs(v.x) < 1.05 && Math.abs(v.y) < 1.05
    if (p.on) top = Math.min(top, p.y)
  }
  let n = 0
  for (let i = 0; i < anchors.length; i++) {
    if (!slots[i].on) continue
    let j = n++
    while (j > 0 && slots[rank[j - 1]].x > slots[i].x) {
      rank[j] = rank[j - 1]
      j--
    }
    rank[j] = i
  }
  for (let i = 0; i < els.length; i++) {
    const el = els[i]
    if (!el) continue
    const p = slots[i]
    if (!p.on) {
      if (el.style.visibility !== 'hidden') el.style.visibility = 'hidden'
      continue
    }
    let r = 0
    while (r < n && rank[r] !== i) r++
    const row = Math.max(height * 0.2, top - lift) - (r % 2) * 44
    const k = Math.min(1, vis[i])
    el.style.visibility = 'visible'
    el.style.opacity = String(k)
    el.style.setProperty('--lead', `${Math.max(24, p.y - row) * Math.min(1, k * 1.4)}px`)
    el.style.transform = `translate3d(${p.x}px, ${p.y}px, 0)`
  }
}
