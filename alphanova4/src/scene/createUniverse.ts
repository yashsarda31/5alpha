import * as THREE from 'three';
import { QUALITY } from './quality';
import type { RenderTier, SpatialZone, ZoneId } from './types';

export interface RendererPort {
  domElement: HTMLCanvasElement;
  setPixelRatio(value: number): void;
  setSize(width: number, height: number, updateStyle?: boolean): void;
  render(scene: THREE.Scene, camera: THREE.Camera): void;
  dispose(): void;
}

interface UniverseDependencies {
  rendererFactory?: () => RendererPort;
  requestFrame?: (callback: FrameRequestCallback) => number;
  cancelFrame?: (handle: number) => void;
}

export interface UniverseRuntime {
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;
  mount(host: HTMLElement): void;
  registerZone<T>(zone: SpatialZone<T>): void;
  renderZone<T>(id: ZoneId, model: T): void;
  setTier(tier: RenderTier): void;
  pause(): void;
  resume(): void;
  rebuild(): boolean;
  dispose(): void;
}

const defaultRenderer = (): RendererPort => new THREE.WebGLRenderer({
  antialias: true,
  alpha: true,
  powerPreference: 'high-performance',
});

export const createUniverse = (dependencies: UniverseDependencies = {}): UniverseRuntime => {
  const renderer = (dependencies.rendererFactory ?? defaultRenderer)();
  const requestFrame = dependencies.requestFrame ?? window.requestAnimationFrame.bind(window);
  const cancelFrame = dependencies.cancelFrame ?? window.cancelAnimationFrame.bind(window);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#02050c');
  scene.fog = new THREE.FogExp2('#02050c', 0.018);
  const camera = new THREE.PerspectiveCamera(48, 1, 0.1, 250);
  camera.position.set(0, 0, 18);
  const zones = new Map<ZoneId, SpatialZone<unknown>>();
  let host: HTMLElement | null = null;
  let frame: number | null = null;
  let disposed = false;

  const resize = () => {
    if (!host) return;
    const width = Math.max(1, host.clientWidth);
    const height = Math.max(1, host.clientHeight);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height, false);
  };
  const loop: FrameRequestCallback = () => {
    frame = requestFrame(loop);
    renderer.render(scene, camera);
  };
  const pause = () => {
    if (frame !== null) cancelFrame(frame);
    frame = null;
  };
  const resume = () => {
    if (!disposed && frame === null) frame = requestFrame(loop);
  };

  return {
    scene,
    camera,
    mount(nextHost) {
      if (disposed) throw new Error('Universe runtime is disposed');
      if (host && renderer.domElement.parentElement === host) host.removeChild(renderer.domElement);
      host = nextHost;
      host.appendChild(renderer.domElement);
      resize();
      window.addEventListener('resize', resize);
      resume();
    },
    registerZone(zone) {
      const previous = zones.get(zone.id);
      if (previous) {
        scene.remove(previous.root);
        previous.dispose();
      }
      zones.set(zone.id, zone as SpatialZone<unknown>);
      scene.add(zone.root);
    },
    renderZone(id, model) {
      zones.get(id)?.update(model);
    },
    setTier(tier) {
      const profile = QUALITY[tier];
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, profile.maxPixelRatio));
      zones.forEach((zone) => zone.setTier(profile));
    },
    pause,
    resume,
    rebuild: () => !disposed,
    dispose() {
      if (disposed) return;
      disposed = true;
      pause();
      window.removeEventListener('resize', resize);
      zones.forEach((zone) => {
        scene.remove(zone.root);
        zone.dispose();
      });
      zones.clear();
      renderer.dispose();
      renderer.domElement.remove();
      host = null;
    },
  };
};
