import * as THREE from 'three';
import type { ChartViewModel } from '../../data/contracts';
import { createPolyline, disposeObject3D } from '../procedural';
import type { QualityProfile, SpatialZone } from '../types';

const line = (values: number[], name: string, color: string) => {
  const minimum = Math.min(...values); const range = Math.max(1, Math.max(...values) - minimum); const count = Math.max(1, values.length - 1);
  const result = createPolyline(values.map((value, index) => new THREE.Vector3(-8 + (index / count) * 16, ((value - minimum) / range) * 7 - 3.5, 0)), color);
  result.name = name; return result;
};

export const createAnalyseZone = (): SpatialZone<ChartViewModel> => {
  const root = new THREE.Group(); root.name = 'analyse-zone';
  return { id: 'analyse', root, camera: { position: new THREE.Vector3(0, 0, 20), target: new THREE.Vector3(0,0,0) },
    update(model) { [...root.children].forEach((child) => { root.remove(child); disposeObject3D(child); }); if (!model.close.length) return; root.add(line(model.close, 'close-line', '#f8fbff')); if(model.sma20.length)root.add(line(model.sma20, 'sma20-line', '#20c7ff'));if(model.sma50.length)root.add(line(model.sma50, 'sma50-line', '#76e4ff')); },
    setTier(profile: QualityProfile) { root.visible = profile.particles > 0; }, dispose() { disposeObject3D(root); root.clear(); } };
};
