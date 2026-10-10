import { createPortal, useFrame, useLoader, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import {
  BackSide,
  ShaderMaterial,
  Color,
  CubeCamera,
  DoubleSide,
  HalfFloatType,
  Scene,
  Vector3,
  WebGLCubeRenderTarget,
  type Mesh,
  type MeshBasicMaterial,
  type Texture,
} from 'three'
import { HDRLoader } from 'three/examples/jsm/loaders/HDRLoader.js'
import { S } from '../../../lib/state'
import { NO, gpuprof } from '../../../lib/gpuprof'
import { createSkyMaterial, updateSkyMaterial } from './SkyMaterial'
import { createSoftbox } from './textures'
import { useScene, smooth } from './SceneContext'

export const STUDIO_HDRI = '/hdri/studio_small_09_1k.hdr' // Poly Haven, CC0 — see public/ASSET_LICENSES.md

/**
 * The reflection environment, rendered live into a cube map:
 *  - a real studio HDRI (self-hosted, CC0) as the base, so chrome always has
 *    believable surroundings to reflect;
 *  - art-directed softbox panels on top of it: an emblem rig (key top-left,
 *    fill bottom-right, two tall strips, a floor bounce) and the car-reveal
 *    rig (overhead, long side strips);
 *  - the finale's sky for the road.
 * Panel intensities follow the story, so reflections always match the shot.
 *
 * Performance: the cube map (and its PMREM) is re-rendered only when one of
 * its inputs actually changes — quantised, so a still frame or a steady drive
 * through one chapter costs nothing. (A frames={Infinity} environment re-ran
 * six cube faces + PMREM every frame.)
 */
export function StudioEnvironment() {
  const { tier } = useScene()
  const gl = useThree((s) => s.gl)
  const scene = useThree((s) => s.scene)
  const hdr = useLoader(HDRLoader, STUDIO_HDRI)
  const envScene = useMemo(() => new Scene(), [])
  const target = useMemo(() => new WebGLCubeRenderTarget(tier === 'high' ? 256 : 128, { type: HalfFloatType }), [tier])
  const cubeCamera = useMemo(() => new CubeCamera(0.1, 1000, target), [target])
  const signature = useRef(createSignature(12))
  const sky = useMemo(() => createSkyMaterial(), [])
  const softbox = useMemo(() => createSoftbox(), [])
  const domeMat = useMemo(() => createDomeMaterial(hdr), [hdr])
  const studioDome = useRef<Mesh>(null)
  const panels = useRef<Record<string, Mesh | null>>({})

  useEffect(() => {
    if (import.meta.env.DEV) Object.assign(window, { __env: { envScene, target, cubeCamera } })
    scene.environment = target.texture
    return () => {
      if (scene.environment === target.texture) scene.environment = null
      target.dispose()
    }
  }, [scene, target, envScene, cubeCamera])
  useEffect(
    () => () => {
      sky.dispose()
      softbox.dispose()
      domeMat.dispose()
    },
    [sky, softbox, domeMat],
  )

  useFrame(() => {
    // re-render only on change: compare a quantised signature of every input (no allocation)
    const sig = signature.current
    sig.changed = false
    put(sig, 0, S.studio)
    put(sig, 1, S.revealed)
    put(sig, 2, q(S.ign, 0.02))
    put(sig, 3, q(S.shards, 0.02))
    put(sig, 4, q(S.keyLight, 0.02))
    put(sig, 5, q(S.hover, 0.05))
    put(sig, 6, 0) // sweeps are direct light now (StudioSet), never re-render the cube
    put(sig, 9, q(S.sky, 0.02))
    put(sig, 10, q(S.digital, 0.02))
    if (!sig.changed) return
    if (NO.has('cube') && S.revealed > 0.5) return // investigation: freeze after the reveal
    gpuprof.cube()

    updateSkyMaterial(sky)

    const st = S.studio
    // emblem rig: up from the moment the star exists until the fragments fly
    const emblem = st * S.revealed * (1 - smooth(0.2, 0.6, S.shards))
    // button: a faint version of the same rig so the cap and bezel read before ignition
    const button = st * (0.18 + 0.5 * S.ign) * (1 - S.revealed)
    const car = st * S.keyLight

    if (studioDome.current) {
      const formed = smooth(0.3, 0.9, S.shards)
      const domeDim = 0.5 + 0.5 * (1 - formed)
      // The studio photo is a soft FILL, never a light source: barely there around the
      // button (a glossy face pointing at the viewer reflects what's behind the camera —
      // the HDRI's softboxes turned it flat grey), fuller once the chrome star exists.
      const phase = 0.07 + 0.08 * S.ign * (1 - S.revealed) + 0.4 * S.revealed
      domeMat.uniforms.uGain.value = st * phase * domeDim
      studioDome.current.visible = st > 0.5
    }

    const pn = panels.current
    // the button's rig, calibrated against a correctly cleared cube: highlights trace the
    // bezel's curvature; hover lifts the chrome edge a touch (never the black face)
    setPanel(pn.key, (emblem * 8 + button * 7) * (1 + S.hover * 0.45))
    setPanel(pn.fill, emblem * 1.6 + button * 0.8, COOL)
    setPanel(pn.stripL, emblem * 6 + button * 3.4 * (1 + S.hover * 0.3) + car * 3.6)
    setPanel(pn.stripR, emblem * 4.5 + button * 2.6 * (1 + S.hover * 0.3) + car * 2.6)
    setPanel(pn.bounce, emblem * 0.9 + button * 0.5)
    setPanel(pn.top, st * (0.12 + 1.3 * S.ign) * (0.6 + S.keyLight * 0.45))
    setPanel(pn.back, st * (0.05 + 0.4 * S.ign))

    setPanel(pn.cyan, S.digital * 2.2, CYAN)

    envScene.updateMatrixWorld()
    // The composer runs the renderer with autoClear off. Without an explicit clear, every
    // update painted over the last: the moving glint strip smeared permanently across the
    // cube (+z face averaged 4.6, peak 7.0 = the strip's intensity), which turned the
    // button's face grey ~1 s after load and left moving highlights trailing on the star.
    const autoClear = gl.autoClear
    gl.autoClear = true
    cubeCamera.update(gl, envScene)
    gl.autoClear = autoClear
    target.texture.needsPMREMUpdate = true
  })

  const reg = (name: string) => (el: Mesh | null) => void (panels.current[name] = el)
  const box = { map: softbox, reg }

  return createPortal(
    <>
      {/* real studio surroundings (mirrored X so it reads correctly from inside the dome) */}
      <mesh ref={studioDome} scale={[-50, 50, 50]} rotation={[0, Math.PI * 0.35, 0]}>
        <sphereGeometry args={[1, 64, 32]} />
        <primitive object={domeMat} attach="material" />
      </mesh>
      <mesh material={sky} scale={60}>
        <sphereGeometry args={[1, 32, 16]} />
      </mesh>

      {/* emblem rig (aimed at the emblem) */}
      <Panel name="key" {...box} position={[-3.6, 3.4, 4.6]} scale={[3.2, 2.2]} />
      <Panel name="fill" {...box} position={[3.8, -2.6, 4]} scale={[3, 1.4]} />
      <Panel name="stripL" {...box} position={[-6.5, 0.6, 1.2]} scale={[0.9, 9]} />
      <Panel name="stripR" {...box} position={[6.5, 0.6, 1.2]} scale={[0.7, 9]} />
      <Panel name="bounce" {...box} position={[0, -5, 2.5]} scale={[9, 4]} />

      {/* car rig */}
      <Panel name="top" {...box} position={[0, 9, 0]} scale={[10, 6]} />
      <Panel name="back" {...box} position={[0, 2.5, -10]} scale={[12, 3]} />
      <mesh ref={reg('cyan')} position={[0, 0.4, -30]} scale={[80, 0.25, 1]}>
        <planeGeometry />
        <meshBasicMaterial toneMapped={false} side={DoubleSide} />
      </mesh>
    </>,
    envScene,
  )
}

/** An emissive softbox panel that faces the environment's origin. */
function Panel({
  name,
  reg,
  map,
  position,
  scale,
}: {
  name: string
  reg: (n: string) => (el: Mesh | null) => void
  map: Texture
  position: [number, number, number]
  scale: [number, number]
}) {
  const attach = reg(name)
  return (
    <mesh
      ref={(el) => {
        attach(el)
        el?.lookAt(ORIGIN)
      }}
      position={position}
      scale={[scale[0], scale[1], 1]}
    >
      <planeGeometry />
      <meshBasicMaterial map={map} toneMapped={false} side={DoubleSide} />
    </mesh>
  )
}

/**
 * The studio HDRI as a controlled fill: equirect sampled per pixel, hot spots
 * clamped (its softboxes are hundreds of times brighter than the rest), then
 * scaled by a scripted gain.
 */
function createDomeMaterial(map: Texture) {
  return new ShaderMaterial({
    side: BackSide,
    depthWrite: false,
    toneMapped: false,
    uniforms: { uMap: { value: map }, uGain: { value: 0 }, uCap: { value: 2.5 } },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
    `,
    fragmentShader: /* glsl */ `
      uniform sampler2D uMap;
      uniform float uGain, uCap;
      varying vec2 vUv;
      void main() { gl_FragColor = vec4(min(texture2D(uMap, vUv).rgb, vec3(uCap)) * uGain, 1.0); }
    `,
  })
}

const q = (v: number, step: number) => Math.round(v / step)

type Signature = Float64Array & { changed: boolean }
function createSignature(n: number) {
  const a = new Float64Array(n).fill(NaN) as Signature
  a.changed = false
  return a
}
function put(sig: Signature, i: number, v: number) {
  if (sig[i] !== v) {
    sig[i] = v
    sig.changed = true
  }
}
function setPanel(mesh: Mesh | null | undefined, k: number, tint?: Color) {
  if (!mesh) return
  const mat = mesh.material as MeshBasicMaterial
  if (tint) mat.color.copy(tint).multiplyScalar(k)
  else mat.color.setScalar(k)
  mesh.visible = k > 0.002
}
const ORIGIN = new Vector3(0, 0, 0)
const CYAN = new Color('#7fe3ff')
const COOL = new Color('#dfe8ff')
