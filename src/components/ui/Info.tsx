import type { Content } from '../../config/event'

/**
 * Renders a piece of event content. Placeholders are visibly marked
 * (dotted underline + "TBA" badge) so they can never be mistaken for
 * confirmed information.
 */
export function Info({ c, as: Tag = 'span', className }: { c: Content; as?: 'span' | 'p' | 'h3' | 'strong'; className?: string }) {
  if (c.confirmed) return <Tag className={className}>{c.text}</Tag>
  return (
    <Tag className={`tba ${className ?? ''}`} title="Placeholder — to be confirmed. Edit src/config/event.ts">
      {c.text}
      <span className="tba-badge" aria-label="(to be announced)">
        TBA
      </span>
    </Tag>
  )
}

/** The official star mark (Mercedes-Benz Group artwork). Decorative next to a text label. */
export function StarMark({ size = 18, className }: { size?: number; className?: string }) {
  return <img className={className} src="/brand/mercedes-benz-star-2022.svg" width={size} height={size} alt="" aria-hidden draggable={false} />
}
