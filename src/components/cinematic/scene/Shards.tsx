import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import { Box3, Matrix4, Object3D, OctahedronGeometry, Quaternion, Vector3, type InstancedMesh, type Mesh } from 'three'
import { MeshSurfaceSampler } from 'three/examples/jsm/math/MeshSurfaceSampler.js'
import { S } from '../../../lib/state'
import { NO } from '../../../lib/gpuprof'
import { useScene, clamp01 } from './SceneContext'

/**
 * The transformation: the separated star breaks into polished fragments
 * that stream across the studio and settle onto the contours of the car —
 * points sampled from the loaded model's own surfaces (until it has loaded,
 * a car-sized envelope). Fragments bound for the nose leave first, so the body
 * materialises front-to-back behind the clipping edge in <Vehicle/>.
 */
export function Shards() {
  const { tier, materials, emblemParts, vehicle } = useScene()
  const count = tier === 'high' ? 1800 : 650
  const mesh = useRef<InstancedMesh>(null)

  const geo = useMemo(() => {
    const g = new OctahedronGeometry(1, 0)
    g.scale(0.034, 0.011, 0.024)
    return g
  }, [])

  const data = useMemo(() => {
    let seed = 42
    const rand = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646
    // placeholder targets: a car-sized envelope (replaced by the model's surface once it exists)
    const end = new Float32Array(count * 3)
    for (let i = 0; i < count; i++) {
      const z = (rand() - 0.5) * 4.6
      const a = rand() * Math.PI
      const taper = 1 - Math.pow(Math.abs(z) / 2.4, 4)
      end[i * 3] = Math.cos(a) * 0.9 * taper
      end[i * 3 + 1] = 0.35 + Math.sin(a) * 0.95 * taper
      end[i * 3 + 2] = z
    }

    const source = new Uint8Array(count) // 0..2 arm, 3 ring
    const local = new Float32Array(count * 3)
    const ctrl = new Float32Array(count * 3)
    const delay = new Float32Array(count)
    const spin = new Float32Array(count * 4)
    const size = new Float32Array(count)
    for (let i = 0; i < count; i++) {
      source[i] = rand() < 0.26 ? 3 : i % 3
      const z = end[i * 3 + 2] // −2.45 nose … +2.45 tail
      delay[i] = clamp01((z + 2.45) / 4.9) * 0.5 + rand() * 0.08
      ctrl[i * 3] = (rand() - 0.5) * 3.2
      ctrl[i * 3 + 1] = rand() * 1.8 + 0.2
      ctrl[i * 3 + 2] = (rand() - 0.5) * 3.2
      spin[i * 4] = rand() - 0.5
      spin[i * 4 + 1] = rand() - 0.5
      spin[i * 4 + 2] = rand() - 0.5
      spin[i * 4 + 3] = 4 + rand() * 8
      size[i] = 0.6 + rand() * 0.9
    }
    return { end, source, local, ctrl, delay, spin, size, rand, sampled: false, onCar: false }
  }, [count])

  useEffect(() => () => geo.dispose(), [geo])

  const tmp = useMemo(
    () => ({ m: new Matrix4(), p: new Vector3(), s: new Vector3(), a: new Vector3(), e: new Vector3(), c: new Vector3(), q: new Quaternion(), axis: new Vector3(), fallback: new Object3D() }),
    [],
  )

  /** Lazily sample points on the emblem's actual geometry once it exists. */
  const sampleEmblem = () => {
    const { arms } = emblemParts
    const armMeshes = arms.map((a) => a.children[0] as Mesh | undefined)
    for (let i = 0; i < count; i++) {
      const src = data.source[i]
      const r = data.rand
      if (src < 3 && armMeshes[src]) {
        const pos = armMeshes[src]!.geometry.getAttribute('position')
        // random point inside a random triangle
        const tri = Math.floor(r() * (pos.count / 3)) * 3
        let u = r()
        let v = r()
        if (u + v > 1) {
          u = 1 - u
          v = 1 - v
        }
        const w = 1 - u - v
        for (let k = 0; k < 3; k++) {
          data.local[i * 3 + k] = pos.getComponent(tri, k) * w + pos.getComponent(tri + 1, k) * u + pos.getComponent(tri + 2, k) * v
        }
      } else {
        const a = r() * Math.PI * 2
        const rad = 0.94 + r() * 0.06
        data.local[i * 3] = Math.cos(a) * rad
        data.local[i * 3 + 1] = Math.sin(a) * rad
        data.local[i * 3 + 2] = (r() - 0.5) * 0.06
        if (src < 3) data.source[i] = 3
      }
    }
    data.sampled = true
  }

  /** Once the car exists, re-target every fragment onto its visible surfaces (area-weighted per mesh). */
  const sampleCar = (model: Object3D) => {
    model.updateMatrixWorld(true)
    const meshes: { mesh: Mesh; area: number }[] = []
    const box = new Box3()
    const size = new Vector3()
    model.traverse((o) => {
      const mm = o as Mesh
      if (!mm.isMesh || !mm.geometry.getAttribute('position')) return
      box.setFromObject(mm).getSize(size)
      // skip small parts (badges, bolts, cabin details): the body, glass and wheels carry the shape
      if (Math.max(size.x, size.y, size.z) < 0.35) return
      meshes.push({ mesh: mm, area: size.x * size.z + size.y * size.z + size.x * size.y })
    })
    if (!meshes.length) return
    const total = meshes.reduce((a, b) => a + b.area, 0)
    const p = new Vector3()
    let i = 0
    for (const { mesh: mm, area } of meshes) {
      const n = Math.round((area / total) * count)
      if (!n) continue
      const sampler = new MeshSurfaceSampler(mm).build()
      for (let k = 0; k < n && i < count; k++, i++) {
        sampler.sample(p)
        p.applyMatrix4(mm.matrixWorld)
        data.end[i * 3] = p.x
        data.end[i * 3 + 1] = p.y
        data.end[i * 3 + 2] = p.z
      }
    }
    // keep the nose-first launch order
    for (let k = 0; k < count; k++) data.delay[k] = clamp01((data.end[k * 3 + 2] + 2.45) / 4.9) * 0.5 + data.rand() * 0.08
    data.onCar = true
  }

  useFrame(() => {
    const m = mesh.current
    if (!m) return
    const T = S.shards
    const active = T > 0.001 && T < 0.999 && S.studio > 0.5 && !NO.has('shards')
    m.visible = active
    if (!data.onCar && vehicle.model) sampleCar(vehicle.model)
    if (!active) return
    if (!data.sampled) sampleEmblem()

    const { arms, ring } = emblemParts
    const { p, s, a, e, c, q, axis, fallback } = tmp
    for (let i = 0; i < count; i++) {
      const lt = clamp01((T - data.delay[i]) / 0.42)
      // ease: hold, launch, glide in
      const k = lt * lt * (3 - 2 * lt)
      const src = data.source[i]
      const holder = (src < 3 ? arms[src] : ring) ?? fallback
      a.set(data.local[i * 3], data.local[i * 3 + 1], data.local[i * 3 + 2]).applyMatrix4(holder.matrixWorld)
      e.set(data.end[i * 3], data.end[i * 3 + 1], data.end[i * 3 + 2])
      c.copy(a).lerp(e, 0.5)
      c.x += data.ctrl[i * 3]
      c.y += data.ctrl[i * 3 + 1]
      c.z += data.ctrl[i * 3 + 2]
      // quadratic bezier a → c → e
      const ik = 1 - k
      p.set(
        ik * ik * a.x + 2 * ik * k * c.x + k * k * e.x,
        ik * ik * a.y + 2 * ik * k * c.y + k * k * e.y,
        ik * ik * a.z + 2 * ik * k * c.z + k * k * e.z,
      )
      axis.set(data.spin[i * 4], data.spin[i * 4 + 1], data.spin[i * 4 + 2]).normalize()
      q.setFromAxisAngle(axis, k * data.spin[i * 4 + 3] + i)
      const arrive = lt > 0.82 ? 1 - (lt - 0.82) / 0.18 : 1
      const scale = data.size[i] * arrive * (T < 0.06 ? T / 0.06 : 1)
      s.setScalar(Math.max(0.0001, scale))
      tmp.m.compose(p, q, s)
      m.setMatrixAt(i, tmp.m)
    }
    m.instanceMatrix.needsUpdate = true
  })

  return <instancedMesh ref={mesh} args={[geo, materials.chrome, count]} frustumCulled={false} visible={false} />
}
