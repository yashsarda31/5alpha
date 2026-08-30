import { expect, it } from 'vitest';
import type * as THREE from 'three';
import type { ChartViewModel } from '../data/contracts';
import { createAnalyseZone } from '../scene/zones/analyseZone';

const chart: ChartViewModel = { ticker: 'NVDA', dates: ['a','b','c'], open: [10,11,12], high: [11,12,13], low: [9,10,11], close: [10,12,11], volume: [1,2,3], sma20: [9,10,11], sma50: [8,9,10], rsi: [40,60,50] };

it('projects finite ordered close geometry', () => {
  const zone = createAnalyseZone(); zone.update(chart);
  const line = zone.root.getObjectByName('close-line')!;
  const points = Array.from((line as THREE.Line).geometry.getAttribute('position').array as ArrayLike<number>);
  const xs = points.filter((_, index) => index % 3 === 0);
  expect(points.every(Number.isFinite)).toBe(true);
  expect(xs).toEqual([...xs].sort((a,b) => a-b));
});
