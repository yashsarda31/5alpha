import * as THREE from 'three';
import type { SignalsViewModel } from '../../data/contracts';
import { disposeObject3D } from '../procedural';
import type { QualityProfile, SpatialZone } from '../types';

export const scoreToScale = (score: number) => THREE.MathUtils.mapLinear(THREE.MathUtils.clamp(score, 0, 100), 0, 100, 0.72, 1.35);
export const freshnessToPulse = (observedAt: string | null) => observedAt && Date.now() - Date.parse(observedAt) <= 15 * 60_000 ? 1 : 0;
const clear = (group: THREE.Group) => [...group.children].forEach((child) => { group.remove(child); disposeObject3D(child); });
const hash = (value: string) => [...value].reduce((total, char) => ((total * 31) + char.charCodeAt(0)) >>> 0, 17);

export const createSignalsZone = (): SpatialZone<SignalsViewModel> => {
  const root = new THREE.Group(); root.name = 'signals-zone';
  const nodes = new THREE.Group(); nodes.name = 'signal-nodes'; root.add(nodes);
  return {
    id: 'signals', root,
    camera: { position: new THREE.Vector3(0, 0.8, 20), target: new THREE.Vector3(0, 0, 0) },
    update(model) {
      clear(nodes);
      model.setups.forEach((setup, index) => {
        const relevance = Math.min(index, 10);
        const radius = 4.8 + relevance * 0.72;
        const angle = ((hash(setup.symbol) % 360) / 180) * Math.PI;
        const node = new THREE.Mesh(new THREE.IcosahedronGeometry(0.48, 2), new THREE.MeshBasicMaterial({ color: setup.side === 'LONG' ? '#76e4ff' : '#f8fbff', wireframe: true, transparent: true, opacity: 0.9 }));
        node.name = `signal-${setup.symbol}`;
        node.position.set(Math.cos(angle) * radius, Math.sin(angle) * radius * 0.62, -(index % 4));
        node.scale.setScalar(scoreToScale(setup.score));
        node.userData = { symbol: setup.symbol, pulseRate: freshnessToPulse(setup.observedAt), distanceSource: 'relevance', relevance };
        nodes.add(node);
      });
    },
    setTier(profile: QualityProfile) { nodes.visible = profile.particles > 0; },
    dispose() { disposeObject3D(root); root.clear(); },
  };
};
