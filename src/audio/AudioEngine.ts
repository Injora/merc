import { ASSETS } from '../config/assets'

/**
 * Automotive sound design on the Web Audio API.
 *
 * Every layer is synthesised in real time, so the experience sounds right with
 * zero audio files. If a licensed file is configured in `ASSETS.audio`, it is
 * decoded on ignition and replaces the matching synth layer; a failed or
 * missing file silently falls back to synthesis.
 *
 * Nothing is created before an explicit user gesture (autoplay policy).
 * Continuous layers are modulated, never retriggered: scroll velocity moves
 * smoothed parameters with setTargetAtTime, it never fires new sounds.
 */

export type MixParams = {
  rpm: number // 0 → 1
  engine: number // engine presence 0 → 1
  muffle: number // 0 = exterior, 1 = inside the cabin
  road: number // road / wind ambience 0 → 1
  future: number // electronic score 0 → 1
  velocity: number // smoothed scroll velocity 0 → ~1
}

const STORAGE_KEY = 'nst-sdc:sound'
const MASTER_LEVEL = 0.72

type Buffers = Partial<Record<keyof typeof ASSETS.audio, AudioBuffer>>

class AudioEngine {
  private ctx: AudioContext | null = null
  private master: GainNode | null = null
  private muffleFilter: BiquadFilterNode | null = null
  private noise: AudioBuffer | null = null
  private buffers: Buffers = {}

  // engine
  private rpmSource: ConstantSourceNode | null = null
  private engineOut: GainNode | null = null
  private engineTone: BiquadFilterNode | null = null
  private intakeFilter: BiquadFilterNode | null = null
  private intakeGain: GainNode | null = null
  private engineLoop: AudioBufferSourceNode | null = null
  // road
  private roadGain: GainNode | null = null
  private roadFilter: BiquadFilterNode | null = null
  // future score
  private futureGain: GainNode | null = null
  private futureFilter: BiquadFilterNode | null = null
  private arpTimer: number | null = null
  private arpStep = 0
  private arpNext = 0
  private delayIn: GainNode | null = null

  private nodes: AudioScheduledSourceNode[] = []
  private running = false
  private holdUntil = 0
  private lastFuture = 0
  private muted: boolean
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
  }

  /* ───────────────────────── public API ───────────────────────── */

  get available() {
    return typeof window !== 'undefined' && ('AudioContext' in window || 'webkitAudioContext' in window)
  }

  isMuted = () => this.muted

  subscribe = (fn: () => void) => {
    this.listeners.add(fn)
    return () => {
      this.listeners.delete(fn)
    }
  }

  setMuted(muted: boolean) {
    this.muted = muted
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
      this.master.gain.setTargetAtTime(MASTER_LEVEL, ctx.currentTime, 0.12)
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

  /** Starter crank, engine catch, settle to idle. Starts all continuous layers. */
  ignition() {
    const ctx = this.ctx
    if (!ctx || !this.master || this.running) return
    this.startContinuous()
    const t = ctx.currentTime + 0.02
    this.holdUntil = t + 2.6

    if (this.buffers.engineStart) {
      this.playBuffer(this.buffers.engineStart, 0.95)
      this.engineOut!.gain.setValueAtTime(0, t)
      this.engineOut!.gain.setTargetAtTime(0.5, t + 1.6, 0.5)
      return
    }

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

    // 3 · rev flare, then settle to idle
    const f = this.rpmSource!.offset
    f.cancelScheduledValues(t)
    f.setValueAtTime(this.rpmToHz(0.04), t)
    f.setValueAtTime(this.rpmToHz(0.08), catchT)
    f.linearRampToValueAtTime(this.rpmToHz(0.62), catchT + 0.28)
    f.setTargetAtTime(this.rpmToHz(0.13), catchT + 0.4, 0.45)
    const tone = this.engineTone!.frequency
    tone.cancelScheduledValues(t)
    tone.setValueAtTime(300, catchT)
    tone.linearRampToValueAtTime(1500, catchT + 0.28)
    tone.setTargetAtTime(this.rpmToCutoff(0.13), catchT + 0.4, 0.5)
    const eg = this.engineOut!.gain
    eg.cancelScheduledValues(t)
    eg.setValueAtTime(0, t)
    eg.setValueAtTime(0, catchT - 0.02)
    eg.linearRampToValueAtTime(0.85, catchT + 0.1)
    eg.setTargetAtTime(0.5, catchT + 0.5, 0.6)
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

  /** Called ~30×/s with smoothed parameters. Cheap: only schedules targets. */
  update(p: MixParams) {
    const ctx = this.ctx
    if (!ctx || !this.running || this.muted || ctx.state !== 'running') return
    const t = ctx.currentTime
    const rpm = Math.min(1, p.rpm + p.velocity * 0.55)
    const presence = p.engine * (0.42 + p.velocity * 0.45)

    if (t > this.holdUntil) {
      if (this.engineLoop) {
        this.engineLoop.playbackRate.setTargetAtTime(0.75 + rpm * 0.95, t, 0.18)
      } else {
        this.rpmSource!.offset.setTargetAtTime(this.rpmToHz(rpm), t, 0.16)
        this.engineTone!.frequency.setTargetAtTime(this.rpmToCutoff(rpm), t, 0.16)
        this.intakeFilter!.frequency.setTargetAtTime(420 + rpm * 1700, t, 0.2)
        this.intakeGain!.gain.setTargetAtTime(0.012 + rpm * rpm * 0.09, t, 0.2)
      }
      this.engineOut!.gain.setTargetAtTime(presence, t, 0.25)
    }

    this.muffleFilter!.frequency.setTargetAtTime(16000 - p.muffle * 15200, t, 0.3)
    this.roadGain!.gain.setTargetAtTime(p.road * (0.035 + p.velocity * 0.22), t, 0.25)
    this.roadFilter!.frequency.setTargetAtTime(500 + p.velocity * 1400, t, 0.3)

    const future = Math.max(0, Math.min(1, p.future))
    this.futureGain!.gain.setTargetAtTime(future * 0.16, t, 0.4)
    this.futureFilter!.frequency.setTargetAtTime(380 + future * 1600 + p.velocity * 900, t, 0.4)
    if (future > 0.04 && this.lastFuture <= 0.04) this.startArp()
    if (future <= 0.04 && this.lastFuture > 0.04) this.stopArp()
    this.lastFuture = future
  }

  dispose() {
    this.stopArp()
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
    this.master.gain.value = this.muted ? 0 : MASTER_LEVEL
    this.master.connect(limiter)

    this.muffleFilter = this.filter('lowpass', 16000, 0.5)
    this.muffleFilter.connect(this.master)

    // shared white-noise buffer (2 s)
    const len = ctx.sampleRate * 2
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate)
    const data = this.noise.getChannelData(0)
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1
  }

  private startContinuous() {
    const ctx = this.ctx!
    this.running = true

    /* ENGINE — one ConstantSource drives every harmonic, so pitch moves as one. */
    this.engineOut = ctx.createGain()
    this.engineOut.gain.value = 0
    this.engineOut.connect(this.muffleFilter!)

    this.rpmSource = ctx.createConstantSource()
    this.rpmSource.offset.value = this.rpmToHz(0.12)

    if (this.buffers.engineLoop) {
      this.engineLoop = this.loopBuffer(this.buffers.engineLoop, this.engineOut)
    } else {
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
        this.track(o)
      }
      // soft saturation for body
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
      this.track(lfo)
      sum.connect(shaper).connect(this.engineTone).connect(am).connect(this.engineOut)

      // intake / exhaust air
      const intake = this.noiseSource(true)
      this.intakeFilter = this.filter('bandpass', 600, 1.1)
      this.intakeGain = ctx.createGain()
      this.intakeGain.gain.value = 0.015
      intake.connect(this.intakeFilter).connect(this.intakeGain).connect(this.engineOut)
      this.track(intake)
    }
    this.track(this.rpmSource)

    /* ROAD — tyre roar + wind, a low band of noise */
    this.roadGain = ctx.createGain()
    this.roadGain.gain.value = 0
    this.roadGain.connect(this.muffleFilter!)
    if (this.buffers.roadLoop) {
      this.loopBuffer(this.buffers.roadLoop, this.roadGain)
      this.roadFilter = this.filter('lowpass', 18000, 0.5) // unused placeholder for automation
    } else {
      const road = this.noiseSource(true)
      this.roadFilter = this.filter('lowpass', 700, 0.6)
      const hp = this.filter('highpass', 70, 0.7)
      road.connect(hp).connect(this.roadFilter).connect(this.roadGain)
      this.track(road)
    }

    /* FUTURE — a slow, wide pad + pluck arpeggio, enters in the final act */
    this.futureGain = ctx.createGain()
    this.futureGain.gain.value = 0
    this.futureGain.connect(this.master!)
    this.futureFilter = this.filter('lowpass', 400, 0.9)
    this.futureFilter.connect(this.futureGain)

    // tempo-synced echo for plucks
    const delay = ctx.createDelay(1)
    delay.delayTime.value = 0.375
    const fb = ctx.createGain()
    fb.gain.value = 0.38
    const wet = ctx.createGain()
    wet.gain.value = 0.45
    this.delayIn = ctx.createGain()
    this.delayIn.connect(delay)
    delay.connect(fb).connect(delay)
    delay.connect(wet).connect(this.futureGain)
    this.delayIn.connect(this.futureGain)

    if (this.buffers.futureLoop) {
      this.loopBuffer(this.buffers.futureLoop, this.futureFilter)
    } else {
      // D minor 9 voicing, detuned pairs
      const chord = [73.42, 110, 130.81, 164.81, 174.61, 220]
      chord.forEach((hz, i) => {
        for (const det of [-7, 7]) {
          const o = ctx.createOscillator()
          o.type = i === 0 ? 'triangle' : 'sawtooth'
          o.frequency.value = hz
          o.detune.value = det
          const g = ctx.createGain()
          g.gain.value = i === 0 ? 0.22 : 0.07
          o.connect(g).connect(this.futureFilter!)
          this.track(o)
        }
      })
      // slow breathing on the pad filter
      const lfo = ctx.createOscillator()
      lfo.frequency.value = 0.07
      const depth = ctx.createGain()
      depth.gain.value = 260
      lfo.connect(depth).connect(this.futureFilter.frequency)
      this.track(lfo)
    }

    this.nodes.forEach((n) => n.start())
  }

  private startArp() {
    if (this.arpTimer || !this.ctx) return
    this.arpNext = this.ctx.currentTime + 0.05
    const notes = [587.33, 440, 523.25, 659.25, 587.33, 880, 698.46, 523.25] // D5 A4 C5 E5 D5 A5 F5 C5
    const step = 0.1875 // 16ths at 80 bpm
    const schedule = () => {
      const ctx = this.ctx
      if (!ctx || !this.delayIn) return
      while (this.arpNext < ctx.currentTime + 0.25) {
        const t = this.arpNext
        const hz = notes[this.arpStep % notes.length]
        const accent = this.arpStep % 4 === 0 ? 1 : 0.55
        const o = ctx.createOscillator()
        o.type = 'triangle'
        o.frequency.value = hz
        const g = ctx.createGain()
        const peak = 0.11 * accent * Math.min(1, this.lastFuture * 1.4)
        g.gain.setValueAtTime(0.0001, t)
        g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + 0.008)
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.32)
        o.connect(g).connect(this.delayIn)
        o.start(t)
        o.stop(t + 0.36)
        this.arpStep++
        this.arpNext += step
      }
    }
    schedule()
    this.arpTimer = window.setInterval(schedule, 90)
  }

  private stopArp() {
    if (this.arpTimer) window.clearInterval(this.arpTimer)
    this.arpTimer = null
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

  private playBuffer(buffer: AudioBuffer, gain: number) {
    const ctx = this.ctx!
    const s = ctx.createBufferSource()
    s.buffer = buffer
    const g = ctx.createGain()
    g.gain.value = gain
    s.connect(g).connect(this.master!)
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
