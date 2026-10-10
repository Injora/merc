/** Editorial section heading: index, label, title. */
export function SectionHeader({ index, label, title, id }: { index: string; label: string; title: string; id: string }) {
  return (
    <header className="section-header">
      <p className="section-label">
        <span className="section-index">{index}</span>
        <span>{label}</span>
      </p>
      <h2 id={id} className="section-title">
        {title}
      </h2>
    </header>
  )
}
