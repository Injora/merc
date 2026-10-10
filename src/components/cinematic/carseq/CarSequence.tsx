import { gsap } from 'gsap'
import { useEffect, useRef, useState } from 'react'
import { ASSETS } from '../../../config/assets'
import { FrameSequence, sizeOf } from './media'

type Props = {
  /** playhead 0–1 through the turntable, read every frame */
  position: () => number
  /** layer opacity 0–1, read every frame */
  opacity?: () => number
  className?: string
}

/**
 * The car as an image sequence (a 360° turntable on black), scrubbed by the
 * caller's playhead and drawn to one persistent canvas. Frames are decoded
 * with createImageBitmap in a bounded window around the playhead. If the
 * frames cannot be loaded, the car's outline is drawn in light instead,
 * progressively, as the playhead advances.
 */
export function CarSequence({ position, opacity = () => 1, className }: Props) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const svg = useRef<SVGSVGElement>(null)
  const [outline, setOutline] = useState<{ d: string; viewBox: string } | null>(null)
  const cfg = ASSETS.sequences.car

  useEffect(() => {
    if (!cfg) return
    let alive = true
    fetch(cfg.outline)
      .then((r) => (r.ok ? r.text() : Promise.reject(new Error(String(r.status)))))
      .then((text) => {
        const doc = new DOMParser().parseFromString(text, 'image/svg+xml')
        const root = doc.querySelector('svg')
        const d = [...doc.querySelectorAll('path')].map((p) => p.getAttribute('d') ?? '').join(' ')
        if (alive && root && d) setOutline({ d, viewBox: root.getAttribute('viewBox') ?? '0 0 1000 400' })
      })
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [cfg])

  useEffect(() => {
    const cv = canvas.current
    const ctx = cv?.getContext('2d')
    if (!cv || !ctx || !cfg) return
    // QA (any build): ?noseq simulates missing frames, to verify the outline fallback
    const broken = new URLSearchParams(window.location.search).has('noseq')
    const seq = new FrameSequence(broken ? '/sequences/__unavailable__/f{n}.webp' : cfg.frames, cfg.count, cfg.pad, 6)
    let last = -1
    let lastW = 0
    const path = () => svg.current?.querySelector('path') as SVGPathElement | null
    let length = 0

    const tick = () => {
      const o = opacity()
      cv.style.opacity = String(o)
      if (svg.current) svg.current.style.opacity = '0'
      if (o <= 0.001) return
      const p = Math.max(0, Math.min(1, position()))
      seq.update(p)
      const frame = seq.frame(p)
      if (!frame || seq.broken) {
        // outline fallback: drawn in light as the playhead advances
        const el = path()
        if (el && svg.current) {
          if (!length) {
            length = el.getTotalLength()
            el.style.strokeDasharray = String(length)
          }
          el.style.strokeDashoffset = String(length * (1 - Math.min(1, p * 1.6)))
          svg.current.style.opacity = String(o)
        }
        return
      }
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5)
      const W = Math.round(cv.clientWidth * dpr)
      const H = Math.round(cv.clientHeight * dpr)
      const i = seq.index(p)
      if (i === last && W === lastW) return
      last = i
      lastW = W
      if (cv.width !== W || cv.height !== H) {
        cv.width = W
        cv.height = H
      }
      const [sw, sh] = sizeOf(frame)
      const fit = Math.min(W / sw, H / sh)
      ctx.fillStyle = '#000'
      ctx.fillRect(0, 0, W, H)
      ctx.drawImage(frame, (W - sw * fit) / 2, (H - sh * fit) / 2, sw * fit, sh * fit)
    }
    gsap.ticker.add(tick)
    return () => {
      gsap.ticker.remove(tick)
      seq.dispose()
    }
  }, [cfg, position, opacity])

  if (!cfg) return null
  return (
    <div className={`car-sequence ${className ?? ''}`} aria-hidden>
      <canvas ref={canvas} />
      {outline && (
        <svg ref={svg} viewBox={outline.viewBox} preserveAspectRatio="xMidYMid meet">
          <path d={outline.d} fill="none" stroke="rgba(236,242,250,0.9)" strokeWidth={1.4} vectorEffect="non-scaling-stroke" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
    </div>
  )
}
