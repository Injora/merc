import { CALLOUTS, hud, type CalloutGroup } from '../scene/tech/hud'

/**
 * Callouts pinned to points in the scene (positioned by the scene every frame —
 * see scene/tech/hud.ts): the opening's five, revealed by the scan, and the AI
 * pipeline's five stages, named when the signal reaches them.
 */
export function Callouts() {
  return (
    <div className="machine-labels" aria-hidden>
      {(Object.keys(CALLOUTS) as CalloutGroup[]).map((group) =>
        CALLOUTS[group].map((l, i) => (
          <div key={`${group}-${i}`} ref={(el) => void (hud.els[group][i] = el)} className="machine-label" data-group={group} style={{ visibility: 'hidden' }}>
            <i className="machine-label-dot" />
            <i className="machine-label-lead" />
            <span className="machine-label-text">
              <b>{String(i + 1).padStart(2, '0')}</b>
              {l.title}
              <em>{l.note}</em>
            </span>
          </div>
        )),
      )}
    </div>
  )
}
