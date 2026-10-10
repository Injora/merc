import { useFrame, useLoader, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import { AdditiveBlending, BufferAttribute, BufferGeometry, FileLoader, ShaderMaterial, Vector3, type Group, type LineSegments, type Mesh, type Points } from 'three'
import { ASSETS } from '../../../../config/assets'
import { S } from '../../../../lib/state'
import { useScene } from '../SceneContext'
import { CAR_HALF } from './carFx'
import { hud, placeCallouts } from './hud'
import { edgesGeometry, getTwin, graphGeometry, nodesGeometry, pointsGeometry } from './twinData'

const TWIN_URL = ASSETS.models.car.tech
const SQ = '#ifndef SQ_DEFINED\n#define SQ_DEFINED\n#define sq(x) ((x) * (x))\n#endif\n'

/** Uniforms shared by every layer of the twin, filled from S.tech once per frame. */
const TWIN = {
  uEdges: { value: 0 },
  uPoints: { value: 0 },
  uNodes: { value: 0 },
  uScanZ: { value: -9 },
  uScanOn: { value: 0 },
  uFollow: { value: 0 },
  uStream: { value: 0 },
  uFlow: { value: 0 },
  uVoxel: { value: 0 },
  uSearch: { value: 0 },
  uSolve: { value: 0 },
  uRaw: { value: 0 },
  uCluster: { value: 0 },
}

function edgeMaterial() {
  return new ShaderMaterial({
    uniforms: TWIN,
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    vertexShader: /* glsl */ `
      ${SQ}
      attribute float aCls;
      uniform float uScanZ, uScanOn, uFollow;
      varying float vA;
      void main() {
        // following the scan gate: an edge exists only where the gate has passed
        float passed = smoothstep(-0.02, 0.35, uScanZ - position.z);
        vA = mix(1.0, passed, uFollow);
        vA += exp(-sq((position.z - uScanZ) / 0.06)) * uScanOn * 1.6;
        vA *= aCls > 0.5 && aCls < 1.5 ? 0.7 : 1.0;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vA *= clamp(1.35 - (-mv.z) * 0.06, 0.25, 1.0);
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uEdges;
      varying float vA;
      void main() {
        float a = vA * uEdges * 0.42;
        gl_FragColor = vec4(vec3(0.72, 0.84, 1.0) * a, a);
      }
    `,
  })
}

/**
 * The surface samples, through the CS and ML chapters:
 *  on the car → snapped into an ordered voxel map (DATA STRUCTURES) → scattered
 *  as raw, noisy signals → gathered into their k-means clusters (FEATURES).
 */
function pointMaterial(dpr: number) {
  return new ShaderMaterial({
    uniforms: { ...TWIN, uDpr: { value: dpr } },
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    vertexShader: /* glsl */ `
      attribute vec3 aNormal;
      attribute vec3 aCentroid;
      attribute float aSeed;
      uniform float uVoxel, uRaw, uCluster, uScanZ, uFollow, uDpr;
      varying float vB;
      varying float vHot;
      vec3 h3(float s) { return fract(sin(vec3(s * 91.7, s * 47.3, s * 13.1)) * 43758.5453) - 0.5; }
      void main() {
        vec3 p = position;
        // DATA STRUCTURES: every sample snaps to the centre of its cell — a spatial map of the car
        float cell = 0.16;
        vec3 snapped = (floor(p / cell) + 0.5) * cell;
        p = mix(p, snapped, uVoxel);
        // RAW SIGNALS: noisy observations (a fixed offset per sample: noise, not motion)
        p += h3(aSeed * 13.7) * 0.42 * uRaw;
        // FEATURES: each sample gathers to its cluster's centroid, keeping a little spread
        p = mix(p, aCentroid + (p - aCentroid) * 0.14, uCluster);
        float passed = smoothstep(-0.02, 0.35, uScanZ - position.z);
        // gathered points overlap: dim each one so a cluster reads as a feature, not a bloom
        vB = mix(1.0, passed, uFollow) * (0.55 + 0.45 * aSeed) * (1.0 - uCluster * 0.8);
        vHot = uVoxel * 0.35 + uCluster * 0.3;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_PointSize = 2.4 * uDpr * (1.0 + vHot * 0.8) * clamp(6.0 / -mv.z, 0.75, 2.2);
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uPoints;
      varying float vB;
      varying float vHot;
      void main() {
        float r = length(gl_PointCoord - 0.5);
        float a = smoothstep(0.5, 0.15, r) * vB * uPoints;
        vec3 c = mix(vec3(0.7, 0.8, 0.95), vec3(0.62, 0.86, 1.0), clamp(vHot, 0.0, 1.0)) * (0.55 + vHot * 0.6);
        gl_FragColor = vec4(c * a, a);
      }
    `,
  })
}

function nodeMaterial(dpr: number) {
  return new ShaderMaterial({
    uniforms: { ...TWIN, uDpr: { value: dpr } },
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    vertexShader: /* glsl */ `
      attribute float aSeed;
      uniform float uNodes, uDpr;
      varying float vA;
      void main() {
        vA = smoothstep(aSeed * 0.75, aSeed * 0.75 + 0.25, uNodes);
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = 15.0 * uDpr * clamp(7.0 / -mv.z, 0.8, 1.6);
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      varying float vA;
      void main() {
        float r = length(gl_PointCoord - 0.5);
        float ring = smoothstep(0.035, 0.0, abs(r - 0.36));
        float dot = smoothstep(0.12, 0.0, r);
        float a = (ring * 0.55 + dot) * vA;
        gl_FragColor = vec4(vec3(0.78, 0.9, 1.0) * a, a);
      }
    `,
  })
}

/**
 * The structural graph, in two readings:
 *  DATA — directed streams: dashes travel each edge from nose to tail;
 *  ALGORITHMS — a Dijkstra search: the frontier reaches each edge in the order
 *  the search settled it (bright), explored edges dim, unexplored stay faint;
 *  then the shortest path lights, a pulse running along it.
 */
function graphMaterial() {
  return new ShaderMaterial({
    uniforms: TWIN,
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    vertexShader: /* glsl */ `
      attribute float aT;
      attribute float aSeed;
      attribute float aVisit;
      attribute float aPath;
      varying float vT;
      varying float vSeed;
      varying float vVisit;
      varying float vPath;
      void main() { vT = aT; vSeed = aSeed; vVisit = aVisit; vPath = aPath; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
    `,
    fragmentShader: /* glsl */ `
      ${SQ}
      uniform float uStream, uFlow, uSearch, uSolve;
      varying float vT;
      varying float vSeed;
      varying float vVisit;
      varying float vPath;
      void main() {
        // DATA: a faint line with dashes flowing nose → tail
        float dash = smoothstep(0.75, 0.95, fract(vT * 1.5 - uFlow * 2.0 + vSeed));
        float stream = (0.22 + dash * 1.8) * uStream;
        // ALGORITHMS: the frontier
        float reached = vVisit >= 0.0 ? smoothstep(vVisit, vVisit + 0.02, uSearch) : 0.0;
        float front = vVisit >= 0.0 ? exp(-sq((uSearch - vVisit) / 0.04)) : 0.0;
        float explored = reached * (0.3 + front * 2.2) * (1.0 - uSolve * 0.75);
        float idle = 0.08 * step(0.001, uSearch);
        // … the solution: the shortest path, with a pulse running along it
        float path = vPath * uSolve * (1.4 + exp(-sq((fract(uSolve * 1.6 - vT * 0.25) - 0.5) / 0.08)) * 1.2);
        float a = max(stream, max(explored + idle * (1.0 - reached), path));
        vec3 c = mix(vec3(0.62, 0.8, 1.0), vec3(0.9, 0.96, 1.0), vPath * uSolve);
        gl_FragColor = vec4(c * a, a);
      }
    `,
  })
}

/** The scan gate: a fine rectangular frame of light, perpendicular to the car. */
function gateGeometry() {
  const w = 1.32
  const h = 1.62
  const t = 0.09
  const v: number[] = []
  const seg = (a: number[], b: number[]) => v.push(...a, ...b)
  for (const [x, y, sx, sy] of [
    [-w, 0, 1, 1],
    [w, 0, -1, 1],
    [-w, h, 1, -1],
    [w, h, -1, -1],
  ]) {
    seg([x, y, 0], [x + sx * t * 2, y, 0])
    seg([x, y, 0], [x, y + sy * t * 2, 0])
  }
  seg([-w, 0.78, 0], [w, 0.78, 0])
  const g = new BufferGeometry()
  g.setAttribute('position', new BufferAttribute(new Float32Array(v), 3))
  return g
}

function gridMaterial() {
  return new ShaderMaterial({
    uniforms: { uGrid: { value: 0 } },
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    vertexShader: /* glsl */ `
      varying vec2 vP;
      void main() { vec4 w = modelMatrix * vec4(position, 1.0); vP = w.xz; gl_Position = projectionMatrix * viewMatrix * w; }
    `,
    fragmentShader: /* glsl */ `
      uniform float uGrid;
      varying vec2 vP;
      float hair(float x, float px) { float w = fwidth(x) * px; return 1.0 - smoothstep(0.0, w, abs(x)); }
      void main() {
        vec2 g = vP / 0.5;
        float minor = max(hair(fract(g.x + 0.5) - 0.5, 0.9), hair(fract(g.y + 0.5) - 0.5, 0.9));
        vec2 G = vP / 2.0;
        float major = max(hair(fract(G.x + 0.5) - 0.5, 1.2), hair(fract(G.y + 0.5) - 0.5, 1.2));
        float fade = 1.0 - smoothstep(2.5, 7.5, length(vP));
        float a = (minor * 0.18 + major * 0.42) * fade * uGrid;
        gl_FragColor = vec4(vec3(0.62, 0.74, 0.9) * a, a);
      }
    `,
  })
}

/** [x, y, z, class] targets for the opening's callouts, in scan order (nose → tail) */
const ANCHOR_TARGETS: [number, number, number, number][] = [
  [0.72, 0.66, -2.3, 0], // SENSING — the light signature at the nose
  [0.45, 1.2, -0.95, 1], // PERCEPTION — the windscreen
  [0.2, 1.42, -0.05, 0], // PREDICTION — the roofline
  [1.0, 0.72, 0.65, 0], // OPTIMIZATION — the body side
  [0.98, 0.42, 1.4, 2], // DECISION SYSTEMS — the rear axle
]

/**
 * The car's digital twin: feature edges (GEOMETRY), the structural graph with
 * its streams and its search (DATA, ALGORITHMS), the surface samples (DATA
 * STRUCTURES, RAW SIGNALS, FEATURES), the scan gate, the studio's floor grid —
 * and the opening's callouts, revealed as the scan passes each point.
 */
export function Twin() {
  const { tier } = useScene()
  const camera = useThree((s) => s.camera)
  const size = useThree((s) => s.size)
  const buf = useLoader(FileLoader, TWIN_URL, (l) => l.setResponseType('arraybuffer')) as ArrayBuffer
  const dpr = Math.min(window.devicePixelRatio || 1, 2)

  const res = useMemo(() => {
    const d = getTwin(buf, tier === 'high' ? 14000 : 6000)
    const t = d.t
    const anchors = ANCHOR_TARGETS.map(([x, y, z, cls]) => {
      let best = Infinity
      const out = new Vector3()
      const q = t.header.q
      for (let i = 0; i < t.header.points; i++) {
        if (t.ptCls[i] !== cls) continue
        const dd = (t.ptPos[i * 3] / q - x) ** 2 + (t.ptPos[i * 3 + 1] / q - y) ** 2 + (t.ptPos[i * 3 + 2] / q - z) ** 2
        if (dd < best) {
          best = dd
          out.set(t.ptPos[i * 3] / q, t.ptPos[i * 3 + 1] / q, t.ptPos[i * 3 + 2] / q)
        }
      }
      return out
    })
    return {
      edges: edgesGeometry(t),
      points: pointsGeometry(d.pos, d.nrm, d.cls, d.centroids, d.label),
      nodes: nodesGeometry(d.nodes),
      graph: graphGeometry(d.nodes, d.graph),
      gate: gateGeometry(),
      edgeMat: edgeMaterial(),
      pointMat: pointMaterial(dpr),
      nodeMat: nodeMaterial(dpr),
      graphMat: graphMaterial(),
      gateMat: new ShaderMaterial({
        uniforms: { uA: { value: 0 } },
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
        vertexShader: 'void main() { gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
        fragmentShader: 'uniform float uA; void main() { gl_FragColor = vec4(vec3(0.72, 0.86, 1.0) * uA, uA); }',
      }),
      gridMat: gridMaterial(),
      anchors,
    }
  }, [buf, tier, dpr])

  useEffect(
    () => () => {
      for (const g of [res.edges, res.points, res.nodes, res.graph, res.gate]) g.dispose()
      for (const m of [res.edgeMat, res.pointMat, res.nodeMat, res.graphMat, res.gateMat, res.gridMat]) m.dispose()
    },
    [res],
  )

  const edges = useRef<LineSegments>(null)
  const points = useRef<Points>(null)
  const nodes = useRef<Points>(null)
  const graph = useRef<LineSegments>(null)
  const gate = useRef<Group>(null)
  const grid = useRef<Mesh>(null)
  const scratch = useMemo(
    () => ({ v: new Vector3(), slots: ANCHOR_TARGETS.map(() => ({ x: 0, y: 0, on: false })), rank: new Int8Array(ANCHOR_TARGETS.length), vis: new Float32Array(ANCHOR_TARGETS.length) }),
    [],
  )

  useFrame(() => {
    const t = S.tech
    TWIN.uEdges.value = t.edges
    TWIN.uPoints.value = t.points
    TWIN.uNodes.value = t.nodes
    TWIN.uScanZ.value = t.scan * CAR_HALF
    TWIN.uScanOn.value = t.scanOn
    TWIN.uFollow.value = t.xray > 0 && t.ghost < 1 && t.scanOn > 0.001 ? 1 : 0
    TWIN.uStream.value = t.stream
    TWIN.uFlow.value = S.progress * 40 // dashes advance with the scroll — never with a clock
    TWIN.uVoxel.value = t.voxel
    TWIN.uSearch.value = t.search
    TWIN.uSolve.value = t.solve
    TWIN.uRaw.value = t.raw
    TWIN.uCluster.value = t.cluster
    if (edges.current) edges.current.visible = t.edges > 0.001
    if (points.current) points.current.visible = t.points > 0.001
    if (nodes.current) nodes.current.visible = t.nodes > 0.001
    if (graph.current) graph.current.visible = t.stream > 0.001 || t.search > 0.001 || t.solve > 0.001
    if (gate.current) {
      gate.current.visible = t.scanOn > 0.001
      gate.current.position.z = t.scan * CAR_HALF
      res.gateMat.uniforms.uA.value = t.scanOn * 0.85
    }
    if (grid.current) {
      grid.current.visible = t.grid > 0.001
      res.gridMat.uniforms.uGrid.value = t.grid
    }

    // the opening's callouts: each one appears as the scan passes its point, then fades
    const scanZ = t.scan * CAR_HALF
    for (let i = 0; i < res.anchors.length; i++) {
      const passed = (scanZ - res.anchors[i].z) / 0.3
      const after = (scanZ - res.anchors[i].z - 2.2) / 0.9
      scratch.vis[i] = t.labels * Math.min(1, Math.max(0, passed)) * (1 - Math.min(1, Math.max(0, after)))
    }
    placeCallouts(hud.els.machine, res.anchors, scratch.vis, camera, size.width, size.height, scratch.v, scratch.slots, scratch.rank)
  })

  return (
    <group>
      <lineSegments ref={edges} geometry={res.edges} material={res.edgeMat} visible={false} frustumCulled={false} renderOrder={2} />
      <points ref={points} geometry={res.points} material={res.pointMat} visible={false} frustumCulled={false} renderOrder={3} />
      <lineSegments ref={graph} geometry={res.graph} material={res.graphMat} visible={false} frustumCulled={false} renderOrder={4} />
      <points ref={nodes} geometry={res.nodes} material={res.nodeMat} visible={false} frustumCulled={false} renderOrder={4} />
      <group ref={gate} visible={false}>
        <lineSegments geometry={res.gate} material={res.gateMat} renderOrder={5} />
      </group>
      <mesh ref={grid} material={res.gridMat} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.003, 0]} visible={false} renderOrder={1}>
        <planeGeometry args={[18, 18]} />
      </mesh>
    </group>
  )
}
