import { Vector3 } from 'three'

/**
 * The computations the film visualises. They are real (and deterministic),
 * computed once on load over the car's own data and a procedural scene — a
 * conceptual demonstration, not a vehicle system:
 *  - a graph over the car's structural nodes, and a Dijkstra search across it;
 *  - k-means clustering of the surface samples (feature extraction);
 *  - a small layered network layout (the model);
 *  - a procedural road scene, its occupancy and a cost field;
 *  - candidate trajectories scored by that cost, and the chosen one.
 */

/* ── 1 · the car's structural graph, and a search across it ───────────────── */

export type SearchGraph = {
  edges: [number, number][]
  /** order in which the search settled each edge's far node (0–1), or -1 if never */
  visit: number[]
  /** 1 if the edge lies on the shortest path */
  onPath: number[]
  start: number
  goal: number
}

/** kNN (3) + a spanning tree so the graph is connected; Dijkstra from the nose to the tail. */
export function searchGraph(nodes: Vector3[]): SearchGraph {
  const n = nodes.length
  const key = (a: number, b: number) => (a < b ? `${a}-${b}` : `${b}-${a}`)
  const set = new Map<string, [number, number]>()
  for (let a = 0; a < n; a++) {
    const near = nodes
      .map((p, b) => [p.distanceToSquared(nodes[a]), b] as const)
      .filter(([, b]) => b !== a)
      .sort((x, y) => x[0] - y[0])
      .slice(0, 3)
    for (const [, b] of near) set.set(key(a, b), a < b ? [a, b] : [b, a])
  }
  // Prim's tree guarantees connectivity
  const inTree = new Set([0])
  while (inTree.size < n) {
    let best = Infinity
    let pa = 0
    let pb = 0
    for (const a of inTree)
      for (let b = 0; b < n; b++) {
        if (inTree.has(b)) continue
        const d = nodes[a].distanceToSquared(nodes[b])
        if (d < best) {
          best = d
          pa = a
          pb = b
        }
      }
    inTree.add(pb)
    set.set(key(pa, pb), pa < pb ? [pa, pb] : [pb, pa])
  }
  const edges = [...set.values()]
  const adj: [number, number, number][][] = nodes.map(() => [])
  edges.forEach(([a, b], i) => {
    const w = nodes[a].distanceTo(nodes[b])
    adj[a].push([b, w, i])
    adj[b].push([a, w, i])
  })
  // start: the node nearest the nose (−z); goal: nearest the tail (+z)
  let start = 0
  let goal = 0
  nodes.forEach((p, i) => {
    if (p.z < nodes[start].z) start = i
    if (p.z > nodes[goal].z) goal = i
  })
  const dist = new Array(n).fill(Infinity)
  const prev = new Array<[number, number]>(n).fill([-1, -1])
  const done = new Array(n).fill(false)
  const settledEdge = new Array(edges.length).fill(-1)
  dist[start] = 0
  let order = 0
  for (;;) {
    let u = -1
    for (let i = 0; i < n; i++) if (!done[i] && (u < 0 || dist[i] < dist[u])) u = i
    if (u < 0 || dist[u] === Infinity) break
    done[u] = true
    if (prev[u][1] >= 0) settledEdge[prev[u][1]] = order++
    if (u === goal) break
    for (const [v, w, e] of adj[u]) {
      if (done[v]) continue
      if (dist[u] + w < dist[v]) {
        dist[v] = dist[u] + w
        prev[v] = [u, e]
      }
    }
  }
  const onPath = new Array(edges.length).fill(0)
  for (let v = goal; prev[v][0] >= 0; v = prev[v][0]) onPath[prev[v][1]] = 1
  const visit = settledEdge.map((o) => (o < 0 ? -1 : o / Math.max(1, order - 1)))
  return { edges, visit, onPath, start, goal }
}

/* ── 2 · k-means over the surface samples (feature extraction) ──────────────── */

export function kmeans(pos: Float32Array, k: number, iterations = 10) {
  const n = pos.length / 3
  const cent = new Float32Array(k * 3)
  // farthest-point initialisation: deterministic, well spread
  const pick = [0]
  const dmin = new Float32Array(n).fill(Infinity)
  while (pick.length < k) {
    const last = pick[pick.length - 1]
    let best = 0
    let bi = 0
    for (let i = 0; i < n; i += 3) {
      const d = (pos[i * 3] - pos[last * 3]) ** 2 + (pos[i * 3 + 1] - pos[last * 3 + 1]) ** 2 + (pos[i * 3 + 2] - pos[last * 3 + 2]) ** 2
      if (d < dmin[i]) dmin[i] = d
      if (dmin[i] > best) {
        best = dmin[i]
        bi = i
      }
    }
    pick.push(bi)
  }
  pick.forEach((p, c) => cent.set(pos.subarray(p * 3, p * 3 + 3), c * 3))
  const label = new Uint8Array(n)
  for (let it = 0; it < iterations; it++) {
    const sum = new Float32Array(k * 3)
    const cnt = new Uint32Array(k)
    for (let i = 0; i < n; i++) {
      let best = Infinity
      let bc = 0
      for (let c = 0; c < k; c++) {
        const d = (pos[i * 3] - cent[c * 3]) ** 2 + (pos[i * 3 + 1] - cent[c * 3 + 1]) ** 2 + (pos[i * 3 + 2] - cent[c * 3 + 2]) ** 2
        if (d < best) {
          best = d
          bc = c
        }
      }
      label[i] = bc
      cnt[bc]++
      sum[bc * 3] += pos[i * 3]
      sum[bc * 3 + 1] += pos[i * 3 + 1]
      sum[bc * 3 + 2] += pos[i * 3 + 2]
    }
    for (let c = 0; c < k; c++) if (cnt[c]) for (let a = 0; a < 3; a++) cent[c * 3 + a] = sum[c * 3 + a] / cnt[c]
  }
  return { centroids: cent, label }
}

/* ── 3 · the model: a small layered network floating above the car ─────────── */

export const LAYERS = [8, 10, 10, 6, 3]

/**
 * node positions per layer: the model stands on the road just ahead of the car —
 * input (8, one per feature) nearest the nose → output furthest ahead — so the
 * scene reads in one direction: the car's data → features → model → prediction.
 */
export function networkLayout() {
  const layers: Vector3[][] = LAYERS.map((size, l) => {
    // compact (4 m deep, 1.6 m tall) and level with the car's shoulder: it complements the car instead of out-sizing it
    const z = -3.4 - (4.0 * l) / (LAYERS.length - 1)
    const h = size === 3 ? 0.75 : 1.6
    return Array.from({ length: size }, (_, i) => new Vector3(0, 1.35 - h / 2 + (h * (i + 0.5)) / size, z))
  })
  return layers
}

/* ── 4 · a procedural road scene ──────────────────────────────────────────── */

export type Box = { c: Vector3; s: Vector3; kind: 'vehicle' | 'obstacle' | 'landmark' }

export const LANE = 3.6
export const SCENE: Box[] = [
  { c: new Vector3(LANE, 0.72, 3.0), s: new Vector3(1.9, 1.45, 4.6), kind: 'vehicle' }, // behind, right lane
  { c: new Vector3(-LANE, 0.72, -9.5), s: new Vector3(1.9, 1.45, 4.6), kind: 'vehicle' }, // ahead, left lane
  { c: new Vector3(0, 0.8, -16.5), s: new Vector3(2.0, 1.6, 4.8), kind: 'vehicle' }, // ahead, our lane
  { c: new Vector3(-1.2, 0.35, -5.6), s: new Vector3(0.7, 0.7, 0.7), kind: 'obstacle' }, // debris, left of our lane
  { c: new Vector3(7.4, 1.6, -6), s: new Vector3(0.5, 3.2, 0.5), kind: 'landmark' },
  { c: new Vector3(-7.4, 1.6, -14), s: new Vector3(0.5, 3.2, 0.5), kind: 'landmark' },
  { c: new Vector3(7.4, 1.6, -22), s: new Vector3(0.5, 3.2, 0.5), kind: 'landmark' },
]

/** cost of a point on the road: closeness to anything in the scene, and to the road edges */
export function cost(x: number, z: number) {
  let c = 0
  for (const b of SCENE) {
    if (b.kind === 'landmark') continue
    const dx = Math.max(0, Math.abs(x - b.c.x) - b.s.x / 2)
    const dz = Math.max(0, Math.abs(z - b.c.z) - b.s.z / 2)
    c += Math.exp(-(dx * dx + dz * dz) / 1.4) * 4
  }
  const edge = Math.max(0, Math.abs(x) - (LANE * 1.5 - 1.2))
  return c + edge * edge * 3
}

/* ── 5 · trajectories: candidates, scored; the chosen one ──────────────────── */

export const PATH_START = -2.6
export const PATH_END = -24

/** lateral offset of candidate k at progress s (0 → 1) */
export function candidateX(k: number, s: number) {
  const smooth = (a: number, b: number, v: number) => {
    const t = Math.min(1, Math.max(0, (v - a) / (b - a)))
    return t * t * (3 - 2 * t)
  }
  switch (k) {
    case 0: return 0 // stay in lane: into the car ahead
    case 1: return -LANE * smooth(0.15, 0.5, s) // left: into the left-lane car
    case 2: return LANE * smooth(0.05, 0.22, s) // right too early: the debris corridor, sharp
    case 3: return LANE * smooth(0.25, 0.55, s) // right lane, smoothly, before the car ahead
    case 4: return LANE * smooth(0.55, 0.8, s) // right too late
    case 5: return -1.6 * Math.sin(s * Math.PI) // swerve left and back
    case 6: return LANE * 1.4 * smooth(0.2, 0.6, s) // off the road edge
    default: return 0.9 * Math.sin(s * Math.PI * 2) // weave
  }
}
export const CANDIDATES = 8

/**
 * Total cost of each candidate along its length — proximity to everything in
 * the scene, plus a comfort term on lateral acceleration (the second difference
 * of the lateral offset) — the evaluation the film shows. The chosen path is
 * whichever scores lowest: computed, never picked by hand.
 */
export function scoreCandidates() {
  const scores: number[] = []
  for (let k = 0; k < CANDIDATES; k++) {
    let c = 0
    let prev = candidateX(k, 0)
    let prevD = 0
    for (let i = 1; i <= 80; i++) {
      const s = i / 80
      const x = candidateX(k, s)
      const z = PATH_START + (PATH_END - PATH_START) * s
      const d = x - prev
      c += cost(x, z) + (d - prevD) ** 2 * 6000
      prev = x
      prevD = d
    }
    scores.push(c)
  }
  // rank: 0 = best
  const rank = scores.map((_, i) => i).sort((a, b) => scores[a] - scores[b])
  const out = new Array(CANDIDATES).fill(0)
  rank.forEach((k, r) => (out[k] = r))
  return { scores, rank: out, best: rank[0] }
}

/** the optimiser's answer */
export const CHOSEN = scoreCandidates().best

/** a small deterministic wobble the optimiser removes from the chosen path */
export const wobble = (s: number) => 0.55 * Math.sin(s * 19.0 + 0.6) * Math.sin(s * Math.PI) + 0.25 * Math.sin(s * 41.0) * Math.sin(s * Math.PI)

/** a stable hash in [0, 1) for index i */
export const hash = (i: number, salt = 0) => {
  const x = Math.sin(i * 127.1 + salt * 311.7) * 43758.5453
  return x - Math.floor(x)
}
