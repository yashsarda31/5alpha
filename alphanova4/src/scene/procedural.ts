import * as THREE from 'three';

const seededRandom = (seed: number) => {
  let value = seed >>> 0;
  return () => {
    value = (value * 1664525 + 1013904223) >>> 0;
    return value / 4294967296;
  };
};

export const createGlowRing = (radius: number, color: THREE.ColorRepresentation): THREE.LineLoop => {
  const points = Array.from({ length: 96 }, (_, index) => {
    const angle = (index / 96) * Math.PI * 2;
    return new THREE.Vector3(Math.cos(angle) * radius, Math.sin(angle) * radius, 0);
  });
  return new THREE.LineLoop(
    new THREE.BufferGeometry().setFromPoints(points),
    new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.72 }),
  );
};

export const createParticleField = (count: number, seed = 4): THREE.Points => {
  const random = seededRandom(seed);
  const positions = new Float32Array(Math.max(0, count) * 3);
  for (let index = 0; index < positions.length; index += 3) {
    positions[index] = (random() - 0.5) * 70;
    positions[index + 1] = (random() - 0.5) * 42;
    positions[index + 2] = (random() - 0.5) * 70;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  return new THREE.Points(geometry, new THREE.PointsMaterial({ color: '#20c7ff', size: 0.035, transparent: true, opacity: 0.58 }));
};

export const createPolyline = (points: THREE.Vector3[], color: THREE.ColorRepresentation): THREE.Line => (
  new THREE.Line(
    new THREE.BufferGeometry().setFromPoints(points),
    new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.92 }),
  )
);

export const disposeObject3D = (root: THREE.Object3D): void => {
  root.traverse((node) => {
    const renderable = node as THREE.Mesh;
    renderable.geometry?.dispose();
    const materials = Array.isArray(renderable.material) ? renderable.material : [renderable.material];
    materials.filter((material): material is THREE.Material => Boolean(material)).forEach((material) => material.dispose());
  });
};
