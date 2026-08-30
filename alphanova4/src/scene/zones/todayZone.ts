import * as THREE from 'three';
import type { TodayViewModel } from '../../data/contracts';
import { createGlowRing, disposeObject3D } from '../procedural';
import type { QualityProfile, SpatialZone } from '../types';

const clear = (group: THREE.Group) => {
  [...group.children].forEach((child) => {
    group.remove(child);
    disposeObject3D(child);
  });
};

const hashAngle = (text: string, index: number) => {
  let hash = index + 17;
  for (const character of text) hash = ((hash << 5) - hash + character.charCodeAt(0)) | 0;
  return ((Math.abs(hash) % 360) / 180) * Math.PI;
};

const breadthArc = (advancing: number, declining: number) => {
  const total = Math.max(1, advancing + declining);
  const ratio = advancing / total;
  const points = Array.from({ length: 48 }, (_, index) => {
    const angle = -Math.PI * 0.75 + (index / 47) * Math.PI * 1.5 * ratio;
    return new THREE.Vector3(Math.cos(angle) * 5.6, Math.sin(angle) * 5.6, -0.4);
  });
  const line = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints(points),
    new THREE.LineBasicMaterial({ color: '#20c7ff', transparent: true, opacity: 0.9 }),
  );
  line.name = 'breadth-arc';
  return line;
};

export const createTodayZone = (): SpatialZone<TodayViewModel> => {
  const root = new THREE.Group();
  root.name = 'today-zone';
  const indexRings = new THREE.Group();
  indexRings.name = 'index-rings';
  const moverNodes = new THREE.Group();
  moverNodes.name = 'mover-nodes';
  root.add(indexRings, moverNodes);

  return {
    id: 'today',
    root,
    camera: { position: new THREE.Vector3(0, 1.2, 18), target: new THREE.Vector3(0, 0, 0) },
    update(model) {
      clear(indexRings);
      clear(moverNodes);
      const priorCore = root.getObjectByName('regime-core');
      const priorBreadth = root.getObjectByName('breadth-arc');
      if (priorCore) { root.remove(priorCore); disposeObject3D(priorCore); }
      if (priorBreadth) { root.remove(priorBreadth); disposeObject3D(priorBreadth); }
      if (model.status === 'unavailable') return;

      model.dashboard.indices.forEach((index, order) => {
        const ring = createGlowRing(2.7 + order * 0.72, order === 0 ? '#f8fbff' : '#20c7ff');
        ring.rotation.x = Math.PI * (0.38 + order * 0.035);
        ring.rotation.z = order * 0.44;
        ring.userData = { name: index.name, last: index.last, changePct: index.changePct };
        indexRings.add(ring);
      });

      model.dashboard.movers.slice(0, 12).forEach((mover, order) => {
        const angle = hashAngle(mover.symbol, order);
        const radius = 7.2 + (order % 3) * 1.25;
        const node = new THREE.Mesh(
          new THREE.IcosahedronGeometry(0.18 + Math.min(Math.abs(mover.changePct), 8) * 0.018, 1),
          new THREE.MeshBasicMaterial({ color: mover.changePct >= 0 ? '#42e89c' : '#ff667f' }),
        );
        node.position.set(Math.cos(angle) * radius, Math.sin(angle) * radius * 0.58, -1.5 - (order % 4));
        node.userData = { symbol: mover.symbol, last: mover.last, changePct: mover.changePct };
        moverNodes.add(node);
      });

      const core = new THREE.Mesh(
        new THREE.IcosahedronGeometry(1.25, 3),
        new THREE.MeshBasicMaterial({ color: '#20c7ff', wireframe: true, transparent: true, opacity: 0.7 }),
      );
      core.name = 'regime-core';
      core.userData = { regime: model.signalSummary.regime };
      root.add(core);
      if (model.signalSummary.breadth) {
        root.add(breadthArc(model.signalSummary.breadth.advancing, model.signalSummary.breadth.declining));
      }
    },
    setTier(profile: QualityProfile) {
      root.visible = true;
      moverNodes.visible = profile.particles > 0;
    },
    dispose() {
      disposeObject3D(root);
      root.clear();
    },
  };
};
