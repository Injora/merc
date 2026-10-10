import { useFrame } from '@react-three/fiber'
import { Suspense, useEffect, useMemo, useRef } from 'react'
import { AdditiveBlending, Box3, Object3D, Vector3, type Group, type MeshPhysicalMaterial, type SpotLight, type Sprite, type SpriteMaterial } from 'three'
import { ASSETS } from '../../../config/assets'
import { S, flagStore } from '../../../lib/state'
import { NO } from '../../../lib/gpuprof'
import { ErrorBoundary } from '../../ui/ErrorBoundary'
import { createGlow } from './textures'
import { useScene, clamp01 } from './SceneContext'
import { getCarUrl, useVehicleGLTF } from './vehicle/loader'
import { prepareCar } from './vehicle/prepare'
import { applyCarFx, updateCarFx } from './tech/carFx'

type WheelRig = { o: Object3D; sign: number }
type LampRig = { head: MeshPhysicalMaterial[]; tail: MeshPhysicalMaterial[] }

/** wheel radius used for spin (metres); close enough for any saloon/coupé at 4.7 m */
const WHEEL_RADIUS = 0.34

/**
 * The car: the GLB in ASSETS.models.car, normalised and dressed by the
 * automotive material kit, with the scan / X-ray effect in its materials
 * (tech/carFx.ts). If it cannot be loaded, nothing is drawn here and
 * the film shows the car's image sequence (or its light-drawn outline)
 * instead — see CarFallback. Reveal clipping, wheel spin, lamps, beams and
 * flares are driven from the story state.
 */
export function Vehicle() {
  const { materials, vehicle } = useScene()
  const root = useRef<Group>(null)
  const body = useRef<Group>(null)
  const wheels = useRef<WheelRig[]>([])
  const lamps = useRef<LampRig>({ head: [], tail: [] })
  const spotL = useRef<SpotLight>(null)
  const spotR = useRef<SpotLight>(null)
  const flares = useRef<(Sprite | null)[]>([])
  const flareAt = useRef<[Vector3, Vector3]>([new Vector3(-0.66, 0.66, -2.3), new Vector3(0.66, 0.66, -2.3)])
  const glow = useMemo(() => createGlow(), [])
  const targets = useMemo(() => [new Object3D(), new Object3D()], [])

  useEffect(() => {
    vehicle.root = root.current
    targets[0].position.set(-1.2, 0, -16)
    targets[1].position.set(1.2, 0, -16)
    root.current?.add(targets[0], targets[1])
    if (spotL.current) spotL.current.target = targets[0]
    if (spotR.current) spotR.current.target = targets[1]
    return () => glow.dispose()
  }, [vehicle, targets, glow])

  useFrame((_, dt) => {
    const r = root.current
    if (!r) return
    updateCarFx()
    const inStudio = S.studio > 0.5
    const onRoad = false // the finale is the light grid: the car has become the core by then
    // once the X-ray has dissolved all of the paint (gate past the tail), skip the meshes entirely
    const gone = S.tech.ghost > 0.999 || (S.tech.xray > 0.999 && S.tech.scan > 1.2)
    const shown = inStudio && S.shards > 0.3 && !gone
    if (body.current) body.current.visible = shown
    if (!shown) {
      // beams stay in the scene at zero (constant light count → no shader recompiles)
      if (spotL.current) spotL.current.intensity = 0
      if (spotR.current) spotR.current.intensity = 0
      return
    }

    // front-to-back materialisation edge (studio only)
    const edge = inStudio ? -2.75 + 5.6 * clamp01((S.shards - 0.33) / 0.6) : 1e4
    materials.revealPlane.constant = edge - r.position.z

    // wheel spin follows the world speed
    const speed = onRoad ? S.speed + S.scrollVelocity * 25 : 0
    const spin = (speed * dt) / WHEEL_RADIUS
    for (const w of wheels.current) w.o.rotation.x += spin * w.sign

    // lamps
    const on = clamp01(S.headlights)
    for (const m of lamps.current.head) m.emissiveIntensity = 2.4 * on
    for (const m of lamps.current.tail) m.emissiveIntensity = 1.8 * on
    const beam = on * 90 * (inStudio ? 0.6 : 1)
    if (spotL.current) spotL.current.intensity = beam
    if (spotR.current) spotR.current.intensity = beam
    for (let i = 0; i < flares.current.length; i++) {
      const f = flares.current[i]
      if (!f) continue
      // a flare only where the model has real headlamps to sit on
      f.visible = on > 0.01 && lamps.current.head.length > 0
      f.position.copy(flareAt.current[i])
      f.scale.setScalar(0.1 + on * 0.2)
      ;(f.material as SpriteMaterial).opacity = on * 0.5
    }
  })

  const url = getCarUrl()

  return (
    <group ref={root}>
      <group ref={body} visible={false}>
        {url && (
          <ErrorBoundary fallback={<CarUnavailable />}>
            <Suspense fallback={null}>
              <CarModel url={url} wheels={wheels} lamps={lamps} flareAt={flareAt} />
            </Suspense>
          </ErrorBoundary>
        )}
        {[0, 1].map((i) => (
          <sprite key={i} ref={(el) => void (flares.current[i] = el)} visible={false}>
            <spriteMaterial map={glow} color="#e9f0ff" blending={AdditiveBlending} depthWrite={false} transparent toneMapped={false} />
          </sprite>
        ))}
      </group>
      <spotLight ref={spotL} position={[-0.62, 0.68, -2.3]} angle={0.42} penumbra={0.7} distance={60} decay={1.4} intensity={0} color="#eef3ff" />
      <spotLight ref={spotR} position={[0.62, 0.68, -2.3]} angle={0.42} penumbra={0.7} distance={60} decay={1.4} intensity={0} color="#eef3ff" />
    </group>
  )
}

/** The model failed to load: hand the shot to the 2D fallback (sequence → outline). */
function CarUnavailable() {
  useEffect(() => flagStore.set({ carFailed: true }), [])
  return null
}

function CarModel({
  url,
  wheels,
  lamps,
  flareAt,
}: {
  url: string
  wheels: React.RefObject<WheelRig[]>
  lamps: React.RefObject<LampRig>
  flareAt: React.RefObject<[Vector3, Vector3]>
}) {
  const { materials, tier, vehicle } = useScene()
  const gltf = useVehicleGLTF(url)
  const cfg = ASSETS.models.car
  const prepared = useMemo(() => {
    const car = prepareCar(gltf.scene, {
      targetLength: cfg.targetLength,
      paintColour: cfg.paintColour,
      materials: cfg.materials,
      clip: [materials.revealPlane],
      tier: NO.has('glass') ? 'low' : tier, // investigation: 'low' glass has no transmission pass
      rotationY: cfg.transform.rotationY,
    })
    // the scan beam and the digital X-ray live in the car's own materials
    applyCarFx(car.root)
    return car
  }, [gltf, materials, tier, cfg])

  useEffect(() => {
    wheels.current = prepared.wheels.map((o) => ({ o, sign: -1 }))
    lamps.current = prepared.lamps
    // headlamp flares sit at the front corners of the normalised body
    const box = new Box3().setFromObject(prepared.root)
    const y = box.min.y + (box.max.y - box.min.y) * 0.5
    flareAt.current[0].set(box.min.x * 0.72, y, box.min.z + 0.12)
    flareAt.current[1].set(box.max.x * 0.72, y, box.min.z + 0.12)
    vehicle.model = prepared.root
    if (import.meta.env.DEV) console.info('[vehicle] prepared model', prepared.report)
    return () => {
      wheels.current = []
      lamps.current = { head: [], tail: [] }
      vehicle.model = null
    }
  }, [prepared, wheels, lamps, flareAt, vehicle])

  const { scale, offset } = cfg.transform
  return <primitive object={prepared.root} scale={scale} position={offset} />
}
