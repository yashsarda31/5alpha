import { Group, Vector3 } from 'three';
import { describe, expect, it, vi } from 'vitest';
import { createUniverse, type RendererPort } from '../scene/createUniverse';
import type { SpatialZone } from '../scene/types';

const createRenderer = (): RendererPort => ({
  domElement: document.createElement('canvas'),
  setPixelRatio: vi.fn(),
  setSize: vi.fn(),
  render: vi.fn(),
  dispose: vi.fn(),
});

describe('UniverseRuntime lifecycle', () => {
  it('mounts one canvas and disposes renderer, zone, and animation once', () => {
    const renderer = createRenderer();
    const cancelFrame = vi.fn();
    const requestFrame = vi.fn(() => 71);
    const zone: SpatialZone<{ value: number }> = {
      id: 'today',
      root: new Group(),
      camera: { position: new Vector3(0, 0, 10), target: new Vector3() },
      update: vi.fn(),
      setTier: vi.fn(),
      dispose: vi.fn(),
    };
    const host = document.createElement('div');
    Object.defineProperty(host, 'clientWidth', { value: 390 });
    Object.defineProperty(host, 'clientHeight', { value: 844 });
    const universe = createUniverse({ rendererFactory: () => renderer, requestFrame, cancelFrame });

    universe.registerZone(zone);
    universe.mount(host);
    universe.renderZone('today', { value: 42 });
    universe.dispose();
    universe.dispose();

    expect(host.querySelectorAll('canvas')).toHaveLength(0);
    expect(renderer.setSize).toHaveBeenCalledWith(390, 844, false);
    expect(zone.update).toHaveBeenCalledWith({ value: 42 });
    expect(zone.dispose).toHaveBeenCalledOnce();
    expect(renderer.dispose).toHaveBeenCalledOnce();
    expect(cancelFrame).toHaveBeenCalledOnce();
  });
});
