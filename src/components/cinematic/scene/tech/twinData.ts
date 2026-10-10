import { BufferAttribute, BufferGeometry, Vector3 } from 'three'
import { LAYERS, hash, kmeans, searchGraph } from './compute'

export { hash }

/**
 * The car's digital twin, baked offline from the real model by
 * `node scripts/render-car.mjs --tech` (see scripts/render-car/tech.ts):
 * feature edges, area-weighted surface samples with normals and a class
 * (0 body · 1 glass · 2 wheels) and structural nodes (farthest-point sampled) —
 * all in the film's car space (metres, front −Z). On load, the computations the
 * film visualises (compute.ts) run once over it: k-means features and a search
 * graph across the structural nodes.
 *
 * Everything that moves is computed on the GPU from these static buffers and
 * a handful of scroll-driven uniforms, so it is deterministic and costs no
 * per-frame CPU work.
 */
export type TwinData = ReturnType<typeof decodeTwin>

export function decodeTwin(buf: ArrayBuffer) {
  const dv = new DataView(buf)
  const jl = dv.getUint32(0, true)
  const header = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 4, jl))) as {
    q: number
    segments: number
    points: number
    nodes: number
    links: number
    bbox: [[number, number, number], [number, number, number]]
  }
  const pad = (n: number) => (4 - (n % 4)) % 4
  let off = 4 + jl + pad(jl)
  const take = <T>(C: { new (b: ArrayBuffer, o: number, l: number): T; BYTES_PER_ELEMENT: number }, n: number) => {
    const a = new C(buf, off, n)
    off += n * C.BYTES_PER_ELEMENT + pad(n * C.BYTES_PER_ELEMENT)
    return a
  }
  return {
    header,
    segPos: take(Int16Array, header.segments * 6),
    segCls: take(Uint8Array, header.segments),
    ptPos: take(Int16Array, header.points * 3),
    ptNrm: take(Int8Array, header.points * 3),
    ptCls: take(Uint8Array, header.points),
    nodes: take(Uint32Array, header.nodes),
    links: take(Uint16Array, header.links * 2),
  }
}


/** Feature edges: positions + class, and z normalised along the car (for the scan front). */
export function edgesGeometry(t: TwinData) {
  const n = t.header.segments
  const q = t.header.q
  const pos = new Float32Array(n * 6)
  const cls = new Float32Array(n * 2)
  const seed = new Float32Array(n * 2)
  for (let i = 0; i < n * 6; i++) pos[i] = t.segPos[i] / q
  for (let i = 0; i < n; i++) {
    cls[i * 2] = cls[i * 2 + 1] = t.segCls[i]
    seed[i * 2] = seed[i * 2 + 1] = hash(i, 3)
  }
  const g = new BufferGeometry()
  g.setAttribute('position', new BufferAttribute(pos, 3))
  g.setAttribute('aCls', new BufferAttribute(cls, 1))
  g.setAttribute('aSeed', new BufferAttribute(seed, 1))
  g.computeBoundingSphere()
  return g
}

/**
 * Surface samples, with the centroid of the k-means cluster each belongs to
 * (the features of the ML chapter) and a per-point seed.
 */
export function pointsGeometry(pos: Float32Array, nrm: Float32Array, cls: Float32Array, centroids: Float32Array, label: Uint8Array) {
  const n = pos.length / 3
  const cen = new Float32Array(n * 3)
  const seed = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    cen.set(centroids.subarray(label[i] * 3, label[i] * 3 + 3), i * 3)
    seed[i] = hash(i, 2)
  }
  const g = new BufferGeometry()
  g.setAttribute('position', new BufferAttribute(pos, 3))
  g.setAttribute('aNormal', new BufferAttribute(nrm, 3))
  g.setAttribute('aCls', new BufferAttribute(cls, 1))
  g.setAttribute('aCentroid', new BufferAttribute(cen, 3))
  g.setAttribute('aSeed', new BufferAttribute(seed, 1))
  g.computeBoundingSphere()
  g.boundingSphere!.radius += 1
  return g
}

/** Structural node positions (farthest-point sampled on the body). */
export function nodePositions(t: TwinData) {
  const q = t.header.q
  return Array.from(t.nodes, (i) => new Vector3(t.ptPos[i * 3] / q, t.ptPos[i * 3 + 1] / q, t.ptPos[i * 3 + 2] / q))
}

export function nodesGeometry(nodes: Vector3[]) {
  const pos = new Float32Array(nodes.length * 3)
  const seed = new Float32Array(nodes.length)
  nodes.forEach((p, k) => {
    p.toArray(pos, k * 3)
    seed[k] = hash(k, 4)
  })
  const g = new BufferGeometry()
  g.setAttribute('position', new BufferAttribute(pos, 3))
  g.setAttribute('aSeed', new BufferAttribute(seed, 1))
  return g
}

/**
 * The structural graph as line segments, oriented nose → tail (so data streams
 * flow from the front sensors backwards), with the search's visit order and
 * the shortest path baked in as attributes.
 */
export function graphGeometry(nodes: Vector3[], g: { edges: [number, number][]; visit: number[]; onPath: number[] }) {
  const L = g.edges.length
  const pos = new Float32Array(L * 6)
  const t = new Float32Array(L * 2)
  const seed = new Float32Array(L * 2)
  const visit = new Float32Array(L * 2)
  const path = new Float32Array(L * 2)
  g.edges.forEach(([a0, b0], k) => {
    const [a, b] = nodes[a0].z <= nodes[b0].z ? [a0, b0] : [b0, a0]
    nodes[a].toArray(pos, k * 6)
    nodes[b].toArray(pos, k * 6 + 3)
    t[k * 2] = 0
    t[k * 2 + 1] = 1
    seed[k * 2] = seed[k * 2 + 1] = hash(k, 14)
    visit[k * 2] = visit[k * 2 + 1] = g.visit[k]
    path[k * 2] = path[k * 2 + 1] = g.onPath[k]
  })
  const geo = new BufferGeometry()
  geo.setAttribute('position', new BufferAttribute(pos, 3))
  geo.setAttribute('aT', new BufferAttribute(t, 1))
  geo.setAttribute('aSeed', new BufferAttribute(seed, 1))
  geo.setAttribute('aVisit', new BufferAttribute(visit, 1))
  geo.setAttribute('aPath', new BufferAttribute(path, 1))
  return geo
}

/** Everything derived from one loaded twin, computed once and shared by every component that needs it. */
const cache = new WeakMap<ArrayBuffer, ReturnType<typeof derive>>()
export function getTwin(buf: ArrayBuffer, maxPoints: number) {
  let d = cache.get(buf)
  if (!d || d.maxPoints !== maxPoints) {
    d = derive(buf, maxPoints)
    cache.set(buf, d)
  }
  return d
}

function derive(buf: ArrayBuffer, maxPoints: number) {
  const t = decodeTwin(buf)
  const n = Math.min(maxPoints, t.header.points)
  const step = t.header.points / n
  const q = t.header.q
  const pos = new Float32Array(n * 3)
  const nrm = new Float32Array(n * 3)
  const cls = new Float32Array(n)
  for (let k = 0; k < n; k++) {
    const i = Math.floor(k * step)
    for (let a = 0; a < 3; a++) {
      pos[k * 3 + a] = t.ptPos[i * 3 + a] / q
      nrm[k * 3 + a] = t.ptNrm[i * 3 + a] / 127
    }
    cls[k] = t.ptCls[i]
  }
  const { centroids, label } = kmeans(pos, LAYERS[0])
  const nodes = nodePositions(t)
  const graph = searchGraph(nodes)
  return { maxPoints, t, pos, nrm, cls, centroids, label, nodes, graph }
}
