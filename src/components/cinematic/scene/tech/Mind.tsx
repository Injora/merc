import { useFrame, useLoader, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import { AdditiveBlending, BufferAttribute, BufferGeometry, FileLoader, ShaderMaterial, Vector3, type Group } from 'three'
import { ASSETS } from '../../../../config/assets'
import { S } from '../../../../lib/state'
import { useScene } from '../SceneContext'
import { CANDIDATES, CHOSEN, PATH_END, PATH_START, candidateX, hash, networkLayout, scoreCandidates, wobble } from './compute'
import { hud, placeCallouts } from './hud'
import { getTwin } from './twinData'

const SQ = '#ifndef SQ_DEFINED\n#define SQ_DEFINED\n#define sq(x) ((x) * (x))\n#endif\n'
const FAN = 4 // uncertainty curves around the prediction

/** the pipeline's stages, arcing over the car from the tail (sensing) to the nose (control) */
const STAGES = [new Vector3(0, 2.25, 1.9), new Vector3(0, 2.7, 0.95), new Vector3(0, 2.88, -0.05), new Vector3(0, 2.7, -1.05), new Vector3(0, 2.25, -2.0)]
/** where the sensors sit on the car (illustrative placements) */
const SENSORS = [new Vector3(0, 0.55, -2.36), new Vector3(0.96, 1.0, -0.62), new Vector3(-0.96, 1.0, -0.62), new Vector3(0, 1.36, -0.45), new Vector3(0, 0.95, 2.3), new Vector3(1.0, 0.55, 1.6)]
const PATH_ORIGIN = new Vector3(0, 0.04, PATH_START)

const U = {
  uCluster: { value: 0 },
  uModel: { value: 0 },
  uPrune: { value: 0 },
  uPredict: { value: 0 },
  uFan: { value: 0 },
  uCands: { value: 0 },
  uEval: { value: 0 },
  uOpt: { value: 0 },
  uPath: { value: 0 },
  uPipe: { value: 0 },
  uSignal: { value: 0 },
  uDpr: { value: 1 },
}

const additive = { transparent: true, depthWrite: false, blending: AdditiveBlending } as const

/**
 * The machine's mind, as the film draws it (a conceptual visualisation):
 *  - FEATURES: a marker at each k-means centroid of the car's samples;
 *  - THE MODEL: a small layered network above the car, fed by those features,
 *    activating layer by layer, then pruned to its strong connections;
 *  - PREDICTION: a trajectory projected ahead of the nose, with its uncertainty;
 *  - OPTIMISATION: candidate trajectories, scored by a real cost over the scene
 *    (compute.ts) and discarded worst-first; the chosen one loses its wobble
 *    while a marker travels it;
 *  - AI SYSTEMS: sensors → sensing → perception → prediction → planning →
 *    control → the chosen trajectory, each stage lit only when the signal arrives.
 */
export function Mind() {
  const { tier } = useScene()
  const camera = useThree((s) => s.camera)
  const size = useThree((s) => s.size)
  const buf = useLoader(FileLoader, ASSETS.models.car.tech, (l) => l.setResponseType('arraybuffer')) as ArrayBuffer

  const res = useMemo(() => {
    const d = getTwin(buf, tier === 'high' ? 14000 : 6000)
    const centroids: Vector3[] = []
    for (let c = 0; c < d.centroids.length / 3; c++) centroids.push(new Vector3(d.centroids[c * 3], d.centroids[c * 3 + 1], d.centroids[c * 3 + 2]))
    U.uDpr.value = Math.min(window.devicePixelRatio || 1, 2)
    return {
      features: featureGeometry(centroids),
      net: networkGeometry(centroids),
      paths: pathGeometry(),
      marker: markerGeometry(),
      pipe: pipelineGeometry(),
      featureMat: ringPoints('uCluster', 26),
      netMat: netMaterial(),
      netNodeMat: netNodeMaterial(),
      pathMat: pathMaterial(),
      markerMat: markerMaterial(),
      pipeMat: pipeMaterial(),
      pipeNodeMat: pipeNodeMaterial(),
    }
  }, [buf, tier])
  useEffect(
    () => () => {
      for (const g of [res.features, res.net.lines, res.net.nodes, res.paths, res.marker, res.pipe.lines, res.pipe.nodes]) g.dispose()
      for (const m of [res.featureMat, res.netMat, res.netNodeMat, res.pathMat, res.markerMat, res.pipeMat, res.pipeNodeMat]) m.dispose()
    },
    [res],
  )

  const featuresG = useRef<Group>(null)
  const netG = useRef<Group>(null)
  const pathsG = useRef<Group>(null)
  const pipeG = useRef<Group>(null)
  const scratch = useMemo(() => ({ v: new Vector3(), slots: STAGES.map(() => ({ x: 0, y: 0, on: false })), rank: new Int8Array(STAGES.length), vis: new Float32Array(STAGES.length) }), [])

  useFrame(() => {
    const t = S.tech
    U.uCluster.value = t.cluster
    U.uModel.value = t.model
    U.uPrune.value = t.prune
    U.uPredict.value = t.predict
    U.uFan.value = t.fan
    U.uCands.value = t.cands
    U.uEval.value = t.evaluate
    U.uOpt.value = t.opt
    U.uPath.value = t.path
    U.uPipe.value = t.pipe
    U.uSignal.value = t.signal
    const ms = Math.min(1, Math.max(0, t.opt))
    ;(res.markerMat.uniforms.uMarker.value as Vector3).set(candidateX(CHOSEN, ms), 0.06, PATH_START + (PATH_END - PATH_START) * ms)
    if (featuresG.current) featuresG.current.visible = t.cluster > 0.001 && t.model < 0.999
    if (netG.current) netG.current.visible = t.model > 0.001
    if (pathsG.current) pathsG.current.visible = t.predict > 0.001 || t.cands > 0.001 || t.path > 0.001
    if (pipeG.current) pipeG.current.visible = t.pipe > 0.001

    // the pipeline's stages are named when the signal reaches them
    for (let i = 0; i < STAGES.length; i++) scratch.vis[i] = t.pipe * Math.min(1, Math.max(0, (t.signal - STAGE_TIME[i]) / 0.05))
    placeCallouts(hud.els.pipeline, STAGES, scratch.vis, camera, size.width, size.height, scratch.v, scratch.slots, scratch.rank, 46)
  })

  return (
    <group>
      <group ref={featuresG} visible={false}>
        <points geometry={res.features} material={res.featureMat} frustumCulled={false} renderOrder={5} />
      </group>
      <group ref={netG} visible={false}>
        <lineSegments geometry={res.net.lines} material={res.netMat} frustumCulled={false} renderOrder={6} />
        <points geometry={res.net.nodes} material={res.netNodeMat} frustumCulled={false} renderOrder={7} />
      </group>
      <group ref={pathsG} visible={false}>
        <lineSegments geometry={res.paths} material={res.pathMat} frustumCulled={false} renderOrder={6} />
        <points geometry={res.marker} material={res.markerMat} frustumCulled={false} renderOrder={7} />
      </group>
      <group ref={pipeG} visible={false}>
        <lineSegments geometry={res.pipe.lines} material={res.pipeMat} frustumCulled={false} renderOrder={6} />
        <points geometry={res.pipe.nodes} material={res.pipeNodeMat} frustumCulled={false} renderOrder={7} />
      </group>
    </group>
  )
}

/* ── FEATURES ───────────────────────────────────────────────────────────── */

function featureGeometry(centroids: Vector3[]) {
  const g = new BufferGeometry()
  g.setAttribute('position', new BufferAttribute(new Float32Array(centroids.flatMap((c) => c.toArray())), 3))
  return g
}

function ringPoints(uniform: 'uCluster', px: number) {
  return new ShaderMaterial({
    uniforms: U,
    ...additive,
    vertexShader: /* glsl */ `
      uniform float ${uniform}, uDpr;
      varying float vA;
      void main() {
        vA = smoothstep(0.6, 1.0, ${uniform});
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = ${px.toFixed(1)} * uDpr * clamp(9.0 / -mv.z, 0.75, 1.6);
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      varying float vA;
      void main() {
        float r = length(gl_PointCoord - 0.5);
        float ring = smoothstep(0.04, 0.0, abs(r - 0.4));
        gl_FragColor = vec4(vec3(0.8, 0.92, 1.0) * ring * vA, ring * vA);
      }
    `,
  })
}

/* ── THE MODEL ──────────────────────────────────────────────────────────── */

function networkGeometry(centroids: Vector3[]) {
  const layers = networkLayout()
  const pos: number[] = []
  const aL: number[] = []
  const aT: number[] = []
  const aW: number[] = []
  const seg = (a: Vector3, b: Vector3, l: number, w: number) => {
    pos.push(...a.toArray(), ...b.toArray())
    aL.push(l, l)
    aT.push(0, 1)
    aW.push(w, w)
  }
  // stage 0: each feature (centroid) feeds one input node
  centroids.forEach((c, i) => seg(c, layers[0][i % layers[0].length], 0, 1))
  // stages 1–4: dense connections between consecutive layers, each with a weight
  let k = 0
  for (let l = 0; l + 1 < layers.length; l++)
    for (const a of layers[l])
      for (const b of layers[l + 1]) {
        const w = hash(k++, 31)
        seg(a, b, l + 1, w * w) // most weights small, a few strong
      }
  // stage 5: the output reaches down to the road — the prediction, drawn from the nose forward
  const out = layers[layers.length - 1]
  const s = (out[1].z - PATH_START) / (PATH_END - PATH_START)
  seg(out[1], new Vector3(candidateX(CHOSEN, s), 0.04, out[1].z), layers.length, 1)
  const lines = new BufferGeometry()
  lines.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3))
  lines.setAttribute('aL', new BufferAttribute(new Float32Array(aL), 1))
  lines.setAttribute('aT', new BufferAttribute(new Float32Array(aT), 1))
  lines.setAttribute('aW', new BufferAttribute(new Float32Array(aW), 1))
  const np: number[] = []
  const nl: number[] = []
  layers.forEach((layer, l) =>
    layer.forEach((p) => {
      np.push(...p.toArray())
      nl.push(l + 1)
    }),
  )
  const nodes = new BufferGeometry()
  nodes.setAttribute('position', new BufferAttribute(new Float32Array(np), 3))
  nodes.setAttribute('aL', new BufferAttribute(new Float32Array(nl), 1))
  return { lines, nodes }
}

function netMaterial() {
  return new ShaderMaterial({
    uniforms: U,
    ...additive,
    vertexShader: /* glsl */ `
      attribute float aL;
      attribute float aT;
      attribute float aW;
      varying float vL;
      varying float vT;
      varying float vW;
      void main() { vL = aL; vT = aT; vW = aW; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
    `,
    fragmentShader: /* glsl */ `
      ${SQ}
      uniform float uModel, uPrune;
      varying float vL;
      varying float vT;
      varying float vW;
      void main() {
        // activation travels stage by stage: a connection exists once the wave has crossed it
        float w = uModel * 6.4;
        float at = vL + vT;
        if (at > w) discard;
        float head = exp(-sq((w - at) / 0.18)) * step(w, 6.3);
        float keep = mix(1.0, smoothstep(0.25, 0.45, vW), uPrune); // learning: weak connections fall away
        float a = ((0.08 + vW * 0.45) * keep + head * 0.9 * (0.3 + vW)) * (vL < 0.5 || vL > 4.5 ? 2.2 : 1.0);
        gl_FragColor = vec4(vec3(0.66, 0.84, 1.0) * a, a);
      }
    `,
  })
}

function netNodeMaterial() {
  return new ShaderMaterial({
    uniforms: U,
    ...additive,
    vertexShader: /* glsl */ `
      attribute float aL;
      uniform float uModel, uDpr;
      varying float vA;
      void main() {
        float w = uModel * 6.4;
        vA = smoothstep(aL - 0.1, aL + 0.1, w) * (1.0 + exp(-(w - aL) * (w - aL) / 0.05));
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = 12.0 * uDpr * clamp(12.0 / -mv.z, 0.75, 1.6);
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      varying float vA;
      void main() {
        float r = length(gl_PointCoord - 0.5);
        float a = (smoothstep(0.5, 0.0, r) * 0.35 + smoothstep(0.16, 0.0, r)) * vA;
        gl_FragColor = vec4(vec3(0.82, 0.92, 1.0) * a, a);
      }
    `,
  })
}

/* ── PREDICTION · OPTIMISATION ──────────────────────────────────────────── */

const SEGS = 120

function pathGeometry() {
  const { rank } = scoreCandidates()
  const pos: number[] = []
  const aK: number[] = []
  const aS: number[] = []
  const aX: number[] = []
  const aWob: number[] = []
  const aRank: number[] = []
  const push = (k: number, s: number, x: number, wob: number, r: number) => {
    pos.push(x, 0.04, PATH_START + (PATH_END - PATH_START) * s)
    aK.push(k)
    aS.push(s)
    aX.push(x)
    aWob.push(wob)
    aRank.push(r)
  }
  for (let k = 0; k < CANDIDATES + FAN; k++) {
    for (let i = 0; i < SEGS; i++) {
      for (const s of [i / SEGS, (i + 1) / SEGS]) {
        if (k < CANDIDATES) push(k, s, candidateX(k, s), k === CHOSEN ? wobble(s) : 0, rank[k])
        else {
          const f = k - CANDIDATES
          const spread = [-1.2, -0.55, 0.55, 1.2][f]
          push(k, s, candidateX(CHOSEN, s) + spread * s * s, 0, 0)
        }
      }
    }
  }
  const g = new BufferGeometry()
  g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3))
  g.setAttribute('aK', new BufferAttribute(new Float32Array(aK), 1))
  g.setAttribute('aS', new BufferAttribute(new Float32Array(aS), 1))
  g.setAttribute('aX', new BufferAttribute(new Float32Array(aX), 1))
  g.setAttribute('aWob', new BufferAttribute(new Float32Array(aWob), 1))
  g.setAttribute('aRank', new BufferAttribute(new Float32Array(aRank), 1))
  return g
}

function pathMaterial() {
  return new ShaderMaterial({
    uniforms: U,
    ...additive,
    vertexShader: /* glsl */ `
      attribute float aK;
      attribute float aS;
      attribute float aX;
      attribute float aWob;
      attribute float aRank;
      uniform float uOpt, uCands;
      varying float vK;
      varying float vS;
      varying float vRank;
      void main() {
        vK = aK; vS = aS; vRank = aRank;
        vec3 p = position;
        p.x = aX + aWob * (1.0 - uOpt) * uCands; // only the optimisation chapter shows (and removes) the wobble
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uPredict, uFan, uCands, uEval, uOpt, uPath;
      varying float vK;
      varying float vS;
      varying float vRank;
      float drawn(float u) { return step(0.001, u) * step(vS, u); }
      void main() {
        float a = 0.0;
        bool chosen = abs(vK - ${CHOSEN.toFixed(1)}) < 0.5;
        if (vK > ${(CANDIDATES - 0.5).toFixed(1)}) {
          a = uFan * 0.22 * drawn(uPredict) * (1.0 - vS * 0.4);                    // uncertainty
        } else if (chosen) {
          a = max(max(drawn(uPredict) * 0.85, uCands * 0.5), drawn(uPath) * 1.25);   // the plan
          a += uOpt * uCands * 0.4;
        } else {
          // candidates fade worst-first as they are evaluated
          float order = (${(CANDIDATES - 1).toFixed(1)} - vRank) / ${(CANDIDATES - 1).toFixed(1)} * 0.85;
          a = uCands * 0.62 * (1.0 - smoothstep(order, order + 0.1, uEval));
        }
        // distance fade so the far end never ends abruptly
        a *= 1.0 - smoothstep(0.8, 1.0, vS);
        vec3 c = chosen ? vec3(0.86, 0.95, 1.0) : vec3(0.55, 0.75, 1.0);
        gl_FragColor = vec4(c * a, a);
      }
    `,
  })
}

/** time-step markers along the chosen path, and the optimiser's travelling marker */
function markerGeometry() {
  const pos: number[] = []
  const aS: number[] = []
  for (let i = 0; i <= 24; i++) {
    const s = i / 24
    pos.push(candidateX(CHOSEN, s), 0.05, PATH_START + (PATH_END - PATH_START) * s)
    aS.push(s)
  }
  // the travelling marker (aS = -1): positioned in the shader
  pos.push(0, 0.05, PATH_START)
  aS.push(-1)
  const g = new BufferGeometry()
  g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3))
  g.setAttribute('aS', new BufferAttribute(new Float32Array(aS), 1))
  return g
}

function markerMaterial() {
  return new ShaderMaterial({
    uniforms: { ...U, uMarker: { value: new Vector3() } },
    ...additive,
    vertexShader: /* glsl */ `
      attribute float aS;
      uniform float uPredict, uOpt, uCands, uPath, uDpr;
      uniform vec3 uMarker;
      varying float vA;
      varying float vBig;
      void main() {
        vec3 p = position;
        if (aS < 0.0) {
          // the optimiser's marker travels the chosen path as the solution refines (placed on the CPU)
          p = uMarker;
          vA = uCands * step(0.001, uOpt) * step(uOpt, 0.999);
          vBig = 1.0;
        } else {
          vA = max(step(aS, uPredict) * step(0.001, uPredict), step(aS, uPath) * step(0.001, uPath)) * (1.0 - smoothstep(0.8, 1.0, aS)) * 0.8;
          vBig = 0.0;
        }
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_PointSize = (vBig > 0.5 ? 18.0 : 6.0) * uDpr * clamp(8.0 / -mv.z, 0.4, 1.6);
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      varying float vA;
      varying float vBig;
      void main() {
        float r = length(gl_PointCoord - 0.5);
        float a = (vBig > 0.5 ? smoothstep(0.5, 0.0, r) * 0.6 + smoothstep(0.12, 0.0, r) : smoothstep(0.5, 0.2, r)) * vA;
        gl_FragColor = vec4(vec3(0.88, 0.96, 1.0) * a, a);
      }
    `,
  })
}

/* ── AI SYSTEMS ─────────────────────────────────────────────────────────── */

/** when the signal reaches each stage (0–1 clock) */
const STAGE_TIME = [0.14, 0.32, 0.5, 0.68, 0.86]

function pipelineGeometry() {
  const pos: number[] = []
  const aT: number[] = []
  const aStart: number[] = []
  const aDur: number[] = []
  const seg = (a: Vector3, b: Vector3, start: number, dur: number) => {
    pos.push(...a.toArray(), ...b.toArray())
    aT.push(0, 1)
    aStart.push(start, start)
    aDur.push(dur, dur)
  }
  SENSORS.forEach((s) => seg(s, STAGES[0], 0.02, 0.12))
  for (let i = 0; i + 1 < STAGES.length; i++) seg(STAGES[i], STAGES[i + 1], STAGE_TIME[i] + 0.03, 0.15)
  seg(STAGES[4], PATH_ORIGIN, 0.89, 0.09)
  const lines = new BufferGeometry()
  lines.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3))
  lines.setAttribute('aT', new BufferAttribute(new Float32Array(aT), 1))
  lines.setAttribute('aStart', new BufferAttribute(new Float32Array(aStart), 1))
  lines.setAttribute('aDur', new BufferAttribute(new Float32Array(aDur), 1))
  const np: number[] = []
  const nt: number[] = []
  const nb: number[] = []
  SENSORS.forEach((s) => {
    np.push(...s.toArray())
    nt.push(0.0)
    nb.push(0)
  })
  STAGES.forEach((s, i) => {
    np.push(...s.toArray())
    nt.push(STAGE_TIME[i])
    nb.push(1)
  })
  const nodes = new BufferGeometry()
  nodes.setAttribute('position', new BufferAttribute(new Float32Array(np), 3))
  nodes.setAttribute('aStart', new BufferAttribute(new Float32Array(nt), 1))
  nodes.setAttribute('aBig', new BufferAttribute(new Float32Array(nb), 1))
  return { lines, nodes }
}

function pipeMaterial() {
  return new ShaderMaterial({
    uniforms: U,
    ...additive,
    vertexShader: /* glsl */ `
      attribute float aT;
      attribute float aStart;
      attribute float aDur;
      varying float vT;
      varying float vStart;
      varying float vDur;
      void main() { vT = aT; vStart = aStart; vDur = aDur; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
    `,
    fragmentShader: /* glsl */ `
      ${SQ}
      uniform float uPipe, uSignal;
      varying float vT;
      varying float vStart;
      varying float vDur;
      void main() {
        float grow = clamp((uSignal - vStart) / vDur, 0.0, 1.0);
        float lit = step(vT, grow);
        float head = exp(-sq((vT - grow) / 0.05)) * step(grow, 0.999) * step(0.001, grow);
        float a = (0.07 + lit * 0.4 + head * 1.4) * uPipe;
        gl_FragColor = vec4(vec3(0.66, 0.85, 1.0) * a, a);
      }
    `,
  })
}

function pipeNodeMaterial() {
  return new ShaderMaterial({
    uniforms: U,
    ...additive,
    vertexShader: /* glsl */ `
      ${SQ}
      attribute float aStart;
      attribute float aBig;
      uniform float uPipe, uSignal, uDpr;
      varying float vA;
      varying float vBig;
      void main() {
        float on = smoothstep(aStart, aStart + 0.03, uSignal);
        float arrive = exp(-sq((uSignal - aStart) / 0.04));
        vA = uPipe * (0.25 + on * 0.75 + arrive * 0.8);
        vBig = aBig;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = (aBig > 0.5 ? 22.0 : 9.0) * uDpr * clamp(7.0 / -mv.z, 0.5, 1.6);
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      ${SQ}
      varying float vA;
      varying float vBig;
      void main() {
        float r = length(gl_PointCoord - 0.5);
        float ring = smoothstep(0.03, 0.0, abs(r - 0.42)) * vBig;
        float dot = smoothstep(vBig > 0.5 ? 0.1 : 0.2, 0.0, r);
        float a = (ring * 0.7 + dot) * vA;
        gl_FragColor = vec4(vec3(0.85, 0.94, 1.0) * a, a);
      }
    `,
  })
}
