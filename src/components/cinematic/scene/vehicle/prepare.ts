import { Box3, Group, Object3D, Vector3, type Material, type Mesh, type MeshPhysicalMaterial, type Plane } from 'three'
import type { Tier } from '../../../../lib/device'
import { carChrome, carGlass, carLamp, carPaint, carRim, carRubber } from './materials'

/**
 * Turns any delivered car GLB into a predictable rig:
 *   1. normalise — up axis = the smallest extent, length along Z, front to −Z
 *      (decided by where the headlamps are), scaled to `targetLength`,
 *      wheels on Y = 0, centred on X/Z;
 *   2. classify every mesh by node + material name (paint, glass, lamps,
 *      wheels, tyres, chrome);
 *   3. re-parent each wheel's meshes under a pivot at its hub so it can spin;
 *   4. apply the automotive material kit and the reveal clipping plane.
 */

export type CarClass = 'paint' | 'glass' | 'head' | 'tail' | 'wheel' | 'tyre' | 'chrome' | 'other'

export type PreparedCar = {
  root: Group
  wheels: Object3D[]
  lamps: { head: MeshPhysicalMaterial[]; tail: MeshPhysicalMaterial[] }
  report: Record<CarClass, number> & { length: number; flippedFront: boolean; upFix: string; spinningWheels: boolean }
}

const RX = {
  interior: /interior|cabin|seat|dash|steer|pedal|floor ?mat/i,
  head: /head.?(light|lamp)|\bdrl\b|front.?lamp/i,
  tail: /tail.?(light|lamp)|brake.?light|rear.?(light|lamp)|stop.?light/i,
  glass: /glass|window|windshield|windscreen/i,
  tyre: /tyre|tire|rubber/i,
  wheel: /wheel|\brim|disc|caliper|\bhub\b|lug/i,
  chrome: /chrome/i,
  paint: /paint|carpaint|body.?colou?r|exterior.?colou?r/i,
}

function namesOf(mesh: Mesh) {
  const mats = (Array.isArray(mesh.material) ? mesh.material : [mesh.material]) as Material[]
  return [mesh.name, mesh.parent?.name ?? '', mesh.parent?.parent?.name ?? '', ...mats.map((m) => m.name)].join(' | ')
}

export function classify(mesh: Mesh): CarClass {
  const n = namesOf(mesh)
  const interior = RX.interior.test(mesh.name) || RX.interior.test(mesh.parent?.name ?? '')
  if (RX.head.test(n)) return 'head'
  if (RX.tail.test(n)) return 'tail'
  if (RX.glass.test(n)) return 'glass'
  if (interior) return 'other'
  if (RX.tyre.test(n)) return 'tyre'
  if (RX.wheel.test(n)) return 'wheel'
  if (RX.chrome.test(n)) return 'chrome'
  if (RX.paint.test(n)) return 'paint'
  return 'other'
}

const tmpBox = new Box3()
const tmpV = new Vector3()

function centroidOf(meshes: Mesh[]) {
  const c = new Vector3()
  if (!meshes.length) return null
  for (const m of meshes) c.add(tmpBox.setFromObject(m).getCenter(tmpV))
  return c.divideScalar(meshes.length)
}

export function prepareCar(
  source: Object3D,
  opts: {
    targetLength: number
    paintColour: string | null
    materials: 'kit' | 'original'
    clip: Plane[]
    tier: Tier
    /** extra turn about Y after automatic orientation (e.g. π when a model has no lamp names to find its front by) */
    rotationY?: number
  },
): PreparedCar {
  const model = source.clone(true)
  const orient = new Group()
  const scaler = new Group()
  const root = new Group()
  orient.add(model)
  scaler.add(orient)
  root.add(scaler)
  root.updateMatrixWorld(true)

  // ── classify (names are independent of orientation) ──
  const meshes: Mesh[] = []
  model.traverse((o) => (o as Mesh).isMesh && meshes.push(o as Mesh))
  const byClass = new Map<Mesh, CarClass>()
  for (const m of meshes) byClass.set(m, classify(m))
  const of = (c: CarClass) => meshes.filter((m) => byClass.get(m) === c)

  // ── 1 · up axis: a car is lower than it is wide or long ──
  let size = new Box3().setFromObject(root).getSize(new Vector3())
  let upFix = 'none'
  if (size.z < size.y && size.z <= size.x) {
    orient.rotation.x = -Math.PI / 2 // Z-up export
    upFix = 'z-up'
  } else if (size.x < size.y && size.x <= size.z) {
    orient.rotation.z = Math.PI / 2 // X-up export
    upFix = 'x-up'
  }
  root.updateMatrixWorld(true)

  // ── 2 · length along Z ──
  size = new Box3().setFromObject(root).getSize(new Vector3())
  if (size.x > size.z) {
    orient.rotateOnWorldAxis(new Vector3(0, 1, 0), Math.PI / 2)
    root.updateMatrixWorld(true)
  }

  // ── 3 · front towards −Z: headlamps decide (tail lamps as a fallback) ──
  let box = new Box3().setFromObject(root)
  const centre = box.getCenter(new Vector3())
  const head = centroidOf(of('head'))
  const tail = centroidOf(of('tail'))
  let flippedFront = false
  if ((head && head.z > centre.z) || (!head && tail && tail.z < centre.z)) {
    orient.rotateOnWorldAxis(new Vector3(0, 1, 0), Math.PI)
    root.updateMatrixWorld(true)
    flippedFront = true
  }
  if (opts.rotationY) {
    orient.rotateOnWorldAxis(new Vector3(0, 1, 0), opts.rotationY)
    root.updateMatrixWorld(true)
  }

  // ── 4 · scale to length, wheels on the floor, centred ──
  box = new Box3().setFromObject(root)
  size = box.getSize(new Vector3())
  scaler.scale.setScalar(opts.targetLength / Math.max(1e-6, size.z))
  root.updateMatrixWorld(true)
  box = new Box3().setFromObject(root)
  const c = box.getCenter(new Vector3())
  scaler.position.set(-c.x, -box.min.y, -c.z)
  root.updateMatrixWorld(true)

  // ── 5 · wheel pivots: cluster wheel/tyre meshes into four corners ──
  // Only when every wheel mesh is one compact wheel: some exports merge a whole
  // axle (or all four wheels) into one mesh, which cannot spin about a hub —
  // those wheels stay still rather than orbit the car.
  const wheelMeshes = [...of('wheel'), ...of('tyre')]
  const width = new Box3().setFromObject(root).getSize(new Vector3()).x
  const compact = wheelMeshes.every((m) => {
    const sz = tmpBox.setFromObject(m).getSize(tmpV)
    return sz.x < width * 0.45 && sz.z < 1.2 && sz.y < 1.2
  })
  const corners = new Map<string, Mesh[]>()
  for (const m of compact ? wheelMeshes : []) {
    const p = tmpBox.setFromObject(m).getCenter(tmpV)
    const key = `${p.x < 0 ? 'L' : 'R'}${p.z < 0 ? 'F' : 'B'}`
    if (!corners.has(key)) corners.set(key, [])
    corners.get(key)!.push(m)
  }
  const wheels: Object3D[] = []
  for (const [key, group] of corners) {
    const b = new Box3()
    group.forEach((m) => b.expandByObject(m))
    const pivot = new Object3D()
    pivot.name = `wheel-pivot-${key}`
    b.getCenter(pivot.position)
    root.add(pivot)
    pivot.updateMatrixWorld(true)
    group.forEach((m) => pivot.attach(m)) // keeps world transform
    wheels.push(pivot)
  }

  // ── 6 · materials ──
  const lamps = { head: [] as MeshPhysicalMaterial[], tail: [] as MeshPhysicalMaterial[] }
  const cache = new Map<string, Material>()
  for (const m of meshes) {
    const cls = byClass.get(m)!
    const swap = (mat: Material): Material => {
      const key = `${cls}:${mat.uuid}`
      const hit = cache.get(key)
      if (hit) return hit
      let next: Material = mat
      const src = mat as Parameters<typeof carPaint>[0]
      if (opts.materials === 'kit') {
        if (cls === 'paint') next = carPaint(src, opts.paintColour, opts.clip)
        else if (cls === 'glass') next = carGlass(src, opts.tier, opts.clip)
        else if (cls === 'tyre') next = carRubber(src, opts.clip)
        else if (cls === 'wheel') next = carRim(src, opts.clip)
        else if (cls === 'chrome') next = carChrome(opts.clip)
      }
      if (cls === 'head' || cls === 'tail') {
        const lamp = carLamp(src, cls, opts.clip)
        lamps[cls].push(lamp)
        next = lamp
      }
      if (next === mat) {
        next = mat.clone()
        next.clippingPlanes = opts.clip
        if ('envMapIntensity' in next) (next as Material & { envMapIntensity: number }).envMapIntensity = 1.2
      }
      cache.set(key, next)
      return next
    }
    m.material = Array.isArray(m.material) ? m.material.map(swap) : swap(m.material)
    m.castShadow = true
  }

  const report = { paint: 0, glass: 0, head: 0, tail: 0, wheel: 0, tyre: 0, chrome: 0, other: 0, length: opts.targetLength, flippedFront, upFix, spinningWheels: wheels.length > 0 }
  for (const cls of byClass.values()) report[cls]++
  return { root, wheels, lamps, report }
}
