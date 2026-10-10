# NST-SDC × Mercedes-Benz — Hackathon Experience

A scroll-directed, real-time film that ends on the hackathon's event page.

**The car is already an engineering achievement. Code is how the next generation makes it radically more capable.**

**START ENGINE → a Mercedes-AMG in the studio → its digital twin → computer science → machine learning → computer vision → optimization → an AI pipeline → "What if your code made it 10× better?" → the hackathon.**

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # type-check + production build → dist/
npm run preview    # serve the production build (the benchmark for every visual and performance check)
npm run lint
```

URL flags (any build):

- `?static` forces the still (reduced-motion) film.
- `?probe` records per-frame emblem, camera and highlight data.
- `?nocar` makes the car model fail to load; add `&noseq` to fail its turntable frames too.

Dev only:

- `?nosmooth` gives an instant scrub (used by `scripts/shots.mjs`).
- `?car=/path.glb` tests another car model.

---

## Direction

> Computer science is not separate from engineering. It is the layer that lets us reimagine what engineering can achieve.

The car's transformation itself demonstrates the idea: **geometry becomes data → data becomes structure → structure becomes a model → the model predicts → perception grounds the prediction → optimisation improves the system → a pipeline turns it into decisions.** Then the question: *what if your code made it 10× better?* ("10×" is an ambition, not a measured claim.)

After the car reveal, everything on screen is real-time graphics computed from **the car's own geometry** and a procedural scene: no photographs, no footage.

**These are real computations, run once at load (`scene/tech/compute.ts`), and the film draws their results:**

- a Dijkstra search over a graph built on the car's structural nodes (the frontier advances in the order the search settled each edge, then the shortest path lights up);
- k-means clustering of 14,000 surface samples (the features);
- a cost field over the procedural road scene, which scores eight candidate trajectories (the best one is *computed* from proximity plus a comfort term, not picked by hand);
- the occupancy grid derived from the same scene.

They are a **conceptual visualisation**. Nothing is trained, nothing drives a car, and no vehicle performance is claimed. The pipeline's sensor placements are illustrative.

Palette: black, charcoal, silver, white, and one cool blue for events (a scan, a frontier, a pulse, the chosen path). All motion is scrubbed by the scroll: there are no clocks, idle spins or random jitter, and scrolling back reverses everything exactly.

## The film (story units, 0–100 across the pinned scroll)

| Units | Chapter | On screen |
|---|---|---|
| 0–16 | Ignition / The Star | START ENGINE, a hairline ignition pulse, the chrome star, one light sweep; fragments land on the car's surface |
| 16–27 | The Machine | **"Engineered to move. Ready to think."** One scan crosses the bodywork, and as it passes each point a callout names what lies beneath (SENSING · PERCEPTION · PREDICTION · OPTIMIZATION · DECISION SYSTEMS), then fades. |
| 27–40 | Digital Twin | **Geometry:** the paint dissolves behind the scan into the model's own feature edges (`GEOMETRY → COMPUTABLE SPACE`). **Data:** structural nodes and directed streams flowing between them (`SENSORS → SIGNALS → FEATURES`). **The twin:** the paint returns as a ghost, so the physical car, its representation and its data coexist. |
| 40–50 | Computer Science | **Data structures:** the samples snap into an ordered voxel map of the car. **Algorithms:** the search frontier crosses the graph, explored edges dim, and the shortest path lights nose to tail. |
| 50–61 | Machine Learning | Raw, noisy signals → features (k-means clusters) → a layered model that activates stage by stage and drops its weak connections → a prediction on the road ahead, with its uncertainty (`RAW DATA → FEATURES → MODEL → PREDICTION`) |
| 61–69 | Computer Vision | A sensor sweep turns once; road edges, lanes, vehicles, debris and landmarks appear as points, resolve into boxes and lines, then an occupancy map, then a path through the free space |
| 69–76 | Optimization | Cost contours on the floor; eight candidate trajectories, discarded worst-first; the chosen one loses its wobble while a marker travels it. **"Don't just build the machine. Improve the system."** |
| 76–82 | AI Systems | Sensors → SENSING → PERCEPTION → PREDICTION → PLANNING → CONTROL → the chosen trajectory; each stage lights (and is named) only when the signal reaches it |
| 82–91 | 10× | A reverse scan returns the car to its physical form with its traces left visible; new connections branch out of it. **"What if your code made it 10× better?" · "The next breakthrough won't build itself."** |
| 91–100 | The Hackathon | A vast light grid; selected nodes light and connect near to far; one pulse comes towards you. **"Bridge engineering and intelligence. Build what's next."** Then the title and registration. |

Captions and chapter names live in `src/config/story.ts`. Event details live in `src/config/event.ts`: each is `tba()` or `confirmed()`, and placeholders show a **TBA** badge. Set `EVENT.registration.url` to the real form.

## Rendering

```
src/components/cinematic/
  timeline.ts            the master timeline: one GSAP timeline scrubbed by one ScrollTrigger; S.tech holds every layer's value
  Stage.tsx              the WebGL chunk: warm-up (every shader compiled behind the loader) and the single render loop
  scene/
    Ignition · Emblem · Shards · StudioSet · StudioEnvironment · Director · Effects · SpeedBlur
    Vehicle.tsx          the GLB car, with the scan / X-ray / ghost injected into its materials (tech/carFx.ts)
    vehicle/             GLB loader, normaliser + classifier, automotive material kit
    tech/
      compute.ts         the computations: structural graph + Dijkstra, k-means, model layout, road scene, cost, candidates
      twinData.ts        decodes the baked twin; runs compute once (shared cache); builds every geometry
      Twin.tsx           feature edges · samples (voxel map, raw signals, clusters) · nodes · graph (streams, search, path) · scan gate · floor grid · the opening's callouts
      Mind.tsx           features · the layered model · prediction + uncertainty · candidates + optimisation · the AI pipeline (+ its callouts)
      World.tsx          the procedural road scene: lidar-style points, resolved boxes, occupancy + cost contours (one floor shader)
      Branches.tsx       the 10× network that grows out of the car
      carFx.ts · hud.ts  car material injection · callout placement (positioned by the scene in the same frame)
    Finale.tsx           the light grid (constant-width hairlines) and its connecting nodes
  hud/Callouts.tsx       the DOM callouts
  carseq/                CarSequence (turntable frames / light-drawn outline) · CarFallback · media.ts
  StaticStory.tsx        the still film
```

- **The digital twin** (`public/models/car/mercedes-amg-c63.tech.bin`, 936 KB) is baked offline from the real model by `node scripts/render-car.mjs --tech`. It holds 61,149 feature-edge segments, 14,002 surface samples with normals and class, and 72 structural nodes. The car is never duplicated.
- **Static buffers, scrubbed uniforms:** every animated layer is computed on the GPU from static buffers and a few uniforms written once per frame from `S.tech`. Growth clocks, search order, pulses, morphs and the optimiser's wobble removal are all deterministic and reversible. There are no per-particle CPU updates and no per-frame allocations; the callout placement is allocation-free.
- **Low overdraw:** additive hairlines and small points keep overdraw low. The car's dissolve is opaque discard with a stable dither, and the car meshes are skipped once the X-ray has passed.
- **One loop:** Lenis (lerp 0.08), ScrollTrigger (scrub 1), the timeline and the R3F render all run on GSAP's ticker; R3F uses `frameloop="never"`.
- **Shader rule:** never use `pow(x, 2.0)`. GLSL `pow` is undefined for a negative base; ANGLE/Metal returns NaN, and a single NaN blacked out the whole frame through bloom. Shaders square with the `sq()` macro.

## Assets

Everything is self-hosted; **`public/ASSET_LICENSES.md`** is the manifest. Slots live in `src/config/assets.ts`.

| Slot | What |
|---|---|
| `models.car` | The car GLB (now a Mercedes-AMG C 63 Coupé; **licence unconfirmed**, see the manifest) and `tech`, its baked digital twin |
| `models.emblem` | An optional sponsor emblem GLB |
| `sequences.car` | A 60-frame turntable plus an SVG outline, rendered from the car: the fallback and the still film |
| `audio.*` | Optional recorded layers; otherwise the audio is synthesised live |

**Replacing the car:**

1. Optimise it as in `docs/CAR_MODEL_SPEC.md` and set `ASSETS.models.car.url`.
2. Check the `[vehicle] prepared model` console report.
3. Re-bake the twin and the sequence. With `npm run dev -- --port 5199` running:
   - `node scripts/render-car.mjs --tech`
   - `node scripts/render-car.mjs`

**Fallbacks:**

| Missing or failing | Shown instead |
|---|---|
| Car model | The turntable sequence, then the light-drawn outline. The X-ray and everything after still run from the baked twin. |
| Reduced motion, no WebGL, or a lost GPU | The still film: the car turns only with the reader's scroll, and each chapter is a composition of fine lines (the traced outline, a network, orbits, the horizon) with its line of text |

## Checks (production: `npm run build && npx vite preview --port 5299 --strictPort &`)

| Command | What it checks |
|---|---|
| `node scripts/capture.mjs --phase x --units 32,49.5,72,98.5 [--vp mobile] [--button] [--cta] [--video]` | Real ignition and real scrolling. Saves screenshots, logs console errors and failed requests. `--video` records a 60 s journey. |
| `node scripts/trace60.mjs --label run [--vp mobile] [--bands 0-8,…]` | A 60 s continuous scroll. Reports fps, frame intervals, dropped frames and main-thread work per chapter, plus a Chrome trace. |
| `node scripts/verify-emblem.mjs --out shots/emblem` | 30 consecutive frames of the star (sweep and rest) |
| `node scripts/verify-jitter.mjs` | 60 frames at rest per chapter: camera, emblem, caption and rail stability |
| `node scripts/test-ignition-keyboard.mjs` | Keyboard ignition, and that it cannot fire twice |

### Results (Apple M4, Chrome, 60 Hz, `trace60.mjs`, 60 s scroll through the whole film)

| | Desktop 1440×900 @2× | Mobile 390×844 @3× |
|---|---|---|
| Units 40–100 (all the CS / ML / CV / AI chapters) | 60 fps, 0 dropped, in all three runs | 60 fps, 0 dropped |
| Units 8–33 (shards → car → twin) | **varies run to run:** 239, 35, then 0 dropped frames in three identical runs | 0 dropped |
| Whole film | 56.1 → 59.4 → 60.0 fps across the three runs | 60 fps; 3 single missed frames in the finale |

Main-thread work stays at p95 ≤ 5 ms per chapter in every run, so when frames drop in the studio stretch, the limit is the GPU (or system load), not JavaScript. That stretch has the thinnest headroom: a transmission-glass car, 1,800 chrome shards and a re-rendering reflection cube. A 120 Hz display is untested.

Emblem: 30 frames during the sweep and 30 at rest, with position and rotation range 0. At rest in ten chapters, the camera, captions and rail move by exactly 0 between frames.

## Accessibility

- `prefers-reduced-motion`, no WebGL, or a lost GPU context → the still film, then the event page.
- A skip link and "Skip to event details" are available throughout. The chapter rail jumps within the film.
- START ENGINE is a real button. It cannot fire twice, and the navigation is inert until the film starts.
- Callouts and instruments are decorative (`aria-hidden`); every caption is repeated as plain text for screen readers.

`.oxlintrc.json` turns off `react/immutability` for `src/components/cinematic/scene/**`: R3F scene code mutates three.js objects inside `useFrame` by design.
