import { PerformanceMonitor } from '@react-three/drei'
import { Canvas, advance, useFrame, useThree } from '@react-three/fiber'
import { gsap } from 'gsap'
import { Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { ACESFilmicToneMapping, SRGBColorSpace, type Material, type Mesh, type Object3D, type Texture, type WebGLRenderer } from 'three'
import type { Tier } from '../../lib/device'
import { S, flagStore } from '../../lib/state'
import { Director } from './scene/Director'
import { Effects } from './scene/Effects'
import { Emblem } from './scene/Emblem'
import { Ignition } from './scene/Ignition'
import { createMaterials } from './scene/materials'
import { SceneContext, useScene, type SceneShared } from './scene/SceneContext'
import { probeFrame } from '../../lib/probe'
import { Shards } from './scene/Shards'
import { StudioEnvironment } from './scene/StudioEnvironment'
import { StudioSet } from './scene/StudioSet'
import { Vehicle } from './scene/Vehicle'
import { Finale } from './scene/Finale'
import { Branches } from './scene/tech/Branches'
import { Mind } from './scene/tech/Mind'
import { Twin } from './scene/tech/Twin'
import { World } from './scene/tech/World'

/**
 * The WebGL stage. Lazy-loaded as its own chunk (three.js + scene code), so
 * the event page and the ignition overlay never wait for it.
 */
export default function Stage({ tier, active, onContextLost }: { tier: Tier; active: boolean; onContextLost: () => void }) {
  const [dprMax, setDprMax] = useState(tier === 'high' ? 1.75 : 1.25)
  // decided once, by device tier — never toggled while the film runs (see PerformanceMonitor below)
  const effects = tier === 'high'

  const shared = useMemo<SceneShared>(
    () => ({ tier, materials: createMaterials(), emblemParts: { arms: [], ring: null }, vehicle: { root: null } }),
    [tier],
  )
  useEffect(() => () => shared.materials.dispose(), [shared])

  return (
    <Canvas
      className="stage-canvas"
      dpr={[1, dprMax]}
      frameloop="never"
      gl={{ antialias: !effects, powerPreference: 'high-performance', alpha: false, stencil: false }}
      camera={{ fov: 35, near: 0.02, far: 1000, position: [0, 1.15, 4.5] }}
      onCreated={({ gl, scene }) => {
        gl.localClippingEnabled = true
        if (import.meta.env.DEV) Object.assign(window, { __gl: gl, __scene: scene })
        gl.toneMapping = ACESFilmicToneMapping
        gl.outputColorSpace = SRGBColorSpace
        gl.domElement.addEventListener('webglcontextlost', (e) => {
          e.preventDefault()
          onContextLost()
        })
      }}
      aria-hidden
    >
      {/* adaptive quality: lowers the pixel ratio only. Toggling post-processing at runtime would
          change every material's output colour space and recompile all shaders mid-scroll. */}
      <PerformanceMonitor
        flipflops={3}
        onDecline={() => setDprMax((d) => Math.max(1, d - 0.25))}
        onIncline={() => setDprMax((d) => Math.min(tier === 'high' ? 1.75 : 1.25, d + 0.25))}
        onFallback={() => setDprMax(1)}
      />
      <SceneContext.Provider value={shared}>
        <TickerDriver active={active} />
        <Director />
        <Suspense fallback={null}>
          <StudioEnvironment />
          <StudioSet />
          <Ignition />
          <Emblem />
          <Shards />
          <Vehicle />
          <Twin />
          <Mind />
          <World />
          <Branches />
          <Finale />
          <ReadySignal />
        </Suspense>
        <Effects enabled={effects} />
      </SceneContext.Provider>
    </Canvas>
  )
}

/**
 * Warm-up, hidden behind the loader. Every set, beat and effect the film will
 * ever show is forced on for a frame so WebGL compiles all its programs
 * up-front, then every texture in the scene graph (hidden ones included) is
 * uploaded with initTexture. Nothing compiles or uploads mid-scroll.
 * (Profiling showed 600–900 ms stalls the first time the contact shadow
 * and the road first appeared.) The technical layers (S.tech) are all
 * switched on for the warm-up too.
 */
const WARM_KEYS = ['studio', 'road', 'shards', 'digital', 'headlights', 'sky', 'revealed', 'morph'] as const
const WARM_STEPS: Partial<Record<(typeof WARM_KEYS)[number], number>>[] = [
  { studio: 1, revealed: 1, morph: 1, shards: 0.99, road: 1, sky: 1, headlights: 1 },
  { studio: 0, shards: 0, sky: 2, digital: 0.6 },
]
/** every technical layer on at once for the warm-up (the X-ray state compiles the car's dissolve path too) */
const WARM_TECH: Partial<typeof S.tech> = {
  grid: 1, scan: 0, scanOn: 1, xray: 1, edges: 1, points: 1, nodes: 1, stream: 1, voxel: 0.5, search: 0.5, solve: 0.5,
  raw: 0.5, cluster: 0.8, model: 0.5, prune: 0.5, predict: 0.5, fan: 1, env: 1, sweep: 0.5, resolve: 1, occ: 1,
  cands: 1, evaluate: 0.5, opt: 0.5, costField: 1, path: 0.5, pipe: 1, signal: 0.5, net: 0.5, netPulse: 0.5,
  gridNet: 0.5, gridPulse: 0.5,
}

function ReadySignal() {
  const gl = useThree((s) => s.gl)
  const scene = useThree((s) => s.scene)
  const frames = useRef(0)
  const saved = useRef<Partial<Record<(typeof WARM_KEYS)[number], number>>>({})
  const savedTech = useRef<typeof S.tech>({ ...S.tech })
  useFrame(() => {
    const f = ++frames.current
    const step = Math.floor((f - 1) / 2) // two frames per step: one to mount/compile, one to settle
    if (f === 1) {
      for (const k of WARM_KEYS) saved.current[k] = S[k]
      savedTech.current = { ...S.tech }
      Object.assign(S.tech, WARM_TECH)
    }
    if ((f - 1) % 2 === 0 && step < WARM_STEPS.length) Object.assign(S, WARM_STEPS[step])
    const done = WARM_STEPS.length * 2 + 1
    if (f === done) {
      Object.assign(S, saved.current)
      Object.assign(S.tech, savedTech.current)
      S.distance = 0
      uploadAllTextures(scene, gl)
    } else if (f === done + 2) {
      flagStore.set({ stageReady: true })
    }
  })
  return null
}

/** Upload every texture referenced by any material in the graph, visible or not. */
function uploadAllTextures(root: Object3D, gl: WebGLRenderer) {
  const seen = new Set<Texture>()
  const visit = (v: unknown) => {
    if (v && (v as Texture).isTexture && !seen.has(v as Texture)) {
      seen.add(v as Texture)
      gl.initTexture(v as Texture)
    }
  }
  root.traverse((o) => {
    const mats = (o as Mesh).material
    if (!mats) return
    for (const m of Array.isArray(mats) ? mats : [mats]) {
      for (const value of Object.values(m)) visit(value)
      const uniforms = (m as Material & { uniforms?: Record<string, { value: unknown }> }).uniforms
      if (uniforms) for (const u of Object.values(uniforms)) visit(u.value)
    }
  })
}

/**
 * One requestAnimationFrame for everything: R3F does not run its own loop
 * (frameloop="never"); it is advanced from GSAP's ticker, which also drives
 * Lenis and ScrollTrigger. Ticker order is Lenis → ScrollTrigger → timeline
 * → render, so every frame renders the story state of that same tick.
 * Off-screen, nothing is rendered at all.
 */
function TickerDriver({ active }: { active: boolean }) {
  const gl = useThree((s) => s.gl)
  const camera = useThree((s) => s.camera)
  const { emblemParts } = useScene()
  useEffect(() => {
    if (!active) return
    const tick = () => {
      advance(performance.now())
      probeFrame(gl, emblemParts.root, camera) // no-op unless ?probe
    }
    gsap.ticker.add(tick)
    return () => gsap.ticker.remove(tick)
  }, [active, gl, camera, emblemParts])
  return null
}
