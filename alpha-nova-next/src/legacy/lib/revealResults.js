// On phones the analysis form fills the first screen, so freshly fetched
// results render below the fold and a successful "Run" looks like a no-op.
// Scroll the result panel into view — narrow viewports only, desktop keeps
// its scroll position. Deferred a tick so React has committed the panel.
export default function revealResults(id) {
  if (window.innerWidth > 850) return;
  setTimeout(() => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, 80);
}
