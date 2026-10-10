import { useSyncExternalStore } from 'react'
import { audio } from './AudioEngine'

/** Persistent sound control: four live bars when on, a flat line when muted. */
export function SoundToggle() {
  const muted = useSyncExternalStore(audio.subscribe, audio.isMuted, () => false)
  if (!audio.available) return null
  return (
    <button
      type="button"
      className="sound-toggle"
      data-muted={muted || undefined}
      aria-pressed={!muted}
      aria-label={muted ? 'Turn sound on' : 'Turn sound off'}
      onClick={() => {
        audio.unlock()
        audio.toggle()
      }}
    >
      <span className="sound-bars" aria-hidden>
        <i />
        <i />
        <i />
        <i />
      </span>
      <span className="sound-label">{muted ? 'Sound off' : 'Sound on'}</span>
    </button>
  )
}
