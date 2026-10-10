import { CanvasTexture, SRGBColorSpace, type Texture } from 'three'

/** Small canvas-generated textures: no network requests, no licensing questions. */

function canvas(w: number, h: number) {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  return [c, c.getContext('2d')!] as const
}

/** Engraved legend for the ignition button face (emissive map). */
export function createIgnitionLegend(): Texture {
  const [c, ctx] = canvas(1024, 1024)
  ctx.fillStyle = '#000'
  ctx.fillRect(0, 0, 1024, 1024)
  ctx.fillStyle = '#fff'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  const font = getComputedStyle(document.documentElement).getPropertyValue('--font-sans').trim() || 'sans-serif'
  ctx.font = `500 74px ${font}`
  spaced(ctx, 'START', 512, 452, 22)
  spaced(ctx, 'ENGINE', 512, 552, 22)
  // a fine rule between the words, like an engraved separator
  ctx.globalAlpha = 0.55
  ctx.fillRect(432, 501, 160, 2)
  ctx.globalAlpha = 1
  // a tiny status dot above the legend
  ctx.beginPath()
  ctx.arc(512, 352, 9, 0, Math.PI * 2)
  ctx.fill()
  const t = new CanvasTexture(c)
  t.colorSpace = SRGBColorSpace
  t.anisotropy = 4
  return t
}

function spaced(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, tracking: number) {
  const widths = [...text].map((ch) => ctx.measureText(ch).width)
  const total = widths.reduce((a, b) => a + b, 0) + tracking * (text.length - 1)
  let cx = x - total / 2
  ;[...text].forEach((ch, i) => {
    ctx.fillText(ch, cx + widths[i] / 2, y)
    cx += widths[i] + tracking
  })
}

/** Concentric "spun metal" grain for the button cap (roughness/bump map). */
export function createSpunMetal(): Texture {
  const [c, ctx] = canvas(512, 512)
  const img = ctx.createImageData(512, 512)
  let seed = 7
  const rand = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646
  const rings = new Float32Array(400)
  for (let i = 0; i < rings.length; i++) rings[i] = rand()
  for (let y = 0; y < 512; y++) {
    for (let x = 0; x < 512; x++) {
      const dx = x - 256
      const dy = y - 256
      const r = Math.sqrt(dx * dx + dy * dy)
      const v = 150 + rings[Math.floor(r * 1.4) % rings.length] * 60 + (rand() - 0.5) * 18
      const i = (y * 512 + x) * 4
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v
      img.data[i + 3] = 255
    }
  }
  ctx.putImageData(img, 0, 0)
  return new CanvasTexture(c)
}

/** Soft radial glow for light sprites / bokeh. */
export function createGlow(): Texture {
  const [c, ctx] = canvas(128, 128)
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64)
  g.addColorStop(0, 'rgba(255,255,255,1)')
  g.addColorStop(0.18, 'rgba(255,255,255,0.55)')
  g.addColorStop(0.45, 'rgba(255,255,255,0.12)')
  g.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, 128, 128)
  const t = new CanvasTexture(c)
  t.colorSpace = SRGBColorSpace
  return t
}

/** Soft elliptical contact shadow. */
export function createShadow(): Texture {
  const [c, ctx] = canvas(256, 256)
  const g = ctx.createRadialGradient(128, 128, 0, 128, 128, 128)
  g.addColorStop(0, 'rgba(0,0,0,0.95)')
  g.addColorStop(0.5, 'rgba(0,0,0,0.6)')
  g.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, 256, 256)
  return new CanvasTexture(c)
}

/**
 * A photographic softbox: hot centre, soft falloff to the edges, slightly
 * brighter along one side like a real diffusion panel. Reflected in chrome,
 * the gradient is what reads as "polished metal" instead of flat white.
 */
export function createSoftbox(): Texture {
  const [c, ctx] = canvas(256, 256)
  const img = ctx.createImageData(256, 256)
  for (let y = 0; y < 256; y++) {
    for (let x = 0; x < 256; x++) {
      const u = (x / 255) * 2 - 1
      const v = (y / 255) * 2 - 1
      // super-ellipse falloff (rounded rectangle), plus a gentle vertical gradient
      const d = Math.pow(Math.pow(Math.abs(u), 6) + Math.pow(Math.abs(v), 6), 1 / 6)
      const edge = Math.max(0, 1 - Math.pow(d, 3.5))
      const k = edge * (0.55 + 0.45 * (1 - (v + 1) / 2))
      const i = (y * 256 + x) * 4
      img.data[i] = img.data[i + 1] = img.data[i + 2] = Math.round(255 * k)
      img.data[i + 3] = 255
    }
  }
  ctx.putImageData(img, 0, 0)
  const t = new CanvasTexture(c)
  t.colorSpace = SRGBColorSpace
  return t
}
