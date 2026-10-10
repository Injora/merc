import { ASSETS } from '../config/assets'


/**
 * Sound design on the Web Audio API, synthesised in real time (zero files
 * needed). A file configured in `ASSETS.audio` replaces the matching layer;
 * a failed or missing file falls back to synthesis.
 *
 *  - click:  the START ENGINE button.
 *  - engine: plays ONCE on ignition — starter crank, catch, a short rev — and
 *            fades out and stops as the star is revealed. It never returns.
 *  - music:  the background track (ASSETS.audio.music, /audio/bgm.mp3), looped.
 *            It starts once the engine has died away and the star is on screen,
 *            plays under the film, and fades out as the hackathon name appears
 *            (scrolling back up brings it back).
 *  - whoosh: soft air on scene cuts.
 *
 * Nothing is created before an explicit user gesture (autoplay policy).
 */

export type MixParams = {
  presence: number // music: 1 in the film, 0 from the hackathon title on
}

const STORAGE_KEY = 'nst-sdc:sound'
const VOLUME_KEY = 'nst-sdc:volume'
const MASTER_LEVEL = 0.72
/** the volume slider's starting point (0–1); output gain follows volume², so the slider feels even */
const DEFAULT_VOLUME = 0.8
/** the background track: clearly audible, still under the engine — ≈ −24 dBFS RMS at the default volume (measured, scripts/audio-check.mjs) */
const MUSIC_LEVEL = 0.8
/** the track starts this long after ignition(): the engine has faded (from 1.85 s) and the star is on screen */
const MUSIC_START = 2.9
/** seconds after ignition() at which the engine fades out (the star appears ≈ 1.9 s in) */
const ENGINE_STOP = 1.85

type Buffers = Partial<Record<keyof typeof ASSETS.audio, AudioBuffer>>

class AudioEngine {
  private ctx: AudioContext | null = null
  private master: GainNode | null = null
  private noise: AudioBuffer | null = null
  private buffers: Buffers = {}

  // engine (one-shot)
  private rpmSource: ConstantSourceNode | null = null
  private engineOut: GainNode | null = null
  private engineTone: BiquadFilterNode | null = null
  // music
  private musicLoop: AudioBufferSourceNode | null = null
  private musicGain: GainNode | null = null
  private musicAt: number | null = null
  private musicFadeEnd = 0
  private presence = 1

  private nodes: AudioScheduledSourceNode[] = []
  private running = false
  private muted: boolean
  private volume = DEFAULT_VOLUME
  private listeners = new Set<() => void>()
  private suspendTimer: number | null = null

  constructor() {
    let stored: string | null = null
    try {
      stored = localStorage.getItem(STORAGE_KEY)
    } catch {
      /* storage unavailable */
    }
    this.muted = stored === 'off'
    try {
      const v = parseFloat(localStorage.getItem(VOLUME_KEY) ?? '')
      if (Number.isFinite(v)) this.volume = Math.max(0, Math.min(1, v))
    } catch {
      /* storage unavailable */
    }
  }

  /* ───────────────────────── public API ───────────────────────── */

  get available() {
    return typeof window !== 'undefined' && ('AudioContext' in window || 'webkitAudioContext' in window)
  }

  isMuted = () => this.muted

  getVolume = () => this.volume

  /** the master output gain for the current volume (0 when muted) */
  private outLevel() {
    return this.muted ? 0 : MASTER_LEVEL * this.volume * this.volume
  }

  /** Set the overall volume (0–1). Sliding to 0 mutes; sliding up from muted unmutes. */
  setVolume(v: number) {
    this.volume = Math.max(0, Math.min(1, v))
    try {
      localStorage.setItem(VOLUME_KEY, String(this.volume))
    } catch {
      /* ignore */
    }
    if (this.volume < 0.01) return this.setMuted(true)
    if (this.muted) return this.setMuted(false)
    this.listeners.forEach((fn) => fn())
    if (this.ctx && this.master) this.master.gain.setTargetAtTime(this.outLevel(), this.ctx.currentTime, 0.06)
  }

  subscribe = (fn: () => void) => {
    this.listeners.add(fn)
    return () => {
      this.listeners.delete(fn)
    }
  }

  setMuted(muted: boolean) {
    this.muted = muted
    // unmuting at zero volume would be silent: bring the slider back to its default
    if (!muted && this.volume < 0.01) this.volume = DEFAULT_VOLUME
    try {
      localStorage.setItem(STORAGE_KEY, muted ? 'off' : 'on')
    } catch {
      /* ignore */
    }
    this.listeners.forEach((fn) => fn())
    const ctx = this.ctx
    if (!ctx || !this.master) return
    if (this.suspendTimer) window.clearTimeout(this.suspendTimer)
    if (muted) {
      this.master.gain.setTargetAtTime(0, ctx.currentTime, 0.08)
      this.suspendTimer = window.setTimeout(() => void ctx.suspend().catch(() => {}), 600)
    } else {
      void ctx.resume().catch(() => {})
      this.master.gain.setTargetAtTime(this.outLevel(), ctx.currentTime, 0.12)
    }
  }

  toggle = () => this.setMuted(!this.muted)

  /** Must be called from inside a user gesture handler. */
  unlock(): boolean {
    if (!this.available) return false
    if (!this.ctx) {
      try {
        const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
        this.ctx = new Ctor({ latencyHint: 'interactive' })
      } catch {
        return false
      }
      this.buildGraph()
      void this.loadFiles()
      document.addEventListener('visibilitychange', this.onVisibility)
    }
    if (!this.muted) void this.ctx.resume().catch(() => {})
    return true
  }

  /** Mechanical, tactile button click. */
  click() {
    const ctx = this.ctx
    if (!ctx || !this.master) return
    if (this.buffers.click) return this.playBuffer(this.buffers.click, 0.9)
    const t = ctx.currentTime
    // high transient
    const n = this.noiseSource()
    const hp = this.filter('highpass', 2400, 0.7)
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(0.5, t + 0.002)
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.03)
    n.connect(hp).connect(g).connect(this.master)
    n.start(t)
    n.stop(t + 0.05)
    // body "thock"
    const o = ctx.createOscillator()
    o.type = 'sine'
    o.frequency.setValueAtTime(190, t)
    o.frequency.exponentialRampToValueAtTime(70, t + 0.07)
    const og = ctx.createGain()
    og.gain.setValueAtTime(0.0001, t)
    og.gain.exponentialRampToValueAtTime(0.55, t + 0.004)
    og.gain.exponentialRampToValueAtTime(0.0001, t + 0.11)
    o.connect(og).connect(this.master)
    o.start(t)
    o.stop(t + 0.14)
  }

  /**
   * START ENGINE: starter crank, combustion catch, a short rev — once. The engine
   * fades out and stops as the star is revealed; then the score fades in.
   */
  ignition() {
    const ctx = this.ctx
    if (!ctx || !this.master || this.running) return
    this.running = true
    const t = ctx.currentTime + 0.02
    const stopAt = t + ENGINE_STOP
    this.startEngine(stopAt + 1.6)
    const eg = this.engineOut!.gain

    if (this.buffers.engineStart) {
      this.playBuffer(this.buffers.engineStart, 0.95, this.engineOut!)
      eg.setValueAtTime(1, t)
    } else {
      // 1 · starter motor: pulsed band-limited noise + whine
      const crank = this.noiseSource()
      const bp = this.filter('bandpass', 1050, 3)
      const cg = ctx.createGain()
      cg.gain.value = 0
      const pulse = ctx.createOscillator()
      pulse.type = 'square'
      pulse.frequency.setValueAtTime(11, t)
      pulse.frequency.linearRampToValueAtTime(17, t + 0.5)
      const pulseDepth = ctx.createGain()
      pulseDepth.gain.value = 0.12
      pulse.connect(pulseDepth).connect(cg.gain)
      const env = ctx.createGain()
      env.gain.setValueAtTime(0.0001, t)
      env.gain.exponentialRampToValueAtTime(1, t + 0.05)
      env.gain.setValueAtTime(1, t + 0.48)
      env.gain.exponentialRampToValueAtTime(0.0001, t + 0.7)
      crank.connect(bp).connect(cg).connect(env).connect(this.master)
      crank.start(t)
      crank.stop(t + 0.75)
      pulse.start(t)
      pulse.stop(t + 0.75)

      const whine = ctx.createOscillator()
      whine.type = 'triangle'
      whine.frequency.setValueAtTime(240, t)
      whine.frequency.linearRampToValueAtTime(330, t + 0.55)
      const wg = ctx.createGain()
      wg.gain.setValueAtTime(0.0001, t)
      wg.gain.exponentialRampToValueAtTime(0.035, t + 0.08)
      wg.gain.exponentialRampToValueAtTime(0.0001, t + 0.66)
      whine.connect(wg).connect(this.master)
      whine.start(t)
      whine.stop(t + 0.7)

      // 2 · combustion catch: low thump
      const catchT = t + 0.55
      const thump = ctx.createOscillator()
      thump.type = 'sine'
      thump.frequency.setValueAtTime(95, catchT)
      thump.frequency.exponentialRampToValueAtTime(38, catchT + 0.35)
      const tg = ctx.createGain()
      tg.gain.setValueAtTime(0.0001, catchT)
      tg.gain.exponentialRampToValueAtTime(0.7, catchT + 0.012)
      tg.gain.exponentialRampToValueAtTime(0.0001, catchT + 0.5)
      thump.connect(tg).connect(this.master)
      thump.start(catchT)
      thump.stop(catchT + 0.55)

      // 3 · rev flare, settling towards idle
      const f = this.rpmSource!.offset
      f.setValueAtTime(this.rpmToHz(0.04), t)
      f.setValueAtTime(this.rpmToHz(0.08), catchT)
      f.linearRampToValueAtTime(this.rpmToHz(0.62), catchT + 0.28)
      f.setTargetAtTime(this.rpmToHz(0.13), catchT + 0.4, 0.45)
      const tone = this.engineTone!.frequency
      tone.setValueAtTime(300, catchT)
      tone.linearRampToValueAtTime(1500, catchT + 0.28)
      tone.setTargetAtTime(this.rpmToCutoff(0.13), catchT + 0.4, 0.5)
      eg.setValueAtTime(0, t)
      eg.setValueAtTime(0, catchT - 0.02)
      eg.linearRampToValueAtTime(0.85, catchT + 0.1)
      eg.setTargetAtTime(0.5, catchT + 0.5, 0.6)
    }

    // 4 · the star appears: the engine falls away (and its nodes stop for good)
    eg.cancelScheduledValues(stopAt)
    eg.setTargetAtTime(0, stopAt, 0.35)

    // 5 · the engine has died away, the star is on screen: the music begins
    this.musicAt = t + MUSIC_START
    this.startMusic()
  }

  /** Soft air movement for scene cuts. */
  whoosh(strength = 1) {
    const ctx = this.ctx
    if (!ctx || !this.master || this.muted) return
    const t = ctx.currentTime
    const n = this.noiseSource()
    const bp = this.filter('bandpass', 280, 1.6)
    bp.frequency.setValueAtTime(260, t)
    bp.frequency.exponentialRampToValueAtTime(2200, t + 0.55)
    bp.frequency.exponentialRampToValueAtTime(380, t + 1.3)
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(0.09 * strength, t + 0.5)
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.4)
    n.connect(bp).connect(g).connect(this.master)
    n.start(t)
    n.stop(t + 1.5)
  }

  /** Called ~30×/s. Cheap: only schedules targets. */
  update(p: MixParams) {
    const ctx = this.ctx
    this.presence = Math.max(0, Math.min(1, p.presence))
    if (!ctx || !this.musicGain || this.muted || ctx.state !== 'running') return
    if (ctx.currentTime < this.musicFadeEnd) return // let the fade-in finish
    this.musicGain.gain.setTargetAtTime(MUSIC_LEVEL * this.presence, ctx.currentTime, 0.45)
  }

  dispose() {
    document.removeEventListener('visibilitychange', this.onVisibility)
    this.nodes.forEach((n) => {
      try {
        n.stop()
      } catch {
        /* already stopped */
      }
    })
    this.nodes = []
    void this.ctx?.close().catch(() => {})
    this.ctx = null
    this.master = null
    this.running = false
  }

  /* ───────────────────────── graph ───────────────────────── */

  private buildGraph() {
    const ctx = this.ctx!
    const limiter = ctx.createDynamicsCompressor()
    limiter.threshold.value = -12
    limiter.knee.value = 6
    limiter.ratio.value = 14
    limiter.attack.value = 0.003
    limiter.release.value = 0.2
    limiter.connect(ctx.destination)

    this.master = ctx.createGain()
    this.master.gain.value = this.outLevel()
    this.master.connect(limiter)


    // shared white-noise buffer (2 s)
    const len = ctx.sampleRate * 2
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate)
    const data = this.noise.getChannelData(0)
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1
  }

  /** The engine voice for the one-shot ignition; every node stops at `stopAt`. */
  private startEngine(stopAt: number) {
    const ctx = this.ctx!
    this.engineOut = ctx.createGain()
    this.engineOut.gain.value = 0
    this.engineOut.connect(this.master!)
    if (this.buffers.engineStart) return

    // one ConstantSource drives every harmonic, so pitch moves as one
    this.rpmSource = ctx.createConstantSource()
    this.rpmSource.offset.value = this.rpmToHz(0.04)
    const nodes: AudioScheduledSourceNode[] = [this.rpmSource]
    const sum = ctx.createGain()
    sum.gain.value = 0.32
    const harmonics: [OscillatorType, number, number, number][] = [
      ['sawtooth', 1, 0.7, 0],
      ['sawtooth', 2, 0.38, 6],
      ['square', 0.5, 0.42, 0],
      ['triangle', 3, 0.14, -4],
      ['sine', 0.25, 0.5, 0],
    ]
    for (const [type, mult, level, detune] of harmonics) {
      const o = ctx.createOscillator()
      o.type = type
      o.frequency.value = 0
      o.detune.value = detune
      const m = ctx.createGain()
      m.gain.value = mult
      this.rpmSource.connect(m).connect(o.frequency)
      const g = ctx.createGain()
      g.gain.value = level
      o.connect(g).connect(sum)
      nodes.push(o)
    }
    const shaper = ctx.createWaveShaper()
    shaper.curve = makeSaturation(2.2)
    shaper.oversample = '2x'
    this.engineTone = this.filter('lowpass', this.rpmToCutoff(0.12), 0.9)
    // firing-pulse amplitude modulation
    const am = ctx.createGain()
    am.gain.value = 0.72
    const lfo = ctx.createOscillator()
    lfo.type = 'sine'
    lfo.frequency.value = 0
    const lfoRate = ctx.createGain()
    lfoRate.gain.value = 0.5
    this.rpmSource.connect(lfoRate).connect(lfo.frequency)
    const lfoDepth = ctx.createGain()
    lfoDepth.gain.value = 0.28
    lfo.connect(lfoDepth).connect(am.gain)
    nodes.push(lfo)
    sum.connect(shaper).connect(this.engineTone).connect(am).connect(this.engineOut)
    // intake / exhaust air
    const intake = this.noiseSource(true)
    const intakeFilter = this.filter('bandpass', 900, 1.1)
    const intakeGain = ctx.createGain()
    intakeGain.gain.value = 0.03
    intake.connect(intakeFilter).connect(intakeGain).connect(this.engineOut)
    nodes.push(intake)
    for (const n of nodes) {
      n.start()
      n.stop(stopAt)
    }
  }

  /** Start the background track at `musicAt` — or as soon as it has decoded, if it arrives later. */
  private startMusic() {
    const ctx = this.ctx
    const buffer = this.buffers.music
    if (!ctx || !this.master || !buffer || this.musicLoop || this.musicAt === null) return
    const at = Math.max(this.musicAt, ctx.currentTime + 0.05)
    this.musicGain = ctx.createGain()
    this.musicGain.gain.setValueAtTime(0, at)
    this.musicGain.gain.linearRampToValueAtTime(MUSIC_LEVEL * this.presence, at + 1.6)
    this.musicFadeEnd = at + 1.6
    this.musicGain.connect(this.master)
    this.musicLoop = this.loopBuffer(buffer, this.musicGain)
    this.musicLoop.start(at)
  }

  /* ───────────────────────── helpers ───────────────────────── */

  private rpmToHz = (rpm: number) => 34 + rpm * 118
  private rpmToCutoff = (rpm: number) => 240 + rpm * rpm * 2600 + rpm * 400

  private filter(type: BiquadFilterType, freq: number, q: number) {
    const f = this.ctx!.createBiquadFilter()
    f.type = type
    f.frequency.value = freq
    f.Q.value = q
    return f
  }

  private noiseSource(loop = false) {
    const s = this.ctx!.createBufferSource()
    s.buffer = this.noise
    s.loop = loop
    if (loop) s.loopStart = Math.random()
    return s
  }

  private track(node: AudioScheduledSourceNode) {
    this.nodes.push(node)
  }

  private playBuffer(buffer: AudioBuffer, gain: number, dest: AudioNode = this.master!) {
    const ctx = this.ctx!
    const s = ctx.createBufferSource()
    s.buffer = buffer
    const g = ctx.createGain()
    g.gain.value = gain
    s.connect(g).connect(dest)
    s.start()
  }

  private loopBuffer(buffer: AudioBuffer, dest: AudioNode) {
    const s = this.ctx!.createBufferSource()
    s.buffer = buffer
    s.loop = true
    s.connect(dest)
    this.track(s)
    return s
  }

  private async loadFiles() {
    const ctx = this.ctx
    if (!ctx) return
    const entries = Object.entries(ASSETS.audio) as [keyof typeof ASSETS.audio, string | null][]
    await Promise.all(
      entries.map(async ([key, url]) => {
        if (!url) return
        try {
          const res = await fetch(url)
          if (!res.ok) throw new Error(`${res.status}`)
          this.buffers[key] = await ctx.decodeAudioData(await res.arrayBuffer())
          if (key === 'music') this.startMusic() // in case ignition already asked for it
        } catch (err) {
          console.warn(`[audio] "${key}" could not be loaded from ${url}; using synthesis instead.`, err)
        }
      }),
    )
  }

  private onVisibility = () => {
    if (!this.ctx) return
    if (document.hidden) void this.ctx.suspend().catch(() => {})
    else if (!this.muted) void this.ctx.resume().catch(() => {})
  }
}

function makeSaturation(k: number) {
  const n = 1024
  const curve = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1
    curve[i] = Math.tanh(k * x) / Math.tanh(k)
  }
  return curve
}

export const audio = new AudioEngine()
