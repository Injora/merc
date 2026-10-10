import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import { AdditiveBlending, BufferAttribute, BufferGeometry, Color, ShaderMaterial, type Group, type Mesh } from 'three'
import { hash } from './tech/compute'
import { S } from '../../../lib/state'
import { samplePalette } from './palettes'
import { createSkyMaterial, updateSkyMaterial } from './SkyMaterial'

const CEILING = 7.5

/**
 * The finale: the computational core opens into a vast light grid — a floor and
 * a ceiling of hairlines receding to one focal point on the horizon. It starts
 * sparse (8 m) and gains depth as the visitor scrolls (S.digital: 4 m, then
 * 2 m lines fade in); one pulse of light travels down it towards the viewer
 * (S.tech.gridPulse). As the camera travels, selected intersections light and
 * connect along the grid lines, near to far (S.tech.gridNet): the ecosystem the
 * visitor is invited into. Lines are drawn at a constant on-screen width with
 * screen-space derivatives and fade with distance, so the grid never moirés.
 */
export function Finale() {
  const group = useRef<Group>(null)
  const sky = useRef<Mesh>(null)

  const res = useMemo(() => ({ skyMat: createSkyMaterial(), floor: gridMaterial(0), ceiling: gridMaterial(1), net: gridNetwork(), netMat: gridNetMaterial() }), [])
  useEffect(
    () => () => {
      for (const d of [res.skyMat, res.floor, res.ceiling, res.net.lines, res.net.nodes, res.netMat]) d.dispose()
    },
    [res],
  )

  useFrame((state) => {
    const g = group.current
    if (!g) return
    const visible = S.road > 0.5
    g.visible = visible
    if (!visible) return
    const pal = samplePalette(S.sky)
    updateSkyMaterial(res.skyMat)
    if (sky.current) sky.current.position.copy(state.camera.position)
    const camZ = state.camera.position.z
    for (const m of [res.floor, res.ceiling]) {
      const u = m.uniforms
      u.uDense.value = S.digital
      u.uPulseZ.value = camZ - 6 - (1 - S.tech.gridPulse) * 260
      u.uPulseOn.value = S.tech.gridPulse > 0.001 && S.tech.gridPulse < 0.999 ? 1 : 0
      u.uDim.value = 1 - S.dim * 0.8
      u.uLane.value = 1 - Math.min(1, S.dim * 1.6) // the lane steps aside for the title
      ;(u.uFog.value as Color).copy(pal.fog)
    }
    res.netMat.uniforms.uNet.value = S.tech.gridNet
    res.netMat.uniforms.uDim.value = 1 - S.dim * 0.7
  })

  return (
    <group ref={group} visible={false}>
      <mesh ref={sky} material={res.skyMat} scale={450} renderOrder={-1} frustumCulled={false}>
        <sphereGeometry args={[1, 32, 16]} />
      </mesh>
      <mesh material={res.floor} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, -180]} frustumCulled={false}>
        <planeGeometry args={[420, 460]} />
      </mesh>
      <mesh material={res.ceiling} rotation={[Math.PI / 2, 0, 0]} position={[0, CEILING, -180]} frustumCulled={false}>
        <planeGeometry args={[420, 460]} />
      </mesh>
      <lineSegments geometry={res.net.lines} material={res.netMat} frustumCulled={false} renderOrder={2} />
      <points geometry={res.net.nodes} material={res.netMat} frustumCulled={false} renderOrder={3} />
    </group>
  )
}

function gridMaterial(ceiling: number) {
  return new ShaderMaterial({
    uniforms: {
      uDense: { value: 0 },
      uPulseZ: { value: -999 },
      uPulseOn: { value: 0 },
      uDim: { value: 1 },
      uLane: { value: 1 },
      uCeil: { value: ceiling },
      uFog: { value: new Color('#000') },
    },
    vertexShader: /* glsl */ `
      varying vec3 vW;
      void main() {
        vec4 w = modelMatrix * vec4(position, 1.0);
        vW = w.xyz;
        gl_Position = projectionMatrix * viewMatrix * w;
      }
    `,
    fragmentShader: /* glsl */ `
#ifndef SQ_DEFINED
#define SQ_DEFINED
#define sq(x) ((x) * (x))
#endif
      uniform float uDense, uPulseZ, uPulseOn, uDim, uCeil, uLane;
      uniform vec3 uFog;
      varying vec3 vW;
      float hair(float x, float px) { float w = fwidth(x) * px; return 1.0 - smoothstep(0.0, w, abs(x)); }
      float grid(vec2 p, float s, float px) { vec2 g = p / s; return max(hair(fract(g.x + 0.5) - 0.5, px), hair(fract(g.y + 0.5) - 0.5, px)); }
      void main() {
        vec2 p = vW.xz;
        float d = distance(vW, cameraPosition);
        // sparse first; finer lines arrive with depth
        float g8 = grid(p, 8.0, 1.15);
        float g4 = grid(p, 4.0, 0.95) * smoothstep(0.25, 0.6, uDense);
        float g2 = grid(p, 2.0, 0.8) * smoothstep(0.6, 1.0, uDense);
        float lines = max(g8, max(g4 * 0.55, g2 * 0.3));
        // the central lane: the line everything converges on
        float lane = hair(p.x, 1.4) * (1.0 - uCeil) * uLane;
        // the pulse: a band of light travelling towards the viewer
        float pulse = exp(-sq((vW.z - uPulseZ) / 5.0)) * uPulseOn;
        float far = 1.0 - smoothstep(30.0, 230.0, d);
        float a = (lines * (0.22 + pulse * 1.3) + lane * (0.35 + pulse)) * far * (uCeil > 0.5 ? 0.38 : 1.0);
        vec3 col = vec3(0.6, 0.82, 1.0) * a;
        col = mix(col, uFog, smoothstep(120.0, 260.0, d)) * uDim;
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  })
}

/** Selected grid intersections (8 m lattice) and the grid-line segments joining neighbours; each lights in turn, near → far. */
function gridNetwork() {
  const sel = new Map<string, number>()
  const pts: number[] = []
  const times: number[] = []
  let i = 0
  for (let z = -16; z >= -168; z -= 8)
    for (let x = -24; x <= 24; x += 8) {
      if (hash(i++, 51) > 0.42 && !(x === 0 && z > -40)) continue
      const t = Math.min(1, (-z - 16) / 150) * 0.85 + hash(i, 52) * 0.1
      sel.set(`${x},${z}`, t)
      pts.push(x, 0.02, z)
      times.push(t)
    }
  const lp: number[] = []
  const lt: number[] = []
  const la: number[] = []
  for (const [k, t0] of sel) {
    const [x, z] = k.split(',').map(Number)
    for (const [nx, nz] of [[x + 8, z], [x, z - 8]]) {
      const t1 = sel.get(`${nx},${nz}`)
      if (t1 === undefined) continue
      lp.push(x, 0.02, z, nx, 0.02, nz)
      lt.push(0, 1)
      la.push(Math.max(t0, t1), Math.max(t0, t1))
    }
  }
  const lines = new BufferGeometry()
  lines.setAttribute('position', new BufferAttribute(new Float32Array(lp), 3))
  lines.setAttribute('aT', new BufferAttribute(new Float32Array(lt), 1))
  lines.setAttribute('aStart', new BufferAttribute(new Float32Array(la), 1))
  const nodes = new BufferGeometry()
  nodes.setAttribute('position', new BufferAttribute(new Float32Array(pts), 3))
  nodes.setAttribute('aT', new BufferAttribute(new Float32Array(pts.length / 3).fill(-1), 1))
  nodes.setAttribute('aStart', new BufferAttribute(new Float32Array(times), 1))
  return { lines, nodes }
}

function gridNetMaterial() {
  return new ShaderMaterial({
    uniforms: { uNet: { value: 0 }, uDim: { value: 1 }, uDpr: { value: Math.min(window.devicePixelRatio || 1, 2) } },
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    vertexShader: /* glsl */ `
      attribute float aT;
      attribute float aStart;
      uniform float uDpr;
      varying float vT;
      varying float vStart;
      varying float vD;
      void main() {
        vT = aT;
        vStart = aStart;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vD = -mv.z;
        gl_PointSize = 9.0 * uDpr * clamp(20.0 / -mv.z, 0.3, 1.4);
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uNet, uDim;
      varying float vT;
      varying float vStart;
      varying float vD;
      void main() {
        float grow = clamp((uNet - vStart) / 0.08, 0.0, 1.0);
        float far = 1.0 - smoothstep(60.0, 200.0, vD);
        float a;
        if (vT < 0.0) {
          // a node: a bright point once reached
          float r = length(gl_PointCoord - 0.5);
          a = (smoothstep(0.5, 0.0, r) * 0.5 + smoothstep(0.12, 0.0, r)) * smoothstep(vStart, vStart + 0.02, uNet);
        } else {
          if (vT > grow) discard;
          a = 0.55 + 0.6 * (1.0 - grow);
        }
        a *= far * uDim;
        gl_FragColor = vec4(vec3(0.75, 0.9, 1.0) * a, a);
      }
    `,
  })
}
