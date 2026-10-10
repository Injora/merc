import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import { AdditiveBlending, BufferAttribute, BufferGeometry, ShaderMaterial, Vector3, type Group } from 'three'
import { S } from '../../../../lib/state'
import { useScene } from '../SceneContext'
import { hash } from './compute'

/** the network grows out of the car itself: its seed is the body's centre */
const SEED = new Vector3(0, 0.75, 0)

/**
 * The tenfold idea: the system is not fixed. From the car's own structure, new
 * connections branch out — paths to hubs, clusters grown as spanning trees,
 * then bridges joining the independent systems — and one pulse runs through
 * the connected whole. Scrubbed (S.tech.net, S.tech.netPulse), never timed.
 */
export function Branches() {
  const { tier } = useScene()
  const group = useRef<Group>(null)
  const res = useMemo(() => {
    const net = network(tier === 'high' ? 22 : 14)
    return { net, lineMat: netLineMaterial(), nodeMat: netNodeMaterial(Math.min(window.devicePixelRatio || 1, 2)) }
  }, [tier])
  useEffect(
    () => () => {
      for (const d of [res.net.lines, res.net.nodes, res.lineMat, res.nodeMat]) d.dispose()
    },
    [res],
  )
  useFrame(() => {
    const t = S.tech
    if (group.current) group.current.visible = t.net > 0.001
    res.lineMat.uniforms.uNet.value = t.net
    res.lineMat.uniforms.uPulse.value = t.netPulse
    res.nodeMat.uniforms.uNet.value = t.net
    res.nodeMat.uniforms.uPulse.value = t.netPulse
  })
  return (
    <group ref={group} position={SEED} visible={false}>
      <lineSegments geometry={res.net.lines} material={res.lineMat} frustumCulled={false} renderOrder={7} />
      <points geometry={res.net.nodes} material={res.nodeMat} frustumCulled={false} renderOrder={8} />
    </group>
  )
}

/**
 * The network: a seed at the core's centre, hubs, clusters grown as spanning
 * trees from their hubs, a few extra links inside each cluster, and finally
 * bridges between neighbouring clusters. Each segment knows when it starts
 * growing (aStart) and for how long (aDur) on the 0–1 `uNet` clock.
 */
function network(perCluster: number) {
  const hubs = 6
  const golden = Math.PI * (3 - Math.sqrt(5))
  const nodes: { p: Vector3; t: number }[] = [{ p: new Vector3(), t: 0 }]
  const segs: { a: Vector3; b: Vector3; start: number; dur: number }[] = []
  const clusters: number[][] = []
  for (let h = 0; h < hubs; h++) {
    const y = 1 - (2 * (h + 0.5)) / hubs
    const rr = Math.sqrt(1 - y * y)
    const dir = new Vector3(Math.cos(golden * h * 1.7) * rr, y * 0.7, Math.sin(golden * h * 1.7) * rr).normalize()
    const hub = dir.clone().multiplyScalar(1.75)
    const hubStart = 0.06 + h * 0.025
    segs.push({ a: new Vector3(), b: hub, start: hubStart, dur: 0.1 })
    const hi = nodes.length
    nodes.push({ p: hub, t: hubStart + 0.1 })
    const members = [hi]
    // cluster nodes in a cone around the hub
    for (let k = 0; k < perCluster; k++) {
      const s = h * 100 + k
      // on one of three shells, within a cone around the hub: structured, not scattered
      const off = new Vector3(hash(s, 21) - 0.5, hash(s, 22) - 0.5, hash(s, 23) - 0.5).multiplyScalar(1.1)
      const shell = [1.9, 2.25, 2.6][Math.floor(hash(s, 24) * 3)]
      const p = dir.clone().add(off.multiplyScalar(0.55)).normalize().multiplyScalar(shell)
      members.push(nodes.length)
      nodes.push({ p, t: 1 })
    }
    // Prim's spanning tree from the hub; depth drives the growth order
    const inTree = new Set([hi])
    const depth = new Map([[hi, 0]])
    while (inTree.size < members.length) {
      let best = Infinity
      let pa = -1
      let pb = -1
      for (const a of inTree)
        for (const b of members) {
          if (inTree.has(b)) continue
          const d = nodes[a].p.distanceToSquared(nodes[b].p)
          if (d < best) {
            best = d
            pa = a
            pb = b
          }
        }
      inTree.add(pb)
      const dp = depth.get(pa)! + 1
      depth.set(pb, dp)
      const start = hubStart + 0.12 + dp * 0.045
      segs.push({ a: nodes[pa].p, b: nodes[pb].p, start, dur: 0.06 })
      nodes[pb].t = start + 0.06
    }
    // a few extra links inside the cluster: structure, not a tree
    for (let k = 0; k < members.length; k += 3) {
      const a = members[k]
      let best = Infinity
      let bi = -1
      for (const b of members) {
        if (b === a) continue
        const d = nodes[a].p.distanceToSquared(nodes[b].p)
        if (d < best && d > 0.04) {
          best = d
          bi = b
        }
      }
      if (bi >= 0) segs.push({ a: nodes[a].p, b: nodes[bi].p, start: 0.62 + hash(k + h * 7, 25) * 0.08, dur: 0.06 })
    }
    clusters.push(members)
  }
  // bridges: independent systems connect (nearest pair between neighbouring clusters)
  for (let h = 0; h < hubs; h++) {
    const A = clusters[h]
    const B = clusters[(h + 1) % hubs]
    let best = Infinity
    let pa = 0
    let pb = 0
    for (const a of A)
      for (const b of B) {
        const d = nodes[a].p.distanceToSquared(nodes[b].p)
        if (d < best) {
          best = d
          pa = a
          pb = b
        }
      }
    segs.push({ a: nodes[pa].p, b: nodes[pb].p, start: 0.76 + h * 0.025, dur: 0.08 })
  }
  const lp = new Float32Array(segs.length * 6)
  const lt = new Float32Array(segs.length * 2)
  const ls = new Float32Array(segs.length * 2)
  const ld = new Float32Array(segs.length * 2)
  segs.forEach((s, i) => {
    s.a.toArray(lp, i * 6)
    s.b.toArray(lp, i * 6 + 3)
    lt[i * 2] = 0
    lt[i * 2 + 1] = 1
    ls[i * 2] = ls[i * 2 + 1] = s.start
    ld[i * 2] = ld[i * 2 + 1] = s.dur
  })
  const lines = new BufferGeometry()
  lines.setAttribute('position', new BufferAttribute(lp, 3))
  lines.setAttribute('aT', new BufferAttribute(lt, 1))
  lines.setAttribute('aStart', new BufferAttribute(ls, 1))
  lines.setAttribute('aDur', new BufferAttribute(ld, 1))
  const np = new Float32Array(nodes.length * 3)
  const nt = new Float32Array(nodes.length)
  nodes.forEach((n, i) => {
    n.p.toArray(np, i * 3)
    nt[i] = n.t
  })
  const pts = new BufferGeometry()
  pts.setAttribute('position', new BufferAttribute(np, 3))
  pts.setAttribute('aStart', new BufferAttribute(nt, 1))
  return { lines, nodes: pts }
}

function netLineMaterial() {
  return new ShaderMaterial({
    uniforms: { uNet: { value: 0 }, uPulse: { value: 0 } },
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
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
#ifndef SQ_DEFINED
#define SQ_DEFINED
#define sq(x) ((x) * (x))
#endif
      uniform float uNet, uPulse;
      varying float vT;
      varying float vStart;
      varying float vDur;
      void main() {
        float grow = clamp((uNet - vStart) / vDur, 0.0, 1.0);
        if (vT > grow) discard;
        // the growing tip is brightest; a pulse later runs through in growth order
        float tip = exp(-sq((vT - grow) / 0.06)) * step(grow, 0.999);
        float at = vStart + vT * vDur;
        float pulse = exp(-sq((at - uPulse) / 0.03)) * step(0.001, uPulse);
        float a = 0.32 + tip * 0.9 + pulse * 1.2;
        gl_FragColor = vec4(vec3(0.62, 0.82, 1.0) * a, a);
      }
    `,
  })
}

function netNodeMaterial(dpr: number) {
  return new ShaderMaterial({
    uniforms: { uNet: { value: 0 }, uPulse: { value: 0 }, uDpr: { value: dpr } },
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    vertexShader: /* glsl */ `
#ifndef SQ_DEFINED
#define SQ_DEFINED
#define sq(x) ((x) * (x))
#endif
      attribute float aStart;
      uniform float uNet, uPulse, uDpr;
      varying float vA;
      void main() {
        float on = smoothstep(aStart, aStart + 0.03, uNet);
        float pulse = exp(-sq((aStart - uPulse) / 0.03)) * step(0.001, uPulse);
        vA = on * (0.7 + pulse * 1.5);
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        // the seed is larger: the single point of light everything grows from
        float seed = aStart < 0.001 ? 2.2 : 1.0;
        gl_PointSize = 9.0 * uDpr * seed * clamp(6.0 / -mv.z, 0.4, 1.8) * (1.0 + pulse * 0.6);
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      varying float vA;
      void main() {
        float r = length(gl_PointCoord - 0.5);
        float a = (smoothstep(0.5, 0.0, r) * 0.6 + smoothstep(0.14, 0.0, r)) * vA;
        gl_FragColor = vec4(vec3(0.78, 0.9, 1.0) * a, a);
      }
    `,
  })
}
