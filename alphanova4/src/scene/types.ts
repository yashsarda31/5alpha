import type * as THREE from 'three';

export type RenderTier = 'full' | 'balanced' | 'essential';
export type ZoneId = 'today' | 'signals' | 'analyse' | 'watchlist';

export interface QualityProfile {
  maxPixelRatio: number;
  particles: number;
  bloom: boolean;
  shadows: boolean;
  transitionScale: number;
}

export interface Capabilities {
  reducedMotion: boolean;
  webgl: boolean;
  cores: number;
  memoryGb: number | null;
}

export interface CameraPose {
  position: THREE.Vector3;
  target: THREE.Vector3;
}

export interface SpatialZone<T = unknown> {
  id: ZoneId;
  root: THREE.Group;
  camera: CameraPose;
  update(model: T): void;
  setTier(profile: QualityProfile): void;
  dispose(): void;
}
