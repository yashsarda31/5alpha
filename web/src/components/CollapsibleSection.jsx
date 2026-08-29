export default function CollapsibleSection({ id, title, defaultOpen = false, children, className = '' }) {
  return (
    <details id={id} className={`collapsible-section ${className}`.trim()} open={defaultOpen || undefined}>
      <summary>{title}</summary>
      <div className="collapsible-section__content">{children}</div>
    </details>
  );
}
