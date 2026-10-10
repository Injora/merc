import { useSyncExternalStore } from 'react'
import { audio } from './AudioEngine'

/**
 * Persistent sound control, bottom right: the bars toggle mute (four live bars
 * when on, a flat line when muted); the slider beside them sets the volume.
 * On desktop the slider slides open on hover or keyboard focus; on touch
 * screens it is always shown. Volume and mute are remembered.
 */
export function SoundToggle() {
  const muted = useSyncExternalStore(audio.subscribe, audio.isMuted, () => false)
  const volume = useSyncExternalStore(audio.subscribe, audio.getVolume, () => 0.8)
  if (!audio.available) return null
  const shown = muted ? 0 : Math.round(volume * 100)
  return (
    <div className="sound-control" data-muted={muted || undefined}>
      <label className="sound-volume">
        <span className="sr-only">Volume</span>
        <input
          type="range"
          min={0}
          max={100}
          step={1}
          value={shown}
          aria-valuetext={muted ? 'Muted' : `${shown}%`}
          style={{ ['--fill' as string]: `${shown}%` }}
          onChange={(e) => {
            audio.unlock()
            audio.setVolume(Number(e.currentTarget.value) / 100)
          }}
        />
      </label>
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
    </div>
  )
}
