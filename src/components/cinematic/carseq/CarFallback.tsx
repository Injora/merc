import { useCallback, useSyncExternalStore } from 'react'
import { flagStore } from '../../../lib/state'
import { storyTimeline } from '../timeline'
import { CarSequence } from './CarSequence'

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v)

/**
 * Takes over the reveal (units 12–30) if the car model fails to load: the
 * car's turntable sequence turns with the scroll (or its outline is drawn in
 * light). Renders nothing while the 3D car is fine.
 */
export function CarFallback() {
  const failed = useSyncExternalStore(flagStore.subscribe, () => flagStore.get().carFailed)
  const unit = () => storyTimeline?.time() ?? 0
  const position = useCallback(() => clamp01((unit() - 12) / 18) * 0.5, [])
  const opacity = useCallback(() => {
    const u = unit()
    return clamp01((u - 12) / 2) * (1 - clamp01((u - 29.4) / 0.6))
  }, [])
  if (!failed) return null
  return <CarSequence position={position} opacity={opacity} className="car-fallback" />
}
