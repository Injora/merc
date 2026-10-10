/**
 * STORY SCRIPT — the words and chapters of the film.
 *
 * Computer science is the layer that lets engineering be reimagined. The car is
 * revealed and scanned; geometry becomes data, data becomes structure,
 * structure becomes a model, the model predicts, perception grounds it,
 * optimisation improves it, and a pipeline turns it into decisions. Then the
 * question: what if your code made it 10× better? — and the invitation.
 *
 * All timings are in "story units": 0 → 100 across the pinned scroll
 * section. The master timeline (src/components/cinematic/timeline.ts)
 * choreographs camera, light and every scene around these same marks.
 */

export type Chapter = {
  id: string
  index: string
  label: string
  /** story unit the rail jumps to */
  at: number
}

export type Caption = {
  id: string
  kicker?: string
  line: string
  /** fade-in start / fade-out end, in story units */
  from: number
  to: number
  align?: 'left' | 'center' | 'right'
  /** note: a small monospaced annotation, bottom-centre (the pipelines under each scene) */
  size?: 'title' | 'line' | 'note'
  pos?: 'top' | 'bottom'
}

/** Scroll length of the cinematic section, in viewport heights. */
export const STORY_LENGTH_VH = { desktop: 1500, mobile: 1300 }

export const CHAPTERS: Chapter[] = [
  { id: 'ignition', index: '01', label: 'Ignition', at: 0 },
  { id: 'star', index: '02', label: 'The Star', at: 4 },
  { id: 'machine', index: '03', label: 'The Machine', at: 17 },
  { id: 'twin', index: '04', label: 'Digital Twin', at: 29.5 },
  { id: 'cs', index: '05', label: 'Computer Science', at: 41 },
  { id: 'ml', index: '06', label: 'Machine Learning', at: 50.5 },
  { id: 'cv', index: '07', label: 'Computer Vision', at: 61.5 },
  { id: 'opt', index: '08', label: 'Optimization', at: 69.5 },
  { id: 'ai', index: '09', label: 'AI Systems', at: 76.5 },
  { id: 'tenfold', index: '10', label: '10×', at: 83 },
  { id: 'hackathon', index: '11', label: 'The Hackathon', at: 91.5 },
]

/**
 * The words. Lines carry the argument (geometry becomes data … the system
 * becomes more capable); `note` captions are the small monospaced pipelines
 * under each scene. Everything shown is a conceptual visualisation.
 */
export const CAPTIONS: Caption[] = [
  { id: 'title', kicker: 'NST-SDC  ·  With Mercedes-Benz', line: 'Engineered to move. Ready to think.', from: 21.4, to: 27.2, align: 'left', size: 'title', pos: 'bottom' },
  { id: 'twin', kicker: 'I — The digital twin', line: 'Geometry becomes data.', from: 30.2, to: 37, align: 'left', pos: 'top' },
  { id: 'twin-note', line: 'Geometry → computable space', from: 30.8, to: 34.6, size: 'note' },
  { id: 'data-note', line: 'Sensors → signals → features', from: 35, to: 39.6, size: 'note' },
  { id: 'cs', kicker: 'II — Computer science', line: 'Data becomes structure.', from: 41, to: 49.6, align: 'left', pos: 'top' },
  { id: 'ds-note', line: 'Data structures · samples become an ordered spatial map', from: 41.6, to: 45.2, size: 'note' },
  { id: 'algo-note', line: 'Algorithms · search the graph, keep the shortest path', from: 45.6, to: 49.8, size: 'note' },
  { id: 'ml', kicker: 'III — Machine learning', line: 'Structure becomes a model.', from: 50.8, to: 56.6, align: 'left', pos: 'top' },
  { id: 'ml-2', line: 'The model makes predictions.', from: 57, to: 61, align: 'left', pos: 'top' },
  { id: 'ml-note', line: 'Raw data → features → model → prediction', from: 51.2, to: 60.8, size: 'note' },
  { id: 'cv', kicker: 'IV — Computer vision', line: 'To predict, first perceive.', from: 62, to: 68.6, align: 'left', pos: 'top' },
  { id: 'cv-note', line: 'Perception → spatial model → prediction', from: 62.4, to: 68.8, size: 'note' },
  { id: 'opt-note', line: 'Search → evaluate → optimize', from: 70, to: 75.4, size: 'note' },
  { id: 'opt', kicker: 'V — Optimization', line: 'Don’t just build the machine. Improve the system.', from: 73, to: 76.6, align: 'center', size: 'title', pos: 'top' },
  { id: 'ai', kicker: 'VI — AI systems', line: 'Predictions inform decisions.', from: 77, to: 81.6, align: 'left', pos: 'bottom' },
  { id: 'platform', line: 'The machine is the platform. Builders expand what it can do.', from: 83.2, to: 85.8, align: 'center', pos: 'top' },
  { id: 'tenfold', line: 'What if your code made it 10× better?', from: 86, to: 88.4, align: 'center', size: 'title', pos: 'top' },
  { id: 'breakthrough', line: 'The next breakthrough won’t build itself.', from: 88.5, to: 90.6, align: 'center', size: 'title', pos: 'top' },
  { id: 'bridge', line: 'Bridge engineering and intelligence. Build what’s next.', from: 92.2, to: 95.4, align: 'center', pos: 'top' },
]
