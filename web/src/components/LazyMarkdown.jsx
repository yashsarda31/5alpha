import React, { lazy, Suspense } from 'react';

const MarkdownRenderer = lazy(() => import('./MarkdownRenderer'));

const LazyMarkdown = ({ children }) => (
  <Suspense fallback={null}>
    <MarkdownRenderer>{children}</MarkdownRenderer>
  </Suspense>
);

export default LazyMarkdown;
