import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import {
  AdditiveBlending,
  Color,
  LatheGeometry,
  MeshPhysicalMaterial,
  ShaderMaterial,
  Vector2,
  Vector3,
  type Group,
  type Mesh,
  type MeshBasicMaterial,
} from 'three'
import { S } from '../../../lib/state'
import { createIgnitionLegend, createSpunMetal } from './textures'
import { useScene, smooth } from './SceneContext'

export const EMBLEM_POS = new Vector3(0, 1.15, 0)
export const BEZEL_RADIUS = 0.42

/**
 * The START ENGINE button as a physical object: a spun-metal cap with an
 * engraved, back-lit legend, its own chrome bezel, a recessed well, a status
 * halo and an instrument sweep around it. The emblem is not part of this
 * object; it only appears once ignition fires (see <Emblem/>).
 */
export function Ignition() {
  const { materials } = useScene()
  const group = useRef<Group>(null)
  const cap = useRef<Group>(null)
  const halo = useRef<Mesh>(null)
  const pulse = useRef<Mesh>(null)
  const gauge = useRef<Mesh>(null)
  const bezel = useRef<Mesh>(null)
  const size = useThree((s) => s.size)
  const camera = useThree((s) => s.camera)

  const legend = useMemo(() => createIgnitionLegend(), [])
  const spun = useMemo(() => createSpunMetal(), [])
  const faceMat = useMemo(
    () =>
      // Glossy black lacquer, NOT metal: a metallic face is all reflection, so it turned grey
      // as soon as the key light and the studio panels came up. A dielectric reflects ~4%,
      // stays black, and shows one crisp clearcoat highlight.
      new MeshPhysicalMaterial({
        color: new Color('#050607'),
        metalness: 0,
        roughness: 0.2,
        bumpMap: spun, // concentric machining, barely there
        bumpScale: 0.08,
        clearcoat: 1,
        clearcoatRoughness: 0.035,
        emissive: new Color('#f4f7ff'),
        emissiveMap: legend,
        emissiveIntensity: 0,
        envMapIntensity: 1,
      }),
    [legend, spun],
  )
  // the cap's machined side: dark brushed metal, so it reads as an edge, not a second white ring
  const sideMat = useMemo(() => new MeshPhysicalMaterial({ color: '#2a2d31', metalness: 1, roughness: 0.34, envMapIntensity: 0.75 }), [])
  const capSide = useMemo(() => {
    // bevelled cap profile, revolved
    const pts = [
      [0.0, 0.0], [0.34, 0.0], [0.352, 0.006], [0.356, 0.03], [0.352, 0.058], [0.342, 0.066], [0.33, 0.07],
    ].map(([x, y]) => new Vector2(x, y))
    const g = new LatheGeometry(pts, 128)
    g.rotateX(Math.PI / 2)
    return g
  }, [])
  const gaugeMat = useMemo(
    () =>
      new ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
        uniforms: { uSweep: { value: 0 }, uIntensity: { value: 0 }, uIdle: { value: 0 } },
        vertexShader: /* glsl */ `
          varying vec2 vPos;
          void main() { vPos = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
        `,
        fragmentShader: /* glsl */ `
          uniform float uSweep, uIntensity, uIdle;
          varying vec2 vPos;
          // anti-aliased band: 1 inside |x| < w, soft edge one pixel wide
          float band(float x, float w) { float aa = fwidth(x) * 0.75; return 1.0 - smoothstep(w - aa, w + aa, abs(x)); }
          void main() {
            float r = length(vPos);
            float a = atan(vPos.y, vPos.x);
            float t = mod(radians(225.0) - a, 6.2831853) / radians(270.0);
            float inArc = band(t - 0.5, 0.5);
            // fine track
            float track = band(r - 0.505, 0.0015) * inArc;
            // minor ticks (54) and major ticks (9), measured in arc units so they stay crisp
            float minorX = (fract(t * 54.0 + 0.5) - 0.5) / 54.0 * 2.4;
            float majorX = (fract(t * 9.0 + 0.5) - 0.5) / 9.0 * 2.4;
            float minor = band(minorX, 0.0022) * band(r - 0.524, 0.007) * inArc;
            float major = band(majorX, 0.003) * band(r - 0.53, 0.014) * inArc;
            float lit = smoothstep(uSweep + 0.004, uSweep - 0.004, t);
            float head = exp(-abs(t - uSweep) * 60.0) * step(0.001, uSweep) * inArc;
            float v = track * (0.14 * uIdle + lit * 0.9)
                    + minor * (0.10 * uIdle + lit * 0.6)
                    + major * (0.22 * uIdle + lit * 0.95)
                    + head * 2.4 * (track + minor + major);
            gl_FragColor = vec4(vec3(0.84, 0.9, 1.0) * v * uIntensity, 1.0);
          }
        `,
      }),
    [],
  )

  useEffect(
    () => () => {
      legend.dispose()
      spun.dispose()
      faceMat.dispose()
      sideMat.dispose()
      capSide.dispose()
      gaugeMat.dispose()
    },
    [legend, spun, faceMat, sideMat, capSide, gaugeMat],
  )

  const projected = useRef(new Vector3())
  const edge = useRef(new Vector3())
  const lastSize = useRef(0)

  useFrame((state) => {
    const g = group.current
    if (!g) return
    const morph = S.morph
    g.visible = morph < 0.995 && S.studio > 0.5
    if (!g.visible) return
    const t = state.clock.elapsedTime
    const breathe = 0.5 + 0.5 * Math.sin(t * 1.6)
    const intro = S.intro

    // the bezel belongs to the button; at reveal the emblem's ring takes over at the same radius
    if (bezel.current) bezel.current.visible = !(S.revealed > 0.5 && morph > 0.01)

    // press travel + morph: the cap sinks back and dissolves into the emblem's hub
    if (cap.current) {
      const shrink = 1 - smooth(0.0, 0.55, morph)
      cap.current.position.z = -0.024 * S.pressed - 0.12 * smooth(0, 0.6, morph) + S.hover * 0.004
      cap.current.scale.setScalar(Math.max(0.001, shrink))
    }
    // crisp white legend: steady (no breathing), below the bloom threshold until ignition
    faceMat.emissiveIntensity = (0.82 + S.hover * 0.1 + S.ign * 0.45) * intro * (1 - smooth(0, 0.35, morph))
    if (halo.current) {
      const m = halo.current.material as MeshBasicMaterial
      // a hairline of cool light: faint at idle, a little stronger on hover, one brief
      // flash with the press and the gauge sweep (S.gauge returns to 0 by itself)
      const k = (0.18 + breathe * 0.06 + S.hover * 0.45 + S.pressed * 0.5 + S.gauge * 1.4) * intro * (1 - smooth(0.05, 0.4, morph))
      m.color.setRGB(0.85 * k, 0.92 * k, 1.0 * k)
    }
    if (pulse.current) {
      // the ignition pulse: one hairline of light leaves the bezel as the engine catches
      const p = S.ignPulse
      pulse.current.visible = p > 0.001 && p < 0.999
      pulse.current.scale.setScalar(1 + p * 7.5)
      const k = (1 - p) * (1 - p) * 0.9
      ;(pulse.current.material as MeshBasicMaterial).color.setRGB(0.78 * k, 0.88 * k, 1.0 * k)
    }
    gaugeMat.uniforms.uSweep.value = S.gauge
    gaugeMat.uniforms.uIdle.value = intro * (0.6 + breathe * 0.4)
    gaugeMat.uniforms.uIntensity.value = (1 - smooth(0.1, 0.45, morph)) * (1 + S.ign)

    // publish the button's on-screen size so the accessible HTML hit-target matches it
    if (morph < 0.01) {
      projected.current.copy(EMBLEM_POS).project(camera)
      edge.current.set(EMBLEM_POS.x + BEZEL_RADIUS, EMBLEM_POS.y, EMBLEM_POS.z).project(camera)
      const px = Math.abs(edge.current.x - projected.current.x) * size.width
      if (Math.abs(px - lastSize.current) > 1) {
        lastSize.current = px
        document.documentElement.style.setProperty('--ignition-size', `${Math.round(px * 1.1)}px`)
      }
    }
  })

  return (
    <group ref={group} position={EMBLEM_POS}>
      {/* recessed well */}
      <mesh position={[0, 0, -0.03]}>
        <circleGeometry args={[0.41, 96]} />
        <meshStandardMaterial color="#040405" roughness={0.55} metalness={0.4} />
      </mesh>
      {/* chrome bezel — same radius and section as the emblem ring it hands over to */}
      <mesh ref={bezel} material={materials.chrome}>
        <torusGeometry args={[BEZEL_RADIUS, 0.0131, 32, 240]} />
      </mesh>
      <group ref={cap}>
        <mesh geometry={capSide} material={sideMat} />
        <mesh position={[0, 0, 0.0705]} material={faceMat}>
          <circleGeometry args={[0.331, 128]} />
        </mesh>
      </group>
      <mesh ref={halo} position={[0, 0, 0.002]}>
        <ringGeometry args={[0.361, 0.3635, 192]} />
        <meshBasicMaterial toneMapped={false} transparent blending={AdditiveBlending} depthWrite={false} />
      </mesh>
      <mesh ref={pulse} position={[0, 0, -0.005]} visible={false}>
        <ringGeometry args={[0.42, 0.4232, 256]} />
        <meshBasicMaterial toneMapped={false} transparent blending={AdditiveBlending} depthWrite={false} />
      </mesh>
      <mesh ref={gauge} material={gaugeMat} position={[0, 0, -0.01]}>
        <ringGeometry args={[0.49, 0.56, 256, 1]} />
      </mesh>
    </group>
  )
}
