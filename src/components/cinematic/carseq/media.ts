/**
 * Image-sequence loading for the car's turntable (the film's fallback and the
 * still version). Stills and sequence frames are fetched and decoded off the
 * main thread with createImageBitmap, drawn to one persistent canvas, and
 * released (ImageBitmap.close) as soon as they fall outside their window, so
 * memory stays bounded however far the visitor scrolls.
 */

export type Drawable = ImageBitmap | HTMLImageElement

export const sizeOf = (d: Drawable): [number, number] => (d instanceof HTMLImageElement ? [d.naturalWidth, d.naturalHeight] : [d.width, d.height])

const canBitmap = typeof window !== 'undefined' && 'createImageBitmap' in window

/** Fetch + decode a still. Resolves to an ImageBitmap where supported (decoded off-thread). */
export async function decodeImage(url: string): Promise<ImageBitmap | HTMLImageElement> {
  if (canBitmap) {
    const res = await fetch(url)
    if (!res.ok) throw new Error(`${res.status} ${url}`)
    return createImageBitmap(await res.blob())
  }
  const img = new Image()
  img.decoding = 'async'
  img.src = url
  await img.decode()
  return img
}

export function release(d: Drawable | null | undefined) {
  if (d && 'close' in d) d.close()
}

/**
 * An ordered image sequence, scrubbed by position (0–1). Only a window of
 * frames around the playhead is decoded at any time (the rest are closed),
 * a few requests at a time, nearest first and biased in the direction of
 * travel. Until the exact frame is ready, the nearest decoded one is drawn.
 */
export class FrameSequence {
  private frames: (ImageBitmap | HTMLImageElement | null)[]
  private pending = new Set<number>()
  private failed = new Set<number>()
  private last = 0
  private disposed = false
  /** bumps whenever a frame finishes decoding (lets the renderer know to redraw) */
  version = 0
  private pattern: string
  private pad: number
  /** frames kept decoded on each side of the playhead */
  private window: number
  private inFlight: number
  readonly count: number

  constructor(pattern: string, count: number, pad: number, window = 10, inFlight = 4) {
    this.pattern = pattern
    this.count = count
    this.pad = pad
    this.window = window
    this.inFlight = inFlight
    this.frames = new Array(count).fill(null)
  }

  url(i: number) {
    return this.pattern.replace('{n}', String(i + 1).padStart(this.pad, '0'))
  }

  index(p: number) {
    return Math.max(0, Math.min(this.count - 1, Math.round(p * (this.count - 1))))
  }

  /** Request frames around `p`, release the far ones. Call every frame while relevant. */
  update(p: number) {
    if (this.disposed) return
    const i = this.index(p)
    const dir = i >= this.last ? 1 : -1
    this.last = i
    // release outside the keep window
    for (let k = 0; k < this.count; k++) {
      if (Math.abs(k - i) > this.window * 1.5 && this.frames[k]) {
        release(this.frames[k])
        this.frames[k] = null
      }
    }
    // request: nearest first, leaning in the direction of travel
    for (let d = 0; d <= this.window && this.pending.size < this.inFlight; d++) {
      for (const k of d === 0 ? [i] : [i + d * dir, i - d * dir]) {
        if (k < 0 || k >= this.count || this.frames[k] || this.pending.has(k) || this.failed.has(k)) continue
        if (this.pending.size >= this.inFlight) break
        this.pending.add(k)
        decodeImage(this.url(k))
          .then((bmp) => {
            if (this.disposed) return release(bmp)
            this.frames[k] = bmp
            this.version++
          })
          .catch(() => this.failed.add(k))
          .finally(() => this.pending.delete(k))
      }
    }
  }

  /** The frame for `p`, or the nearest decoded one; null if none yet. */
  frame(p: number) {
    const i = this.index(p)
    for (let d = 0; d < this.count; d++) {
      const a = this.frames[i - d]
      if (a) return a
      const b = this.frames[i + d]
      if (b) return b
    }
    return null
  }

  /** true once every frame failed — the caller should use its fallback */
  get broken() {
    return this.failed.size === this.count
  }

  dispose() {
    this.disposed = true
    this.frames.forEach(release)
    this.frames.fill(null)
  }
}
