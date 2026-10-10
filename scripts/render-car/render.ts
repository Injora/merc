/**
 * Dev-only: turntable frames + outline tracing for ASSETS.sequences.car.
 * Uses the film's own prepareCar() and automotive material kit.
 */
import {
  ACESFilmicToneMapping,
  Box3,
  CanvasTexture,
  Color,
  EquirectangularReflectionMapping,
  Mesh,
  MeshBasicMaterial,
  OrthographicCamera,
  PerspectiveCamera,
  PlaneGeometry,
  PMREMGenerator,
  Scene,
  SRGBColorSpace,
  Vector3,
  WebGLRenderer,
  type Material,
  type Object3D,
} from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { HDRLoader } from 'three/examples/jsm/loaders/HDRLoader.js'
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js'
import { classify, prepareCar } from '../../src/components/cinematic/scene/vehicle/prepare'
import { bakeTech, decodeTech } from './tech'
import { BufferAttribute, BufferGeometry, LineBasicMaterial, LineSegments, Points, PointsMaterial } from 'three'

const W = 1600
const H = 900
const renderer = new WebGLRenderer({ antialias: true, preserveDrawingBuffer: true })
renderer.setSize(W, H)
renderer.setPixelRatio(1)
renderer.toneMapping = ACESFilmicToneMapping
renderer.toneMappingExposure = 0.78
renderer.outputColorSpace = SRGBColorSpace
renderer.localClippingEnabled = true
document.body.appendChild(renderer.domElement)

const scene = new Scene()
scene.background = new Color('#000')
const camera = new PerspectiveCamera(26, W / H, 0.1, 100)
const classes = new Map<string, string>()

async function setup() {
  const pmrem = new PMREMGenerator(renderer)
  const hdr = await new HDRLoader().loadAsync('/hdri/studio_small_09_1k.hdr')
  hdr.mapping = EquirectangularReflectionMapping
  scene.environment = pmrem.fromEquirectangular(hdr).texture
  scene.environmentIntensity = 0.75

  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder)
  const gltf = await loader.loadAsync('/models/car/mercedes-amg-c63.glb')
  // classify on the source (the kit replaces the materials whose names classification reads)
  gltf.scene.traverse((o) => (o as Mesh).isMesh && classes.set(o.name, classify(o as Mesh)))
  const car = prepareCar(gltf.scene, { targetLength: 4.75, paintColour: null, materials: 'kit', clip: [], tier: 'high' })
  scene.add(car.root)

  // a soft contact shadow on black (radial gradient decal)
  const c = document.createElement('canvas')
  c.width = c.height = 256
  const g = c.getContext('2d')!
  const grad = g.createRadialGradient(128, 128, 0, 128, 128, 128)
  grad.addColorStop(0, 'rgba(0,0,0,0.85)')
  grad.addColorStop(1, 'rgba(0,0,0,0)')
  g.fillStyle = grad
  g.fillRect(0, 0, 256, 256)
  const shadow = new Mesh(new PlaneGeometry(6.2, 3.2), new MeshBasicMaterial({ map: new CanvasTexture(c), transparent: true, depthWrite: false }))
  shadow.rotation.x = -Math.PI / 2
  shadow.position.y = 0.002
  scene.add(shadow)
  // a dim floor so the shadow and reflections have something to sit in
  const floor = new Mesh(new PlaneGeometry(40, 40), new MeshBasicMaterial({ color: '#050506' }))
  floor.rotation.x = -Math.PI / 2
  scene.add(floor)
  return car.root
}

const ready = setup()

/** Turntable frame i of n: camera orbits at 3/4 height. Returns a WebP data URL. */
async function frame(i: number, n: number) {
  await ready
  const a = (i / n) * Math.PI * 2 + Math.PI * 0.22
  const r = 7.1
  camera.position.set(Math.sin(a) * r, 1.35, Math.cos(a) * r)
  camera.lookAt(0, 0.55, 0)
  renderer.render(scene, camera)
  return renderer.domElement.toDataURL('image/webp', 0.82)
}

/** Side-view silhouettes (body, glass, wheels) traced into one SVG. */
async function outline() {
  const root: Object3D = await ready
  const box = new Box3().setFromObject(root)
  const size = box.getSize(new Vector3())
  const pad = 0.25
  const ortho = new OrthographicCamera(-size.z / 2 - pad, size.z / 2 + pad, size.y + pad, -pad, 0.1, 50)
  ortho.position.set(20, 0, 0)
  ortho.lookAt(0, 0, 0)
  ortho.position.y = 0
  const MW = 2000
  const MH = Math.round((MW * (size.y + 2 * pad)) / (size.z + 2 * pad))
  renderer.setSize(MW, MH)
  const white = new MeshBasicMaterial({ color: '#fff' })
  const saved = new Map<Mesh, Material | Material[]>()
  const meshes: Mesh[] = []
  root.traverse((o) => (o as Mesh).isMesh && meshes.push(o as Mesh))
  const helpers: Object3D[] = []
  scene.traverse((o) => o !== scene && !isDescendant(o, root) && o.parent === scene && helpers.push(o))
  helpers.forEach((h) => (h.visible = false))
  scene.background = new Color('#000')
  scene.environment = null

  const mask = (pick: (m: Mesh) => boolean) => {
    for (const m of meshes) {
      saved.set(m, m.material)
      m.material = white
      m.visible = pick(m)
    }
    renderer.toneMapping = 0 as never
    renderer.render(scene, ortho)
    const data = new Uint8Array(MW * MH * 4)
    const gl = renderer.getContext()
    gl.readPixels(0, 0, MW, MH, gl.RGBA, gl.UNSIGNED_BYTE, data)
    for (const m of meshes) {
      m.material = saved.get(m)!
      m.visible = true
    }
    // flip Y, threshold
    const bin = new Uint8Array(MW * MH)
    for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) bin[y * MW + x] = data[((MH - 1 - y) * MW + x) * 4] > 127 ? 1 : 0
    return bin
  }
  const cls = (m: Mesh) => classes.get(m.name) ?? 'other'
  const paths: string[] = []
  paths.push(...trace(mask(() => true), MW, MH, 4000, 1.6))
  paths.push(...trace(mask((m) => cls(m) === 'glass'), MW, MH, 1500, 1.6))
  paths.push(...trace(mask((m) => cls(m) === 'wheel' || cls(m) === 'tyre'), MW, MH, 2500, 1.2))
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${MW} ${MH}"><path d="${paths.join(' ')}" fill="none" stroke="#fff" stroke-width="2"/></svg>`
}

function isDescendant(o: Object3D, root: Object3D) {
  for (let p: Object3D | null = o; p; p = p.parent) if (p === root) return true
  return false
}

/** Outer contours (Moore-neighbour tracing) of every component above minArea, simplified (RDP). */
function trace(bin: Uint8Array, w: number, h: number, minArea: number, eps: number) {
  const seen = new Uint8Array(w * h)
  const out: string[] = []
  const at = (x: number, y: number) => (x >= 0 && y >= 0 && x < w && y < h ? bin[y * w + x] : 0)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x
      if (!bin[i] || seen[i]) continue
      // flood-fill the component (area + mark)
      let area = 0
      const stack = [i]
      seen[i] = 1
      while (stack.length) {
        const j = stack.pop()!
        area++
        const jx = j % w
        const jy = (j / w) | 0
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = jx + dx
          const ny = jy + dy
          const k = ny * w + nx
          if (nx >= 0 && ny >= 0 && nx < w && ny < h && bin[k] && !seen[k]) {
            seen[k] = 1
            stack.push(k)
          }
        }
      }
      if (area < minArea) continue
      // Moore tracing from the component's first (top-left) pixel
      const dirs = [[-1, 0], [-1, -1], [0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1]]
      const pts: [number, number][] = [[x, y]]
      let cx = x
      let cy = y
      let back = 0 // we entered from the west
      for (let guard = 0; guard < w * h; guard++) {
        let found = false
        for (let k = 0; k < 8; k++) {
          const d = (back + 1 + k) % 8
          const nx = cx + dirs[d][0]
          const ny = cy + dirs[d][1]
          if (at(nx, ny)) {
            back = (d + 4) % 8
            cx = nx
            cy = ny
            found = true
            break
          }
        }
        if (!found || (cx === x && cy === y)) break
        pts.push([cx, cy])
      }
      const s = rdp(pts, eps)
      if (s.length > 3) out.push('M' + s.map(([px, py]) => `${px} ${py}`).join('L') + 'Z')
    }
  }
  return out
}

function rdp(pts: [number, number][], eps: number): [number, number][] {
  if (pts.length < 3) return pts
  const [ax, ay] = pts[0]
  const [bx, by] = pts[pts.length - 1]
  let dmax = 0
  let idx = 0
  const len = Math.hypot(bx - ax, by - ay) || 1
  for (let i = 1; i < pts.length - 1; i++) {
    const d = Math.abs((by - ay) * pts[i][0] - (bx - ax) * pts[i][1] + bx * ay - by * ax) / len
    if (d > dmax) {
      dmax = d
      idx = i
    }
  }
  if (dmax > eps) return [...rdp(pts.slice(0, idx + 1), eps).slice(0, -1), ...rdp(pts.slice(idx), eps)]
  return [pts[0], pts[pts.length - 1]]
}

/** The car's digital-twin data (see tech.ts), base64 for transport. */
async function tech() {
  const { header, bytes } = await bakeTech('/models/car/mercedes-amg-c63.glb', { rotationY: Math.PI, targetLength: 4.75, points: 14000, nodes: 72, crease: 28, maxSegments: 60000 })
  let bin = ''
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return { header, b64: btoa(bin) }
}

/** Preview the baked twin: edges or points, from a 3/4 or side view. */
async function previewTech(what: 'edges' | 'points', view: 'side' | 'three') {
  const buf = await (await fetch('/models/car/mercedes-amg-c63.tech.bin')).arrayBuffer()
  const t = decodeTech(buf)
  const s = new Scene()
  s.background = new Color('#000')
  if (what === 'edges') {
    const g = new BufferGeometry()
    g.setAttribute('position', new BufferAttribute(Float32Array.from(t.segPos, (v) => v / t.header.q), 3))
    s.add(new LineSegments(g, new LineBasicMaterial({ color: '#cfe6ff', transparent: true, opacity: 0.55 })))
  } else {
    const g = new BufferGeometry()
    g.setAttribute('position', new BufferAttribute(Float32Array.from(t.ptPos, (v) => v / t.header.q), 3))
    s.add(new Points(g, new PointsMaterial({ color: '#cfe6ff', size: 2, sizeAttenuation: false })))
  }
  renderer.setSize(W, H)
  const cam = new PerspectiveCamera(26, W / H, 0.1, 100)
  if (view === 'side') cam.position.set(11, 0.8, 0)
  else cam.position.set(-6, 2.6, -6)
  cam.lookAt(0, 0.6, 0)
  renderer.render(s, cam)
  return renderer.domElement.toDataURL('image/png')
}

Object.assign(window, { renderCar: { frame, outline, tech, previewTech, ready: ready.then(() => true) } })
