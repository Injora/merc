import { useGLTF } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { Suspense, useEffect, useMemo, useRef } from 'react'
import { Quaternion, Vector3, type Group, type Mesh } from 'three'
import { ASSETS } from '../../../config/assets'
import { S } from '../../../lib/state'
import { armAngle, createArmGeometry, createRingGeometry } from './geometry/star'
import { EMBLEM_POS, BEZEL_RADIUS } from './Ignition'
import { useScene, smooth } from './SceneContext'

const EMBLEM_SCALE = 0.62
const RING_MID = 0.97 // normalised ring centre-line radius
/** ring scale (inside the emblem group) at which it exactly matches the button bezel */
const BEZEL_SCALE = BEZEL_RADIUS / (RING_MID * EMBLEM_SCALE)

/**
 * The three-pointed star in polished chrome.
 *
 * It does not exist on screen before START ENGINE: the root stays
 * `visible = false` (and collapsed to zero scale) until `S.revealed` is set
 * by the ignition sequence. At that instant the button's bezel hands over to
 * the emblem's ring at the same radius, face-on; the ring widens to its full
 * size while the three arms spin up out of the hub with inertia.
 * When scrolling begins the components separate, ready to become the shards.
 */
export function Emblem() {
  const { materials, emblemParts } = useScene()
  const root = useRef<Group>(null)
  const armsGroup = useRef<Group>(null)
  const ring = useRef<Mesh>(null)
  const arms = useRef<(Group | null)[]>([])

  const armGeos = useMemo(() => [0, 1, 2].map(createArmGeometry), [])
  const ringGeo = useMemo(() => createRingGeometry(), [])
  useEffect(
    () => () => {
      armGeos.forEach((g) => g.dispose())
      ringGeo.dispose()
    },
    [armGeos, ringGeo],
  )

  useEffect(() => {
    emblemParts.arms = arms.current.filter(Boolean) as Group[]
    emblemParts.ring = ring.current
    emblemParts.root = root.current
  }, [emblemParts])

  const q = useMemo(() => new Quaternion(), [])
  const axis = useMemo(() => new Vector3(), [])

  useFrame(() => {
    const r = root.current
    if (!r) return
    const revealed = S.revealed > 0.5
    r.visible = revealed && S.shards < 0.06 && S.studio > 0.5
    // collapsed while hidden, so nothing can sit in the frustum before ignition
    r.scale.setScalar(revealed ? EMBLEM_SCALE : 0.0001)
    // the studio sweep: a band of light crossing the facets once (S.ignSweep 0 → 1)
    materials.emblemSweep.value = S.ignSweep > 0 && S.ignSweep < 1 ? -1.2 + 2.4 * S.ignSweep : -9
    if (!r.visible) return

    const morph = S.morph
    const split = S.starSplit
    const grow = smooth(0.25, 1, morph)

    // Deterministic: at rest the star is perfectly still; it turns only with scroll
    // (S.starTurn, eased by the scrub). No idle sway, no time-based noise.
    r.rotation.set(0, S.starTurn, 0)

    // arms only: spin up into place with the morph's overshoot
    if (armsGroup.current) armsGroup.current.rotation.set(0, (1 - grow) * -1.4, 0)

    // ring: bezel radius → emblem radius (face-on), then widens and tilts as it separates
    if (ring.current) {
      const s = (BEZEL_SCALE + (1 - BEZEL_SCALE) * smooth(0.05, 0.7, morph)) * (1 + split * 0.32)
      ring.current.scale.setScalar(s)
      ring.current.rotation.set(split * 1.05, split * 0.4, 0)
      ring.current.position.set(0, split * 0.12, -split * 0.35)
    }

    for (let k = 0; k < arms.current.length; k++) {
      const arm = arms.current[k]
      if (!arm) continue
      arm.visible = grow > 0.001
      const a = armAngle(k)
      axis.set(Math.cos(a), Math.sin(a), 0)
      // separation: slide outward along its own axis, roll around it, lift off the plane
      arm.position.set(axis.x * split * 0.62, axis.y * split * 0.62, (k - 1) * 0.28 * split + split * 0.2)
      q.setFromAxisAngle(axis, split * (0.9 + k * 0.35))
      arm.quaternion.copy(q)
      arm.rotateZ((1 - grow) * -1.1)
      arm.scale.setScalar(Math.max(0.001, grow))
    }
  })

  const custom = ASSETS.models.emblem.url

  return (
    <group position={EMBLEM_POS}>
      <group ref={root} scale={0.0001} visible={false}>
        <mesh ref={ring} geometry={ringGeo} material={materials.emblemChrome} />
        <group ref={armsGroup}>
          {custom ? (
            <Suspense fallback={null}>
              <CustomEmblem url={custom} />
            </Suspense>
          ) : (
            armGeos.map((g, k) => (
              <group key={k} ref={(el) => void (arms.current[k] = el)}>
                <mesh geometry={g} material={materials.emblemChrome} />
              </group>
            ))
          )}
        </group>
      </group>
    </group>
  )
}

/** Sponsor-supplied emblem GLB (optional). Replaces the arms; the ring stays. */
function CustomEmblem({ url }: { url: string }) {
  const gltf = useGLTF(url)
  const scene = useMemo(() => gltf.scene.clone(true), [gltf])
  const grow = useRef<Group>(null)
  useFrame(() => {
    if (grow.current) grow.current.scale.setScalar(Math.max(0.001, smooth(0.25, 1, S.morph)) * ASSETS.models.emblem.scale)
  })
  return (
    <group ref={grow}>
      <primitive object={scene} />
    </group>
  )
}
