import { useEffect, useState } from 'react'
import { StarMark } from './Info'

/**
 * Shown while the 3D stage loads and compiles. No fake percentage: the line
 * is an honest "working" indicator, and after a few seconds the visitor is
 * offered a way straight to the event details.
 */
export function LoadingScreen({ done, onSkip }: { done: boolean; onSkip: () => void }) {
  const [slow, setSlow] = useState(false)
  const [gone, setGone] = useState(false)

  useEffect(() => {
    const t = window.setTimeout(() => setSlow(true), 5000)
    return () => window.clearTimeout(t)
  }, [])
  useEffect(() => {
    if (!done) return
    const t = window.setTimeout(() => setGone(true), 1400)
    return () => window.clearTimeout(t)
  }, [done])

  if (gone) return null
  return (
    <div className="loader" data-done={done} role="status" aria-live="polite">
      <StarMark size={34} className="loader-star" />
      <p className="loader-text">{done ? 'Ready' : 'Preparing the experience'}</p>
      <span className="loader-line" aria-hidden />
      {slow && !done && (
        <button type="button" className="loader-skip" onClick={onSkip}>
          Taking a while — skip to event details
        </button>
      )}
    </div>
  )
}
