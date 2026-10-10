# NST-SDC × Mercedes-Benz — Hackathon Experience

A scroll-directed, real-time 3D film that ends on the hackathon's event page.

**START ENGINE → the star → the car → one life in five chapters → the road becomes light → the hackathon.**

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # type-check + production build → dist/
npm run preview    # serve the production build
npm run lint
```

URL flags: `?static` forces the still (reduced-motion) version. Dev only: `?nosmooth` (instant scrub, used by the screenshot tool), `?car=/path.glb` (test a car model without editing config), `?windowVideo=/path.mp4` (test window footage in every chapter).

---

## Updating event details (no animation code involved)

Everything visitors read about the event lives in **`src/config/event.ts`**.

- Each value is wrapped in `tba('…')` (placeholder) or `confirmed('…')` (approved). Placeholders render with a dotted underline and a **TBA** badge.
- **Registration:** set `EVENT.registration.url` to the real form and `confirmed: true`.
- Sponsor wording is in `EVENT.sponsor.acknowledgement`. Use the exact wording the sponsor approves.

Story lines, chapter names, caption timings and the shot list are in **`src/config/story.ts`**.

---

## The film

| Units | Chapter | What's on screen |
|---|---|---|
| 0–8 | The Star | START ENGINE becomes the chrome three-pointed star; it turns and separates |
| 8–16 | (assembly) | the star's fragments stream into the shape of the car |
| 16–30 | The Reveal | lit studio sequence with the licensed car; low-key silhouette drawn by one light line with the placeholder |
| 30–40 | I — First Light | Camera A: infant in a rear-facing seat, a parent's hand reaching back; morning |
| 40–51 | II — Growing Up | same frame, light-leak match cuts: child in a booster → teenager; day → dusk city |
| 51–62 | III — The Keys | macro on the key in golden light (shallow focus), then his first time at the wheel |
| 62–72 | IV — Together | Camera C: him driving, his wife beside him; golden road → night city on a wet road |
| 72–80 | V — Full Circle | the first frame again: his own baby, and him turning round to look |
| 80–94 | The Future | the car accelerates away; the road becomes light, then circuitry |
| 94–100 | The Hackathon | the event page resolves |

---

## Assets: real vs. placeholder

Every self-hosted file and its licence is in **`public/ASSET_LICENSES.md`**. Nothing is hotlinked.

| Asset | Status |
|---|---|
| Mercedes-Benz star (2D) | **Genuine** 2022 star artwork (Mercedes-Benz Group, via Wikimedia Commons; public domain copyright, trademark used under the sponsorship) |
| Mercedes-Benz star (3D) | **Real geometry** built from the official artwork's proportions; an approved emblem GLB can replace it (`ASSETS.models.emblem`) |
| Vehicle | **Placeholder**, shown only as a low-key silhouette and labelled on screen. Full pipeline ready for the licensed model — see `docs/CAR_MODEL_SPEC.md` |
| People (all five chapters) | **Placeholders**: rim-lit silhouettes plus a production note, until the plates are shot — see `docs/PLATES_SPEC.md` |
| Interior | Procedural, with CC0 leather, wood and suede (Poly Haven). A licensed interior GLB can replace it (`ASSETS.models.interior`) |
| Skies & studio light | **Real** CC0 HDRIs (Poly Haven): one studio, one location at four times of day |
| Roadside | **Real** CC0 assets: impostor cards baked from scanned trees, lamp posts, shrubs, asphalt, concrete facades |
| Sound | Synthesised in real time; licensed recordings can replace any layer (`ASSETS.audio`) |
| Fonts | Inter Tight, Cormorant Garamond, JetBrains Mono (SIL OFL), self-hosted |

---

## How it works

```
src/
  config/        event.ts · assets.ts (every asset slot) · story.ts (chapters, captions, shot list)
  lib/           state.ts (shared mutable story state) · scroll.ts (Lenis) · device.ts
  audio/         AudioEngine.ts (Web Audio) · AudioController.tsx · SoundToggle.tsx
  components/cinematic/
    timeline.ts       THE master timeline (one GSAP timeline, scrubbed by one ScrollTrigger)
    Stage.tsx         lazy WebGL chunk: warm-up, single render loop
    StoryLayers.tsx   captions, plates, production notes, chapter rail
    scene/            Director (damped camera, atmosphere) · StudioEnvironment (reflections) · StudioSet
                      Ignition · Emblem · Shards · Vehicle · Cabin · Figures · KeyFob · World · Effects
      vehicle/        GLB loader (Draco / meshopt / KTX2), auto-normalise + classify, automotive materials
      cabin/          interior set, camera rigs, silhouette figures, interior materials
      world/          chapter skies, roadside materials, speed blur, window video, caption mask
  components/landing · components/ui
scripts/   shots.mjs · perf.mjs · check-compiles.mjs · bake-impostors.mjs
docs/      CAR_MODEL_SPEC.md · PLATES_SPEC.md
```

- **One timeline, one loop.** Camera, light, sets, speed, audio mix and captions are tweens on a single 100-unit timeline, so scrolling up reverses everything. Lenis, ScrollTrigger and the WebGL render share one requestAnimationFrame (GSAP's ticker; R3F runs with `frameloop="never"`).
- **No React renders while scrolling.** The timeline writes into a plain object (`S`); the scene reads it each frame.
- **Camera** position, target and FOV are damped (frame-rate independent); dips and match cuts snap.
- **Nothing compiles or uploads mid-scroll.** Every set, beat and effect is shown once behind the loader, then every texture is uploaded. All lights stay in the scene (unused ones at zero), because three.js compiles a shader per visible-light count. Post-processing is decided once per device tier and never toggled at runtime (that would recompile every material); the adaptive quality only lowers the pixel ratio.
- **Reflections** re-render only when their inputs change. The contact shadow is baked once per reveal.

### Performance (production build, Apple M4, wheel-driven, `node scripts/perf.mjs`)

| Chapter | Desktop 1440×900 @2× | Mobile 390×844 @3× |
|---|---|---|
| All nine chapters | 60 fps locked, p95 16.7–16.8 ms, **0 dropped frames**; main-thread work p95 1.9–3.5 ms | 60 fps, p95 16.7–16.8 ms, 1 dropped frame in total; work p95 1.5–3.6 ms |

The main-thread work stays well inside the 8.3 ms needed for 120 Hz; GPU headroom at 120 Hz has not been measured on a ProMotion display. Before this work there were 875 ms and 619 ms stalls (reveal, First Light) from mid-scroll shader compiles.

### Checks

- `node scripts/shots.mjs --phase x --units idle,ign,36,64 [--vp desktop,tablet,mobile]` — screenshots at story units (dev server, port 5199 by default).
- `node scripts/perf.mjs --label run [--vp mobile]` — frame-time profile against `vite preview --port 5299`.
- `node scripts/check-compiles.mjs 0 95` — must print `[]`: no shader compiles or slow frames across the film.

### Fallbacks and accessibility

- `prefers-reduced-motion`, no WebGL, or a lost GPU context → the still version of the film, then the full event page.
- "Skip to event details" on the ignition screen, the loader, and as a keyboard skip link. The chapter rail jumps within the film (labels on hover/focus; dots below 1100 px).
- START ENGINE is a real focusable button. Sound starts only after a gesture, can be muted at any time, and suspends in hidden tabs.

### Lint note

`.oxlintrc.json` turns off `react/immutability` for `src/components/cinematic/scene/**`: R3F scene code mutates three.js objects inside `useFrame` by design. Vendored decoders in `public/draco` and `public/basis` are excluded.
