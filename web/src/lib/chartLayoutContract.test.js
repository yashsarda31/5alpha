import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('../pages/Chart.jsx', import.meta.url), 'utf8');

test('Chart Analyser renders chart and dash before summary data and AI', () => {
  const chart = source.indexOf('className="chart-plot-pane"');
  const dash = source.indexOf('className="chart-stock-pro"');
  const summary = source.indexOf('className="stats-grid chart-summary-grid"');
  const ai = source.indexOf('className="chart-ai-section"');
  assert.ok(chart >= 0 && dash > chart && summary > dash && ai > summary);
});

test('VCP Rating and Alpha Score live inside Stock Pro Dash', () => {
  const dash = source.indexOf('className="chart-stock-pro"');
  const summary = source.indexOf('className="stats-grid chart-summary-grid"');
  const vcp = source.indexOf('VCP RATING', dash);
  const alpha = source.indexOf('ALPHA SCORE', dash);
  assert.ok(vcp > dash && vcp < summary);
  assert.ok(alpha > dash && alpha < summary);
});

test('Chart uses the mobile-height branch', () => {
  assert.match(source, /height:\s*isNarrow\s*\?\s*430\s*:\s*650/);
});
