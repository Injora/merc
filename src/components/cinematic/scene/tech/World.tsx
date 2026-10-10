import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import { AdditiveBlending, BufferAttribute, BufferGeometry, ShaderMaterial, Vector4, type Group } from 'three'
import { S } from '../../../../lib/state'
import { LANE, SCENE, hash } from './compute'

const SQ = '#ifndef SQ_DEFINED\n#define SQ_DEFINED\n#define sq(x) ((x) * (x))\n#endif\n'
const ROAD_HALF = LANE * 1.5
const additive = { transparent: true, depthWrite: false, blending: AdditiveBlending } as const

/**
 * Computer vision, drawn: a procedural road scene around the car (no images).
 *  1 · a sensor sweep turns once around the car and the scene appears as points —
 *      road edges, lane markings, three vehicles, debris, roadside landmarks;
 *  2 · the points resolve into objects (boxes, lines);
 *  3 · an occupancy map: occupied and free cells on the road;
 *  4 · (optimisation) the contours of the cost field over the same scene.
 * The scene and its cost live in compute.ts, shared with the trajectories.
 */
export function World() {
  const res = useMemo(() => {
    const cloud = cloudGeometry()
    const boxes = boxGeometry()
    const floor = floorMaterial()
    return { cloud, boxes, cloudMat: cloudMaterial(), boxMat: boxMaterial(), floor, sweep: sweepGeometry(), sweepMat: sweepMaterial() }
  }, [])
  useEffect(
    () => () => {
      for (const d of [res.cloud, res.boxes, res.cloudMat, res.boxMat, res.floor, res.sweep, res.sweepMat]) d.dispose()
    },
    [res],
  )
  const group = useRef<Group>(null)
  const sweep = useRef<Group>(null)

  useFrame(() => {
    const t = S.tech
    const on = t.env > 0.001 || t.costField > 0.001
    if (group.current) group.current.visible = on
    if (!on) return
    for (const m of [res.cloudMat, res.boxMat, res.floor]) {
      const u = m.uniforms
      u.uEnv.value = t.env
      u.uSweep.value = t.sweep
      u.uResolve.value = t.resolve
      u.uOcc.value = t.occ
      u.uCost.value = t.costField
    }
    if (sweep.current) {
      sweep.current.visible = t.sweep > 0.001 && t.sweep < 0.999
      sweep.current.rotation.y = -t.sweep * Math.PI * 2
      res.sweepMat.uniforms.uA.value = t.env
    }
  })

  return (
    <group ref={group} visible={false}>
      <mesh material={res.floor} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.006, -11]} renderOrder={1}>
        <planeGeometry args={[19, 40]} />
      </mesh>
      <points geometry={res.cloud} material={res.cloudMat} frustumCulled={false} renderOrder={3} />
      <lineSegments geometry={res.boxes} material={res.boxMat} frustumCulled={false} renderOrder={4} />
      <group ref={sweep}>
        <lineSegments geometry={res.sweep} material={res.sweepMat} renderOrder={5} />
      </group>
    </group>
  )
}

const shared = () => ({
  uEnv: { value: 0 },
  uSweep: { value: 0 },
  uResolve: { value: 0 },
  uOcc: { value: 0 },
  uCost: { value: 0 },
})

/** the sweep angle of a point: 0 straight ahead, turning clockwise seen from above */
const SWEEP_GLSL = /* glsl */ `
  float sweepAt(vec3 p) { return fract(atan(p.x, -p.z) / 6.2831853 + 1.0); }
`

function cloudGeometry() {
  const pos: number[] = []
  const kind: number[] = []
  let k = 0
  const r = () => hash(k++, 41)
  // object surfaces
  for (const b of SCENE) {
    const n = b.kind === 'vehicle' ? 900 : b.kind === 'obstacle' ? 140 : 160
    for (let i = 0; i < n; i++) {
      // a random face (top + four sides; the underside is never seen)
      const f = Math.floor(r() * 5)
      const u = r() - 0.5
      const v = r() - 0.5
      let x = 0
      let y = 0
      let z = 0
      if (f === 0) [x, y, z] = [u, 0.5, v]
      else if (f === 1) [x, y, z] = [0.5, v, u]
      else if (f === 2) [x, y, z] = [-0.5, v, u]
      else if (f === 3) [x, y, z] = [u, v, 0.5]
      else [x, y, z] = [u, v, -0.5]
      pos.push(b.c.x + x * b.s.x, b.c.y + y * b.s.y, b.c.z + z * b.s.z)
      kind.push(b.kind === 'landmark' ? 2 : 1)
    }
  }
  // road edges and lane markings: points along the ground
  for (let z = 8; z > -30; z -= 0.22) {
    for (const x of [-ROAD_HALF, ROAD_HALF]) {
      pos.push(x + (r() - 0.5) * 0.06, 0.03, z)
      kind.push(0)
    }
    for (const x of [-LANE / 2, LANE / 2]) {
      if (((-z + 50) % 9) < 3) {
        pos.push(x + (r() - 0.5) * 0.04, 0.03, z)
        kind.push(0)
      }
    }
  }
  const g = new BufferGeometry()
  g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3))
  g.setAttribute('aKind', new BufferAttribute(new Float32Array(kind), 1))
  return g
}

function cloudMaterial() {
  return new ShaderMaterial({
    uniforms: { ...shared(), uDpr: { value: Math.min(window.devicePixelRatio || 1, 2) } },
    ...additive,
    vertexShader: /* glsl */ `
      ${SQ}
      ${SWEEP_GLSL}
      attribute float aKind;
      uniform float uEnv, uSweep, uResolve, uDpr;
      varying float vA;
      void main() {
        float u = sweepAt(position);
        float seen = step(u, uSweep);
        float edge = exp(-sq((uSweep - u) * 30.0)) * seen;
        float d = length(position.xz);
        float far = 1.0 - smoothstep(18.0, 30.0, d);
        // once resolved into objects, the raw points step back
        vA = uEnv * seen * far * (0.6 + edge * 1.6) * mix(1.0, 0.28, uResolve);
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = 2.6 * uDpr * clamp(16.0 / -mv.z, 0.9, 1.8);
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      varying float vA;
      void main() {
        float r = length(gl_PointCoord - 0.5);
        float a = smoothstep(0.5, 0.1, r) * vA;
        gl_FragColor = vec4(vec3(0.68, 0.84, 1.0) * a, a);
      }
    `,
  })
}

/** resolved structure: a box per object, the road edges and lane markings as lines */
function boxGeometry() {
  const pos: number[] = []
  const kind: number[] = []
  const seg = (a: number[], b: number[], k: number) => {
    pos.push(...a, ...b)
    kind.push(k, k)
  }
  for (const b of SCENE) {
    const hx = b.s.x / 2
    const hy = b.s.y / 2
    const hz = b.s.z / 2
    const c = [b.c.x, b.c.y, b.c.z]
    const P = (sx: number, sy: number, sz: number) => [c[0] + sx * hx, c[1] + sy * hy, c[2] + sz * hz]
    const k = b.kind === 'landmark' ? 2 : 1
    for (const sy of [-1, 1]) {
      seg(P(-1, sy, -1), P(1, sy, -1), k)
      seg(P(1, sy, -1), P(1, sy, 1), k)
      seg(P(1, sy, 1), P(-1, sy, 1), k)
      seg(P(-1, sy, 1), P(-1, sy, -1), k)
    }
    for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) seg(P(sx, -1, sz), P(sx, 1, sz), k)
  }
  for (const x of [-ROAD_HALF, ROAD_HALF]) seg([x, 0.03, 8], [x, 0.03, -30], 0)
  for (const x of [-LANE / 2, LANE / 2]) for (let z = 4; z > -30; z -= 9) seg([x, 0.03, z], [x, 0.03, z - 3], 0)
  const g = new BufferGeometry()
  g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3))
  g.setAttribute('aKind', new BufferAttribute(new Float32Array(kind), 1))
  return g
}

function boxMaterial() {
  return new ShaderMaterial({
    uniforms: shared(),
    ...additive,
    vertexShader: /* glsl */ `
      attribute float aKind;
      varying float vKind;
      varying vec3 vW;
      void main() { vKind = aKind; vW = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
    `,
    fragmentShader: /* glsl */ `
      uniform float uEnv, uResolve;
      varying float vKind;
      varying vec3 vW;
      void main() {
        float far = 1.0 - smoothstep(18.0, 30.0, length(vW.xz));
        float a = uEnv * uResolve * far * (vKind > 0.5 && vKind < 1.5 ? 0.85 : 0.42);
        vec3 c = vKind > 0.5 && vKind < 1.5 ? vec3(0.86, 0.94, 1.0) : vec3(0.6, 0.76, 0.95);
        gl_FragColor = vec4(c * a, a);
      }
    `,
  })
}

/** occupancy (cells on the road) and the cost field's contours, in one floor shader */
function floorMaterial() {
  const boxes = SCENE.filter((b) => b.kind !== 'landmark').map((b) => new Vector4(b.c.x, b.c.z, b.s.x / 2, b.s.z / 2))
  return new ShaderMaterial({
    uniforms: { ...shared(), uBox: { value: boxes } },
    ...additive,
    vertexShader: /* glsl */ `
      varying vec2 vP;
      void main() { vec4 w = modelMatrix * vec4(position, 1.0); vP = w.xz; gl_Position = projectionMatrix * viewMatrix * w; }
    `,
    fragmentShader: /* glsl */ `
      uniform float uOcc, uCost, uEnv;
      uniform vec4 uBox[${boxes.length}];
      varying vec2 vP;
      float hair(float x, float px) { float w = fwidth(x) * px; return 1.0 - smoothstep(0.0, w, abs(x)); }
      // the same cost as compute.ts: closeness to anything in the scene, and to the road edges
      float cost(vec2 p) {
        float c = 0.0;
        for (int i = 0; i < ${boxes.length}; i++) {
          vec2 d = max(abs(p - uBox[i].xy) - uBox[i].zw, 0.0);
          c += exp(-dot(d, d) / 1.4) * 4.0;
        }
        float e = max(0.0, abs(p.x) - ${(ROAD_HALF - 1.2).toFixed(2)});
        return c + e * e * 3.0;
      }
      void main() {
        float road = 1.0 - smoothstep(${ROAD_HALF.toFixed(2)}, ${(ROAD_HALF + 0.4).toFixed(2)}, abs(vP.x));
        float far = 1.0 - smoothstep(18.0, 28.0, length(vP));
        // OCCUPANCY: 0.9 m cells; a cell is occupied if its centre lies within an object's footprint (+0.45 m)
        vec2 cell = (floor(vP / 0.9) + 0.5) * 0.9;
        float occ = 0.0;
        for (int i = 0; i < ${boxes.length}; i++) {
          vec2 d = abs(cell - uBox[i].xy) - uBox[i].zw - 0.45;
          occ = max(occ, step(max(d.x, d.y), 0.0));
        }
        vec2 f = fract(vP / 0.9) - 0.5;
        float border = max(hair(abs(f.x) - 0.47, 1.0), hair(abs(f.y) - 0.47, 1.0));
        float dot = 1.0 - smoothstep(0.035, 0.06, length(f));
        float occA = (occ * (0.16 + border * 0.5) + (1.0 - occ) * dot * 0.35) * uOcc * road;
        // COST: its contour lines
        float c = cost(vP);
        float lines = hair(fract(c * 2.2 + 0.5) - 0.5, 1.0) * smoothstep(0.02, 0.4, c);
        float costA = lines * 0.5 * uCost * road;
        float a = (occA + costA) * far;
        vec3 col = occ > 0.5 && uOcc > 0.0 ? vec3(0.8, 0.9, 1.0) : vec3(0.55, 0.75, 1.0);
        gl_FragColor = vec4(col * a, a);
      }
    `,
  })
}

function sweepGeometry() {
  const g = new BufferGeometry()
  g.setAttribute('position', new BufferAttribute(new Float32Array([0, 0.05, 0, 0, 0.05, -26]), 3))
  g.setAttribute('aT', new BufferAttribute(new Float32Array([0, 1]), 1))
  return g
}

function sweepMaterial() {
  return new ShaderMaterial({
    uniforms: { uA: { value: 0 } },
    ...additive,
    vertexShader: 'attribute float aT; varying float vT; void main() { vT = aT; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: 'uniform float uA; varying float vT; void main() { float a = uA * (1.0 - vT) * 0.9; gl_FragColor = vec4(vec3(0.75, 0.9, 1.0) * a, a); }',
  })
}
