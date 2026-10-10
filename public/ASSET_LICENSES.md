# Asset manifest

Every file the site uses is self-hosted under `public/`. Nothing is hotlinked. The slots that use them are in `src/config/assets.ts`. The event page lists the credit lines under "Model and texture credits".

**Before a public launch,** clear every row whose licence is not CC0, public domain or Apache/OFL. This covers:

- the car model, whose licence is **unconfirmed**;
- use of the Mercedes-Benz marks (the star, and the car's own badges).

After the car reveal the film is rendered in real time from the car's own geometry; it uses no photographs or footage.

## The car

| Name | Local path | Source | Format | Use | Known licence |
|---|---|---|---|---|---|
| Mercedes-AMG C 63 Coupé (3D) | `models/car/mercedes-amg-c63.glb` | <https://github.com/AlexandrGroz/mercedes-configurator/blob/HEAD/src/entities/c63.glb> | GLB, meshopt geometry, WebP textures ≤1024 (2.3 MB; optimised from 8.7 MB with `@gltf-transform/cli`) | `ASSETS.models.car`: studio reveal, finale | Repository is MIT-licensed. The model's original author and licence are **not stated**; it looks like a converted third-party asset. **Unconfirmed.** |
| Car turntable, 60 frames | `sequences/car/f001–f060.webp` | Rendered from the model above by `scripts/render-car.mjs` (dev tool) | WebP 1600×900 | `ASSETS.sequences.car`: still (reduced-motion) film; fallback if the GLB fails | Derived from the model above |
| Car outline | `sequences/car/outline.svg` | Traced from side-view silhouettes of the same model by `scripts/render-car.mjs` | SVG | Light-drawn fallback; the airflow figure; the still film | Derived from the model above |
| Car digital twin | `models/car/mercedes-amg-c63.tech.bin` | Baked from the model above by `scripts/render-car.mjs --tech` (feature edges, surface samples, structural nodes, links; Int16) | Binary, 936 KB | The X-ray, data, core and network chapters | Derived from the model above |

## Studio, finale and UI

| Name | Local path | Source | Format | Use | Known licence |
|---|---|---|---|---|---|
| Mercedes-Benz star (2022 artwork) | `brand/mercedes-benz-star-2022.svg` | <https://commons.wikimedia.org/wiki/File:Mercedes-Benz_Star_2022.svg> | SVG | Star mark (nav, footer); proportions of the 3D emblem | Public domain (copyright). Trademark of Mercedes-Benz Group AG; used under the event sponsorship. |
| Studio Small 09 | `hdri/studio_small_09_1k.hdr` | <https://polyhaven.com/a/studio_small_09> | HDR 1k | Studio reflections (button, emblem, car) | CC0 1.0 |
| Concrete Floor Worn 001 | `textures/concrete_floor_worn_001_{rough,nor_gl}_1k.jpg` | <https://polyhaven.com/a/concrete_floor_worn_001> | JPEG 1k | Studio floor | CC0 1.0 |
| Draco decoder | `draco/*` | three.js `examples/jsm/libs/draco` | WASM/JS | GLB geometry | Apache-2.0 |
| Basis transcoder | `basis/*` | three.js `examples/jsm/libs/basis` | WASM/JS | KTX2 textures | Apache-2.0 |
| Inter Tight, JetBrains Mono, Cormorant Garamond | bundled via `@fontsource/*` | Google Fonts / Fontsource | WOFF2 | Typography | SIL OFL 1.1 |
| Background music | `audio/bgm.mp3` | Supplied by the project owner | MP3, 53.5 s, 192 kbps, looped | Music under the film (`ASSETS.audio.music`) | **Unknown — confirm the source and licence before launch** |
| Click, engine, whoosh | none | Synthesised in real time (Web Audio) | none | START ENGINE, scene cuts | Original |

## Fallbacks

| Slot | If missing or failing |
|---|---|
| `models.car` | `sequences.car` turntable, then the light-drawn outline; the X-ray onwards still runs from the baked twin. QA: `?nocar`, `?nocar&noseq`. |
| A turntable frame | The nearest decoded frame |
| Car digital twin | The chapters after the X-ray need it; it ships with the build (no external dependency) |
