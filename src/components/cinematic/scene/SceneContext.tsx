import { createContext, useContext } from 'react'
import type { Object3D } from 'three'
import type { Tier } from '../../../lib/device'
import type { Materials } from './materials'

export type SceneShared = {
  tier: Tier
  materials: Materials
  /** emblem parts, registered by <Emblem/> and read by <Shards/> */
  emblemParts: { arms: Object3D[]; ring: Object3D | null; root?: Object3D | null }
  /** the vehicle root (registered by <Vehicle/>) and the prepared model inside it, once loaded */
  vehicle: { root: Object3D | null; model?: Object3D | null }
}

export const SceneContext = createContext<SceneShared | null>(null)

export function useScene() {
  const ctx = useContext(SceneContext)
  if (!ctx) throw new Error('useScene must be used inside <Stage/>')
  return ctx
}

export const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v)
export const smooth = (a: number, b: number, v: number) => {
  const t = clamp01((v - a) / (b - a))
  return t * t * (3 - 2 * t)
}
