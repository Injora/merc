/**
 * Shared, mutable story state.
 *
 * The scroll timeline (GSAP) writes into `S`, the 3D scene and the audio
 * engine read from it every frame. Nothing here is React state, so scrolling
 * never triggers a re-render.
 */

export const S = {
  /* ── ignition (time-driven) ── */
  intro: 0, // 0 → 1 the button emerging from darkness on load
  revealed: 0, // 0 until START ENGINE fires; the emblem is not rendered at all before this
  ign: 0, // 0 → 1 lights coming up after START ENGINE
  gauge: 0, // instrument sweep around the button
  morph: 0, // button disc → star
  ignCamZ: 0.9, // additional dolly distance before ignition
  pressed: 0, // button travel
  hover: 0, // pointer / focus over the button
  ignSweep: 0, // reflection sweep during ignition
  horizon: 0, // dashboard-like light line across the dark
  ignPulse: 0, // the ignition pulse: one hairline ring travelling outward

  /* ── scroll-driven ── */
  progress: 0, // 0 → 1 across the story section
  cam: { px: 0, py: 1.15, pz: 3.6, tx: 0, ty: 1.15, tz: 0, fov: 35, roll: 0 },

  starTurn: 0, // emblem rotation (radians), scrubbed → inertia via scrub smoothing
  starSplit: 0,
  shards: 0,
  headlights: 0,
  sweep: 0, // highlight sweep across the bodywork
  keyLight: 0.35, // studio key-light level

  studio: 1, // studio set visibility
  road: 0, // finale (the light grid) visibility

  sky: 0, // palette index (fractional): 0 studio · 1 night road · 2 the future
  speed: 0, // world speed in m/s
  digital: 0, // finale: the grid's depth (sparse → dense)
  dim: 0, // final dim under the hero frame
  dip: 0, // dip-to-black between shots (drives the DOM overlay and the audio whoosh)

  /* ── the technology film (all scrubbed by the timeline; see scene/tech/) ── */
  tech: {
    grid: 0, // studio floor grid
    labels: 0, // the machine's callouts (each is revealed as the scan passes it)
    scan: -1.3, // scan gate along the car: −1 nose … 1 tail (beyond ±1.2: off the car)
    scanOn: 0, // scan gate visibility
    xray: 0, // paint dissolves behind the scan gate (0 → 1); < 1 leaves a ghost of the paint
    ghost: 0, // the paint is gone everywhere
    edges: 0, // GEOMETRY: the car's feature edges
    points: 0, // its surface samples
    nodes: 0, // structural nodes
    stream: 0, // DATA: directed streams along the structural graph
    voxel: 0, // DATA STRUCTURES: samples snap into an ordered spatial map
    search: 0, // ALGORITHMS: the search frontier crosses the graph (0 → 1)
    solve: 0, // … and the shortest path lights
    raw: 0, // ML 1: raw, noisy signals
    cluster: 0, // ML 2: features (k-means clusters)
    model: 0, // ML 3: the network activates layer by layer
    prune: 0, // … and resolves (weak connections fall away)
    predict: 0, // ML 4: the predicted trajectory is drawn
    fan: 0, // … with its uncertainty
    env: 0, // CV: the scene around the car
    sweep: 0, // … revealed by the sensor sweep (0 → 1 turn)
    resolve: 0, // … points resolve into objects
    occ: 0, // … an occupancy map
    cands: 0, // OPTIMISATION: candidate trajectories
    evaluate: 0, // … scored and discarded, worst first
    opt: 0, // … the chosen one smooths; a marker travels it
    costField: 0, // … contours of the cost field
    path: 0, // the chosen trajectory, lit
    pipe: 0, // AI SYSTEMS: the pipeline's stages
    signal: 0, // … a signal travels sensors → control (0 → 1)
    net: 0, // TENFOLD: new connections branch from the car
    netPulse: 0, // … one pulse through the whole
    gridNet: 0, // finale: nodes in the grid light and connect
    gridPulse: 0, // finale: the pulse that travels to the viewer
  },


  /* derived at runtime */
  frame: 0, // rendered WebGL frames (used by the screenshot tooling to wait for fresh frames)
  scrollVelocity: 0, // smoothed, 0 → ~1
  distance: 0, // metres travelled by the car
}

export type StoryState = typeof S

/** Normalised pointer position (−1 → 1), shared by DOM and WebGL layers. */
export const pointer = { x: 0, y: 0, sx: 0, sy: 0 }

if (typeof window !== 'undefined') {
  window.addEventListener(
    'pointermove',
    (e) => {
      pointer.x = (e.clientX / window.innerWidth) * 2 - 1
      pointer.y = -((e.clientY / window.innerHeight) * 2 - 1)
    },
    { passive: true },
  )
}

/** Tiny external store so a handful of UI flags can be read with hooks. */
type Flags = {
  ignited: boolean // START ENGINE pressed
  unlocked: boolean // ignition sequence finished, scrolling allowed
  stageReady: boolean // 3D stage has rendered its first frame
  carFailed: boolean // the car model could not be loaded: the 2D fallback takes the shot
}

let flags: Flags = { ignited: false, unlocked: false, stageReady: false, carFailed: false }
const subs = new Set<() => void>()

export const flagStore = {
  get: () => flags,
  set(patch: Partial<Flags>) {
    flags = { ...flags, ...patch }
    subs.forEach((fn) => fn())
  },
  subscribe(fn: () => void) {
    subs.add(fn)
    return () => {
      subs.delete(fn)
    }
  },
}
