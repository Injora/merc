import { BufferGeometry, Float32BufferAttribute, LatheGeometry, TorusGeometry, Vector2 } from 'three'

/**
 * The Mercedes-Benz three-pointed star, built as real faceted 3D geometry.
 *
 * Proportions are measured from the official 2022 star artwork
 * (public/brand/mercedes-benz-star-2022.svg, Mercedes-Benz Group,
 * via Wikimedia Commons), on its 64-unit canvas centred at (32, 32):
 *   ring outer radius 31.3 · ring inner radius 29.4
 *   point (tip) radius ≈ 28.5 · inner vertex radius ≈ 4.9
 * Normalised so the ring's outer radius = 1.
 *
 * Each arm is a separate geometry (ridge from hub to tip, two polished
 * facets) so the emblem can separate into its components.
 */
export const STAR = {
  ringOuter: 1,
  ringInner: 29.4 / 31.3,
  tip: 28.5 / 31.3,
  inner: 4.9 / 31.3,
  ridge: 0.13, // ridge height above the outline plane
  back: 0.035, // depth of the back facet
  edge: 0.012, // half-thickness of the outline wall
}

/** Arm k points along angle 90° + k·120° (k = 0 is the top point). */
export function armAngle(k: number) {
  return Math.PI / 2 + (k * Math.PI * 2) / 3
}

/** Geometry for one arm, in emblem space (arm k already rotated into place). */
export function createArmGeometry(k: number): BufferGeometry {
  const a = armAngle(k)
  const aL = a + Math.PI / 3
  const aR = a - Math.PI / 3
  const { tip, inner, ridge, back, edge } = STAR
  const T = [Math.cos(a) * tip, Math.sin(a) * tip]
  const L = [Math.cos(aL) * inner, Math.sin(aL) * inner]
  const R = [Math.cos(aR) * inner, Math.sin(aR) * inner]

  const positions: number[] = []
  const tri = (p: number[][]) => p.forEach((v) => positions.push(v[0], v[1], v[2]))
  const Cf = [0, 0, ridge]
  const Cb = [0, 0, -back]
  const Tf = [T[0], T[1], edge]
  const Tb = [T[0], T[1], -edge]
  const Lf = [L[0], L[1], edge]
  const Lb = [L[0], L[1], -edge]
  const Rf = [R[0], R[1], edge]
  const Rb = [R[0], R[1], -edge]

  // front facets (CCW seen from +Z)
  tri([Cf, Rf, Tf])
  tri([Cf, Tf, Lf])
  // back facets
  tri([Cb, Tb, Rb])
  tri([Cb, Lb, Tb])
  // outline walls
  tri([Rf, Rb, Tb])
  tri([Rf, Tb, Tf])
  tri([Tf, Tb, Lb])
  tri([Tf, Lb, Lf])
  // hub closure (hidden when assembled, visible when separated)
  tri([Cf, Lf, Lb])
  tri([Cf, Lb, Cb])
  tri([Cf, Cb, Rb])
  tri([Cf, Rb, Rf])

  const g = new BufferGeometry()
  g.setAttribute('position', new Float32BufferAttribute(positions, 3))
  g.computeVertexNormals() // non-indexed → crisp facets
  return g
}

/** The surrounding ring: a rounded chrome band with the official inner/outer radii. */
export function createRingGeometry(): BufferGeometry {
  const { ringOuter, ringInner } = STAR
  const mid = (ringOuter + ringInner) / 2
  const half = (ringOuter - ringInner) / 2
  // a rounded profile, slightly domed at the front, revolved around Z
  const pts: Vector2[] = []
  const depth = 0.05
  const steps = 24
  for (let i = 0; i <= steps; i++) {
    const t = (i / steps) * Math.PI * 2
    const x = mid + Math.cos(t) * half
    const y = Math.sin(t) * depth * (Math.sin(t) > 0 ? 1 : 0.6)
    pts.push(new Vector2(x, y))
  }
  const lathe = new LatheGeometry(pts, 160)
  lathe.rotateX(Math.PI / 2) // lathe axis Y → emblem axis Z
  return lathe
}

/** Thin torus used for the ignition bezel (same radius family as the ring). */
export function createBezelGeometry(radius: number, tube: number) {
  return new TorusGeometry(radius, tube, 32, 200)
}
