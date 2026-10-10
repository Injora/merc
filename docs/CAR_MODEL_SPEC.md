# Car model: what to request, and how to deliver it

The film shows a real Mercedes-Benz model. It currently uses a Mercedes-AMG C 63 Coupé GLB found in a public GitHub repository (`public/models/car/mercedes-amg-c63.glb`; see `public/ASSET_LICENSES.md`). **Its licence is unconfirmed.** Replace it with a sponsor-approved or properly licensed model before launch, using the specification below. There is no code change: set the URL, check the console report, then regenerate the image sequence (section 5).

If the model cannot be loaded, the film shows the car's turntable image sequence, then its light-drawn outline. Test this with `?nocar` and `?nocar&noseq` on any build.

## 1. What to ask for

Request this through the Mercedes-Benz sponsorship contact (brand or marketing communications). Alternatively, use a properly licensed commercial model whose licence explicitly allows **web/real-time use on a sponsored event site**. "Editorial use only" licences do not qualify.

| Item | Request |
|---|---|
| Vehicle | A current Mercedes-Benz saloon or coupé with strong proportions (e.g. S-Class, CLE, EQS, or the sponsor's choice) |
| Paint | Silver (e.g. *Alpine Grey*/*High-Tech Silver*) or graphite (e.g. *Graphite Grey*). Any colour works; `paintColour` in the config can override it |
| Format | glTF 2.0 binary (`.glb`). FBX/USD is fine as a source if someone can convert it |
| Approval | Written confirmation that the model and its likeness may be used on this site, plus any required credit line |

## 2. Technical specification

| | Target |
|---|---|
| Triangles | 150k–400k for desktop (LOD0). If possible, a LOD1 of about 60k for phones |
| Scale and orientation | Metres, +Y up, front toward −Z, wheels on Y = 0. The loader auto-corrects any sensible export, so this is a preference, not a requirement |
| Interior | Simplified is fine (seats, dash, wheel); visible through glass only |
| Textures | 2048 px maximum, power of two. Base colour, normal, ORM (occlusion/roughness/metalness). No baked lighting on the paint |
| Draw calls | Under about 150 materials × meshes after joining |

### Required separate nodes and materials (names matter)

The loader classifies meshes by **node or material name**, so please keep these separate and named:

| Part | Name should contain | Why |
|---|---|---|
| Body paint | `paint`, `body_colour` or `carpaint` | Clearcoat car-paint shader with metallic flakes |
| Glass (all windows) | `glass`, `window` or `windshield` | Physically based glass with transmission |
| Headlamps | `headlight`, `headlamp` or `DRL` | Lit by the timeline (headlight ignition, key-press flash). Also used to detect which end is the front |
| Tail lamps | `taillight`, `brakelight` or `rear_light` | Lit with the headlamps |
| Wheels | `wheel` or `rim` (plus `tyre`/`tire`, `disc`, `caliper`) | Each wheel is re-pivoted at its hub and spins with scroll speed |
| Chrome trim | `chrome` | Polished chrome shader |
| Interior | `interior`, `seat` or `dash` | Excluded from wheel/paint detection (so the steering wheel never spins) |

Everything else keeps its original material, with the reveal clipping and studio reflections applied.

## 3. Optimise (exact commands)

These were validated on a Khronos sample car: 11.8 MB → 2.8 MB, with identical paint reflections and classification.

```bash
# 1 — textures to WebP, prune; keep names and geometry exactly (no simplify / palette / joins)
npx @gltf-transform/cli@4 optimize car-source.glb car.tmp.glb \
  --compress false --simplify false --palette false --join-named false --flatten false \
  --texture-compress webp --texture-size 2048

# 2 — meshopt geometry compression with 12-bit normals (8-bit normals ripple on mirror paint)
npx @gltf-transform/cli@4 meshopt car.tmp.glb public/models/car.glb \
  --quantize-normal 12 --quantize-position 16
```

**KTX2 instead of WebP** (lower GPU memory; recommended if [KTX-Software 4.x](https://github.com/KhronosGroup/KTX-Software/releases) is installed so `toktx` is on PATH): in step 1, replace `--texture-compress webp` with `--texture-compress ktx2`. The site already ships the Basis transcoder (`public/basis/`), the Draco decoder (`public/draco/`) and the meshopt decoder, so Draco, meshopt and KTX2 files all load.

Avoid `--simplify`, `--palette` and joining named meshes. Simplification crumples mirror-like paint reflections, and the other two erase the names the loader relies on.

## 4. Install

In `src/config/assets.ts`:

```ts
car: {
  url: '/models/car/your-car.glb',
  targetLength: 4.75,         // the real length in metres of the delivered model
  materials: 'kit',           // 'original' keeps the model's own materials
  paintColour: null,          // e.g. '#b9bec4' to force silver
  transform: { scale: 1, rotationY: 0, offset: [0, 0, 0] }, // manual correction; rotationY is applied inside the normaliser
},
```

In development, `?car=/models/whatever.glb` overrides the URL so you can test a file without editing config. Check the browser console for the `[vehicle] prepared model` report, which counts the paint, glass, lamp and wheel meshes detected. If a count is 0, rename the nodes as described in section 2.

- **No lamp names?** The front can't be found automatically. If the car faces the camera in the finale (where the camera is behind it), set `transform.rotationY: Math.PI`. The current C 63 needs this.
- **Wheels merged across an axle?** Wheels only spin when each wheel/tyre mesh is one compact wheel. If an export merges a whole axle or all four wheels into one mesh, they stay still (`spinningWheels: false` in the report) rather than orbit the car.

Then add the model to `public/ASSET_LICENSES.md` with its source and licence or approval reference.

## 5. Re-bake the digital twin, the image sequence and the outline

The X-ray, data, core and network chapters are drawn from the car's **digital twin** (`ASSETS.models.car.tech`): feature edges, surface samples, structural nodes and links, baked from the model. Re-bake it whenever the model changes:

```bash
npm run dev -- --port 5199 --strictPort
node scripts/render-car.mjs --tech         # writes public/models/car/mercedes-amg-c63.tech.bin
```

The callout anchors (`ANCHOR_TARGETS` in `scene/tech/Twin.tsx`) are positions in car space, snapped to the nearest sampled point. Check them after a model swap.

### Image sequence and outline

`ASSETS.sequences.car` (60 turntable frames plus an SVG outline) is rendered from the model with the film's own normaliser and material kit:

```bash
npm run dev -- --port 5199 --strictPort   # the render page is a dev-only tool
node scripts/render-car.mjs               # writes public/sequences/car/f001…f060.webp + outline.svg
```

The tool loads `/models/car/mercedes-amg-c63.glb`. Change the path in `scripts/render-car/render.ts` when you replace the model.
