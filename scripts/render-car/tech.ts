/**
 * Dev-only: bakes the car's "digital twin" data from the real model, in the
 * film's car space (prepareCar, same normalisation and rotation as the film):
 *   - feature edges (EdgesGeometry at a crease angle) of the exterior shell
 *   - area-weighted surface samples with normals and a class (body/glass/wheel)
 *   - structural nodes (farthest-point sampling of the body) and sparse links
 * Written as one compact binary (Int16 positions) by scripts/render-car.mjs --tech.
 */
import { Box3, EdgesGeometry, Mesh, Vector3, type Object3D } from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js'
import { MeshSurfaceSampler } from 'three/examples/jsm/math/MeshSurfaceSampler.js'
import { classify, prepareCar } from '../../src/components/cinematic/scene/vehicle/prepare'

export const Q = 8192 // Int16 quantisation: 1 unit = 1/8192 m (±4 m range)

type Part = { mesh: Mesh; cls: 0 | 1 | 2; area: number; interior: boolean }

export async function bakeTech(url: string, opts: { rotationY: number; targetLength: number; points: number; nodes: number; crease: number; maxSegments: number }) {
  const gltf = await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).loadAsync(url)
  const classes = new Map<string, string>()
  gltf.scene.traverse((o) => (o as Mesh).isMesh && classes.set(o.name, classify(o as Mesh)))
  const car = prepareCar(gltf.scene, { targetLength: opts.targetLength, paintColour: null, materials: 'original', clip: [], tier: 'high', rotationY: opts.rotationY })
  const root: Object3D = car.root
  root.updateMatrixWorld(true)
  const whole = new Box3().setFromObject(root)
  const W = whole.getSize(new Vector3())

  // ── parts: exterior shell only (cabin interior would only add noise to the twin) ──
  const parts: Part[] = []
  const box = new Box3()
  const size = new Vector3()
  const c = new Vector3()
  root.traverse((o) => {
    const m = o as Mesh
    if (!m.isMesh) return
    box.setFromObject(m)
    box.getSize(size)
    box.getCenter(c)
    const name = classes.get(m.name) ?? 'other'
    const cls = name === 'glass' ? 1 : name === 'wheel' || name === 'tyre' ? 2 : 0
    // interior: fully inside the cabin volume and not glass/wheel
    const inside = Math.abs(c.x) + size.x / 2 < W.x * 0.42 && box.min.y > W.y * 0.2 && box.max.y < W.y * 0.86 && Math.abs(c.z) + size.z / 2 < W.z * 0.32
    const interior = cls === 0 && inside
    const area = size.x * size.y + size.y * size.z + size.x * size.z
    if (Math.max(size.x, size.y, size.z) < 0.08) return
    parts.push({ mesh: m, cls, area, interior })
  })
  const shell = parts.filter((p) => !p.interior)

  // ── feature edges, raised crease angle until under the segment budget ──
  let crease = opts.crease
  let segs: number[] = []
  for (;;) {
    segs = []
    const v = new Vector3()
    for (const p of shell) {
      const e = new EdgesGeometry(p.mesh.geometry, crease)
      const pos = e.getAttribute('position')
      for (let i = 0; i < pos.count; i++) {
        v.fromBufferAttribute(pos, i).applyMatrix4(p.mesh.matrixWorld)
        segs.push(v.x, v.y, v.z, p.cls)
      }
      e.dispose()
    }
    if (segs.length / 8 <= opts.maxSegments || crease > 80) break
    crease += 6
  }

  // ── surface samples, area-weighted across the shell ──
  const total = shell.reduce((a, p) => a + p.area, 0)
  const pts: number[] = []
  const nrm: number[] = []
  const cls: number[] = []
  const p = new Vector3()
  const n = new Vector3()
  let seed = 7
  const rand = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646
  for (const part of shell) {
    const k = Math.round((part.area / total) * opts.points)
    if (!k) continue
    const s = new MeshSurfaceSampler(part.mesh).setRandomGenerator(rand).build()
    const nm = part.mesh.matrixWorld
    for (let i = 0; i < k; i++) {
      s.sample(p, n)
      p.applyMatrix4(nm)
      n.transformDirection(nm)
      pts.push(p.x, p.y, p.z)
      nrm.push(n.x, n.y, n.z)
      cls.push(part.cls)
    }
  }

  // ── structural nodes: farthest-point sampling over the body samples ──
  const body = cls.map((k, i) => (k === 0 ? i : -1)).filter((i) => i >= 0)
  const nodes: number[] = [body[0]]
  const dmin = new Float32Array(body.length).fill(Infinity)
  const d2 = (a: number, b: number) => (pts[a * 3] - pts[b * 3]) ** 2 + (pts[a * 3 + 1] - pts[b * 3 + 1]) ** 2 + (pts[a * 3 + 2] - pts[b * 3 + 2]) ** 2
  while (nodes.length < opts.nodes) {
    const last = nodes[nodes.length - 1]
    let best = 0
    let bi = 0
    for (let j = 0; j < body.length; j++) {
      const dd = d2(body[j], last)
      if (dd < dmin[j]) dmin[j] = dd
      if (dmin[j] > best) {
        best = dmin[j]
        bi = j
      }
    }
    nodes.push(body[bi])
  }
  // sparse links: each node to its two nearest
  const links = new Set<string>()
  nodes.forEach((a, ia) => {
    const near = nodes.map((b, ib) => [d2(a, b), ib] as const).filter(([, ib]) => ib !== ia).sort((x, y) => x[0] - y[0]).slice(0, 2)
    for (const [, ib] of near) links.add(ia < ib ? `${ia}-${ib}` : `${ib}-${ia}`)
  })

  // ── binary: JSON header + Int16 / Uint8 blocks ──
  const nSeg = segs.length / 8
  const nPts = pts.length / 3
  const linkArr = [...links].map((s) => s.split('-').map(Number)).flat()
  const header = {
    version: 1,
    q: Q,
    segments: nSeg,
    points: nPts,
    nodes: nodes.length,
    links: linkArr.length / 2,
    crease,
    bbox: [whole.min.toArray(), whole.max.toArray()],
    parts: { total: parts.length, shell: shell.length, interior: parts.length - shell.length },
  }
  const q = (v: number) => Math.max(-32767, Math.min(32767, Math.round(v * Q)))
  const segPos = new Int16Array(nSeg * 6)
  const segCls = new Uint8Array(nSeg)
  for (let i = 0; i < nSeg; i++) {
    // two endpoints per segment, 4 numbers each (x, y, z, cls)
    for (let e = 0; e < 2; e++) {
      const o = (i * 2 + e) * 4
      segPos[i * 6 + e * 3] = q(segs[o])
      segPos[i * 6 + e * 3 + 1] = q(segs[o + 1])
      segPos[i * 6 + e * 3 + 2] = q(segs[o + 2])
      segCls[i] = segs[o + 3]
    }
  }
  const ptPos = Int16Array.from(pts, q)
  const ptNrm = Int8Array.from(nrm, (v) => Math.round(v * 127))
  const ptCls = Uint8Array.from(cls)
  const nodeIdx = Uint32Array.from(nodes)
  const linkIdx = Uint16Array.from(linkArr)
  const blocks: ArrayBufferView[] = [segPos, segCls, ptPos, ptNrm, ptCls, nodeIdx, linkIdx]
  const json = new TextEncoder().encode(JSON.stringify(header))
  const pad = (n: number) => (4 - (n % 4)) % 4
  let len = 4 + json.length + pad(json.length)
  for (const b of blocks) len += b.byteLength + pad(b.byteLength)
  const out = new Uint8Array(len)
  new DataView(out.buffer).setUint32(0, json.length, true)
  out.set(json, 4)
  let off = 4 + json.length + pad(json.length)
  for (const b of blocks) {
    out.set(new Uint8Array(b.buffer, b.byteOffset, b.byteLength), off)
    off += b.byteLength + pad(b.byteLength)
  }
  return { header, bytes: out }
}

/** Decode a baked file (shared layout with the film's runtime loader). */
export function decodeTech(buf: ArrayBuffer) {
  const dv = new DataView(buf)
  const jl = dv.getUint32(0, true)
  const header = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 4, jl)))
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
