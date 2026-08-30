import { PerspectiveCamera, Scene } from 'three';
import { vi } from 'vitest';
import type { UniverseRuntime } from '../scene/createUniverse';

export const fakeUniverse = (): UniverseRuntime => ({
  scene: new Scene(),
  camera: new PerspectiveCamera(),
  mount: vi.fn(),
  registerZone: vi.fn(),
  renderZone: vi.fn(),
  setTier: vi.fn(),
  pause: vi.fn(),
  resume: vi.fn(),
  rebuild: vi.fn(() => true),
  dispose: vi.fn(),
});
