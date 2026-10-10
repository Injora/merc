import { ContactShadows, MeshReflectorMaterial, useTexture } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  AdditiveBlending,
  RepeatWrapping,
  Vector2,
  Vector3,
  BufferAttribute,
  BufferGeometry,
  type Group,
  type Mesh,
  type MeshBasicMaterial,
  type Points,
  type PointsMaterial,
  type RectAreaLight,
  type SpotLight,
  type Object3D,
  type Texture,
} from 'three'
import { RectAreaLightUniformsLib } from 'three/examples/jsm/lights/RectAreaLightUniformsLib.js'
import { S } from '../../../lib/state'
import { createGlow, createShadow } from './textures'
import { useScene, clamp01, smooth } from './SceneContext'

/**
 * The black studio: a dark, softly reflective floor, a pool of overhead
 * light, a few motes of dust caught in it, and the key/rim lights that sculpt
 * the emblem and the car.
 */
export function StudioSet() {
  const { tier } = useScene()
  const group = useRef<Group>(null)
  const key = useRef<SpotLight>(null)
  const sweepLight = useRef<RectAreaLight>(null)
  const rimL = useRef<SpotLight>(null)
  const rimR = useRef<SpotLight>(null)
  const pool = useRef<Mesh>(null)
  const horizon = useRef<Mesh>(null)
  const shadow = useRef<Mesh>(null)
  const dust = useRef<Points>(null)

  // CC0 concrete (Poly Haven) — breaks the reflection up like a real studio floor
  const [floorRough, floorNormal] = useTexture(FLOOR_MAPS, (ts) => {
    for (const t of ts as Texture[]) {
      t.wrapS = t.wrapT = RepeatWrapping
      t.repeat.set(10, 10)
      t.anisotropy = 8
    }
  })
  const glow = useMemo(() => createGlow(), [])
  const shadowTex = useMemo(() => createShadow(), [])
  const dustGeo = useMemo(() => {
    const n = tier === 'high' ? 160 : 60
    const g = new BufferGeometry()
    const p = new Float32Array(n * 3)
    let seed = 3
    const rand = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646
    for (let i = 0; i < n; i++) {
      p[i * 3] = (rand() - 0.5) * 3.2
      p[i * 3 + 1] = rand() * 2.6
      p[i * 3 + 2] = (rand() - 0.5) * 3.2
    }
    g.setAttribute('position', new BufferAttribute(p, 3))
    return g
  }, [tier])

  useEffect(
    () => () => {
      glow.dispose()
      shadowTex.dispose()
      dustGeo.dispose()
    },
    [glow, shadowTex, dustGeo],
  )

  useFrame((state, dt) => {
    const visible = S.studio > 0.5
    if (group.current) group.current.visible = visible

    // The sweep: one tall, narrow softbox travelling across the chrome as real direct light
    // (LTC area light) — a crisp, continuous highlight with no environment re-render.
    if (sweepLight.current) {
      const p = Math.max(S.sweep, S.ignSweep)
      const L = sweepLight.current
      L.position.set(-2.6 + 5.2 * p, 1.15, 2.3)
      L.lookAt(SWEEP_TARGET)
      L.intensity = visible ? Math.sin(Math.PI * Math.min(1, p)) * 14 : 0
    }
    if (!visible) {
      // lights stay in the scene (constant light count → no shader recompiles), just dark
      if (key.current) key.current.intensity = 0
      if (rimL.current) rimL.current.intensity = 0
      if (rimR.current) rimR.current.intensity = 0
      return
    }
    const t = state.clock.elapsedTime
    // the floor glow breathes only while the button waits; once the star exists the set is perfectly still
    const breathe = 1 - (1 - S.revealed) * (0.15 - Math.sin(t * 1.3) * 0.15)
    const ign = S.ign

    if (key.current) key.current.intensity = ((6 + ign * 70) * (0.5 + S.keyLight) + S.hover * 3) * S.intro * (tier === 'high' ? 1 : 0.45)
    // once the car exists, the rims shape it
    const car = smooth(0.3, 0.9, S.shards)
    if (rimL.current) rimL.current.intensity = (ign * 55 + car * 40) * Math.max(S.keyLight, 0.35 * car) * 1.6
    if (rimR.current) rimR.current.intensity = (ign * 40 + car * 30) * Math.max(S.keyLight, 0.35 * car) * 1.6

    if (pool.current) {
      const m = pool.current.material as MeshBasicMaterial
      m.opacity = (0.16 + ign * 0.22 + S.hover * 0.08) * breathe * (1 - smooth(0.3, 0.9, S.shards) * 0.6) * S.intro * (tier === 'high' ? 1 : 0.55)
    }
    if (horizon.current) {
      const h = S.horizon
      horizon.current.scale.set(0.01 + h * 34, 0.006 + h * 0.006, 1)
      const m = horizon.current.material as MeshBasicMaterial
      m.opacity = Math.min(1, h * 1.2) * (1 - Math.min(1, S.shards * 2.5)) * 0.8
      horizon.current.visible = h > 0.001
    }
    if (shadow.current) {
      const m = shadow.current.material as MeshBasicMaterial
      m.opacity = clamp01((S.shards - 0.3) * 1.6) * 0.9
    }
    if (dust.current) {
      const m = dust.current.material as PointsMaterial
      m.opacity = (0.18 + ign * 0.35) * (1 - smooth(0.3, 0.9, S.shards) * 0.7)
      dust.current.rotation.y += dt * 0.012
      dust.current.position.y = Math.sin(t * 0.2) * 0.05
    }
  })

  return (
    <>
    <group ref={group}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]}>
        <planeGeometry args={[80, 80]} />
        {tier === 'high' ? (
          <MeshReflectorMaterial
            resolution={1024}
            blur={[800, 260]}
            mixBlur={1}
            mixStrength={1.8}
            mixContrast={1.1}
            roughness={0.9}
            depthScale={1.1}
            minDepthThreshold={0.35}
            maxDepthThreshold={1.4}
            color="#0b0b0c"
            metalness={0.55}
            roughnessMap={floorRough}
            normalMap={floorNormal}
            normalScale={FLOOR_NORMAL_SCALE}
            distortionMap={floorRough}
            distortion={0.035}
            envMapIntensity={0.12}
            mirror={0}
          />
        ) : (
          // light tier: no reflector — a dark satin floor that only catches the key light
          <meshStandardMaterial color="#060607" roughness={0.85} metalness={0} envMapIntensity={0.03} />
        )}
      </mesh>

      {/* soft pool of light on the floor (FX layer: never captured by the contact-shadow bake) */}
      <mesh ref={fx(pool)} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.002, 0]} scale={[7, 7, 1]}>
        <planeGeometry />
        <meshBasicMaterial map={glow} transparent depthWrite={false} blending={AdditiveBlending} color="#cfd8e6" />
      </mesh>

      <BakedContactShadows />

      {/* soft ambient shadow beneath the vehicle (contact shadow is baked separately) */}
      <mesh ref={fx(shadow)} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.004, 0]} scale={[2.7, 6.1, 1]}>
        <planeGeometry />
        <meshBasicMaterial map={shadowTex} transparent depthWrite={false} opacity={0} />
      </mesh>

      {/* dashboard-like light line that opens across the darkness on ignition */}
      <mesh ref={fx(horizon)} position={[0, 1.15, -7]}>
        <planeGeometry />
        <meshBasicMaterial map={glow} color={[3, 3.2, 3.6]} toneMapped={false} transparent depthWrite={false} blending={AdditiveBlending} />
      </mesh>

      <points ref={fx(dust)} geometry={dustGeo}>
        <pointsMaterial map={glow} size={0.022} sizeAttenuation transparent depthWrite={false} blending={AdditiveBlending} color="#dfe6ef" opacity={0.2} />
      </points>

    </group>
    {/* lights live outside the toggled group: three.js compiles a program per visible-light count */}
    <rectAreaLight ref={sweepLight} width={0.32} height={4.5} intensity={0} color="#f4f7ff" />
    <spotLight ref={key} position={[0, 7, 1.5]} angle={0.42} penumbra={1} decay={2} intensity={0} color="#f1f4ff" />
    <spotLight ref={rimL} position={[-5, 3.2, -4]} angle={0.5} penumbra={1} decay={2} intensity={0} color="#dfe8ff" />
    <spotLight ref={rimR} position={[5.5, 2.6, 4.5]} angle={0.5} penumbra={1} decay={2} intensity={0} color="#fff3e6" />
    </>
  )
}

/**
 * Decals, glows and dust live on render layer FX_LAYER: the main camera sees
 * them, the contact-shadow camera (layer 0 only) does not — otherwise the
 * floor decals were baked into the shadow as a dark slab.
 */
export const FX_LAYER = 1
function fx<T extends Object3D>(ref: React.RefObject<T | null>) {
  return (el: T | null) => {
    ref.current = el
    el?.layers.set(FX_LAYER)
  }
}

RectAreaLightUniformsLib.init()
const SWEEP_TARGET = new Vector3(0, 1.15, 0)

const FLOOR_MAPS = ['/textures/concrete_floor_worn_001_rough_1k.jpg', '/textures/concrete_floor_worn_001_nor_gl_1k.jpg']
const FLOOR_NORMAL_SCALE = new Vector2(0.14, 0.14)

/**
 * Contact shadow under the car. Baked ONCE, behind the loader: the warm-up
 * holds the fully formed car for a frame (S.shards ≈ 1), which is the bake.
 * In the film it is never re-baked and never pops in: its plane is clipped by
 * the car's own reveal plane, so the shadow materialises front-to-back with
 * the bodywork, and fades in with it.
 */
function BakedContactShadows() {
  const { materials } = useScene()
  const [bake, setBake] = useState(0)
  const group = useRef<Group>(null)
  const baked = useRef(false)
  const plane = useRef<MeshBasicMaterial | null>(null)
  useFrame(() => {
    const g = group.current
    if (!g) return
    // the one bake: the first frame the full car stands in the studio (the warm-up)
    if (!baked.current && S.studio > 0.5 && S.shards > 0.985) {
      baked.current = true
      setBake(1)
    }
    if (!plane.current) {
      g.traverse((o) => {
        const m = (o as Mesh).material as MeshBasicMaterial | undefined
        if (m && (m as MeshBasicMaterial).map && !plane.current) {
          plane.current = m
          m.clippingPlanes = [materials.revealPlane]
          m.needsUpdate = true
        }
      })
    }
    const on = S.studio > 0.5 && S.shards > 0.3
    g.visible = on
    if (plane.current) plane.current.opacity = 0.9 * smooth(0.3, 0.6, S.shards)
  })
  return (
    <group ref={group} visible={false}>
      <ContactShadows key="contact" frames={1} position={[0, 0.003, 0]} scale={[3.2, 6.4]} resolution={512} blur={2.2} far={1.2} opacity={0.9} color="#000000" userData={{ bake }} />
    </group>
  )
}
