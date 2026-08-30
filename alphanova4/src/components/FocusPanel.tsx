import type { ReactNode } from 'react';

export const FocusPanel = ({ title, eyebrow, children }: { title: string; eyebrow?: string; children: ReactNode }) => (
  <section className="focus-panel">
    {eyebrow && <div className="focus-eyebrow">{eyebrow}</div>}
    <h1>{title}</h1>
    {children}
  </section>
);
