/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  ASSET MANIFEST — every external file the film uses.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *  Everything is self-hosted under /public; sources and licences are in
 *  public/ASSET_LICENSES.md. After the car, the film is real-time graphics
 *  computed from the car itself and a procedural scene (scene/tech/): no
 *  photographs or footage. Clear the car model — and the
 *  use of the Mercedes-Benz marks — before a public launch.
 *
 *  Each slot has a working fallback, so the film runs even if a file is
 *  missing or fails to load.
 */

export const ASSETS = {
  models: {
    /**
     * The car (GLB; Draco, meshopt and KTX2 supported). The loader normalises
     * any sensible export (up axis, front to −Z, length = `targetLength`,
     * wheels on the floor) and classifies meshes by name for the material kit.
     * See docs/CAR_MODEL_SPEC.md. If it fails to load, `sequences.car` is
     * shown, and failing that, a light-drawn outline of the car.
     */
    car: {
      url: '/models/car/mercedes-amg-c63.glb' as string | null,
      targetLength: 4.75,
      materials: 'kit' as 'kit' | 'original',
      /** override the paint colour, e.g. '#b9bec4' (silver); null keeps the model's */
      paintColour: null as string | null,
      /** rotationY: π — this export names no lamps, so its front cannot be found automatically */
      transform: { scale: 1, rotationY: Math.PI, offset: [0, 0, 0] as [number, number, number] },
      credit: '3D model: Mercedes-AMG C 63 Coupé, from github.com/AlexandrGroz/mercedes-configurator (repository licence MIT; original author unconfirmed)',
      /**
       * The car's digital twin, baked from this model by `node scripts/render-car.mjs --tech`
       * (feature edges, surface samples, structural nodes and links, in the film's car space).
       * Drives every chapter after the reveal: the twin, the search graph, k-means features, the
       * model's inputs (scene/tech/compute.ts runs on it once at load). Re-bake when the model changes.
       */
      tech: '/models/car/mercedes-amg-c63.tech.bin',
    },

    /**
     * Sponsor-approved emblem as GLB (centered at origin, facing +Z,
     * ≈ 1.6 units across). Until supplied, the star is built from the
     * official 2022 artwork's proportions.
     */
    emblem: {
      url: null as string | null,
      scale: 1,
    },
  },

  /**
   * Image sequences. `car`: a 360° turntable of the car on black, used by the
   * still (reduced-motion) film, scrubbed by scroll, and by the film itself if
   * the GLB fails to load. Frames are decoded with createImageBitmap into a
   * bounded window around the playhead and drawn to one persistent canvas.
   */
  sequences: {
    car: { frames: '/sequences/car/f{n}.webp', count: 60, pad: 3, outline: '/sequences/car/outline.svg' } as {
      frames: string
      count: number
      pad: number
      /** SVG outline of the same car (side view), drawn in light when neither the model nor the frames load */
      outline: string
    } | null,
  },

  /**
   * Audio. Everything is synthesised in real time with the Web Audio API when a
   * file is not supplied (see src/audio/). Supplied files should be loudness
   * normalised (≈ −16 LUFS), and loop-clean where marked `loop`.
   */
  audio: {
    click: null as string | null, // one-shot: the START ENGINE button
    engineStart: null as string | null, // one-shot, ~2 s: plays once on ignition, faded out as the star appears
    music: '/audio/bgm.mp3' as string | null, // loop: the background track — starts after the engine, fades out at the hackathon title
  },

}

/** Show discreet production notes over scenes whose real asset is missing. */
export const SHOW_ASSET_NOTES = false
