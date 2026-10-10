import {
  CanvasTexture,
  Color,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  RepeatWrapping,
  Vector2,
  type Material,
  type Plane,
  type Texture,
} from 'three'
import type { Tier } from '../../../../lib/device'

/**
 * Automotive material kit, applied by class to whatever car model is loaded.
 * Original texture maps (normal, AO, roughness) are carried over where the
 * model provides them; the kit supplies the physically based response.
 */

type MaybeMapped = Material & {
  color?: Color
  map?: Texture | null
  normalMap?: Texture | null
  aoMap?: Texture | null
  roughnessMap?: Texture | null
  emissive?: Color
  emissiveMap?: Texture | null
}

let flakes: Texture | null = null

/** Metallic-flake normal map: tiny randomly oriented facets under the clearcoat. */
export function getFlakeNormalMap(): Texture {
  if (flakes) return flakes
  const size = 256
  const c = document.createElement('canvas')
  c.width = c.height = size
  const ctx = c.getContext('2d')!
  const img = ctx.createImageData(size, size)
  let seed = 11
  const rand = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646
  for (let i = 0; i < size * size; i++) {
    // a random facet tilt, mostly facing outward (blue)
    const x = (rand() - 0.5) * 0.6
    const y = (rand() - 0.5) * 0.6
    const z = Math.sqrt(Math.max(0, 1 - x * x - y * y))
    img.data[i * 4] = Math.round((x * 0.5 + 0.5) * 255)
    img.data[i * 4 + 1] = Math.round((y * 0.5 + 0.5) * 255)
    img.data[i * 4 + 2] = Math.round((z * 0.5 + 0.5) * 255)
    img.data[i * 4 + 3] = 255
  }
  ctx.putImageData(img, 0, 0)
  flakes = new CanvasTexture(c)
  flakes.wrapS = flakes.wrapT = RepeatWrapping
  flakes.repeat.set(60, 60)
  return flakes
}

export function carPaint(source: MaybeMapped | null, colour: string | null, clip: Plane[]) {
  const base = colour ? new Color(colour) : (source?.color?.clone() ?? new Color('#9ea3a8'))
  return new MeshPhysicalMaterial({
    color: base,
    metalness: 0.75,
    roughness: 0.38,
    normalMap: getFlakeNormalMap(),
    normalScale: new Vector2(0.12, 0.12),
    clearcoat: 1,
    clearcoatRoughness: 0.025,
    aoMap: source?.aoMap ?? null,
    envMapIntensity: 1.3,
    clippingPlanes: clip,
  })
}

export function carGlass(source: MaybeMapped | null, tier: Tier, clip: Plane[]) {
  const tint = new Color('#11151a')
  if (tier === 'high') {
    return new MeshPhysicalMaterial({
      color: tint.clone().lerp(new Color('#ffffff'), 0.85),
      metalness: 0,
      roughness: 0.03,
      transmission: 1,
      thickness: 0.006,
      ior: 1.52,
      attenuationColor: tint,
      attenuationDistance: 0.25,
      envMapIntensity: 1.4,
      normalMap: source?.normalMap ?? null,
      clippingPlanes: clip,
    })
  }
  // light tier: no transmission pass — a dark, reflective, partly transparent glass
  return new MeshPhysicalMaterial({ color: tint, metalness: 0.1, roughness: 0.04, transparent: true, opacity: 0.55, envMapIntensity: 1.4, clippingPlanes: clip })
}

export function carChrome(clip: Plane[]) {
  return new MeshPhysicalMaterial({ color: '#f1f3f5', metalness: 1, roughness: 0.07, envMapIntensity: 1.6, clippingPlanes: clip })
}

export function carRubber(source: MaybeMapped | null, clip: Plane[]) {
  return new MeshStandardMaterial({
    color: '#0e0e0f',
    roughness: 0.9,
    metalness: 0,
    normalMap: source?.normalMap ?? null,
    aoMap: source?.aoMap ?? null,
    clippingPlanes: clip,
  })
}

export function carRim(source: MaybeMapped | null, clip: Plane[]) {
  return new MeshPhysicalMaterial({
    color: source?.color?.clone() ?? new Color('#8f949a'),
    metalness: 1,
    roughness: 0.22,
    clearcoat: 0.6,
    normalMap: source?.normalMap ?? null,
    envMapIntensity: 1.2,
    clippingPlanes: clip,
  })
}

/** Lamps keep the model's lens/reflector look; the timeline drives their emission. */
export function carLamp(source: MaybeMapped | null, kind: 'head' | 'tail', clip: Plane[]) {
  const m = new MeshPhysicalMaterial({
    color: source?.color?.clone() ?? new Color(kind === 'head' ? '#d9dde2' : '#3a0a08'),
    metalness: 0.2,
    roughness: 0.08,
    clearcoat: 1,
    emissive: new Color(kind === 'head' ? '#eef3ff' : '#ff1a10'),
    emissiveMap: source?.emissiveMap ?? null,
    emissiveIntensity: 0,
    clippingPlanes: clip,
  })
  m.toneMapped = true
  return m
}
