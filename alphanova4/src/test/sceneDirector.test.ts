import { PerspectiveCamera, Vector3 } from 'three';
import { describe, expect, it, vi } from 'vitest';
import { SceneDirector, type TimelineLike } from '../scene/SceneDirector';

const fakeTimeline = (): TimelineLike & { finish: () => void; interrupt: () => void } => {
  let complete = () => {};
  let interrupt = () => {};
  const timeline = {
    to: vi.fn().mockReturnThis(),
    kill: vi.fn(() => interrupt()),
    finish: () => complete(),
    interrupt: () => interrupt(),
    configure: (onComplete: () => void, onInterrupt: () => void) => {
      complete = onComplete;
      interrupt = onInterrupt;
    },
  };
  return timeline;
};

describe('SceneDirector', () => {
  it('kills the active timeline and settles only the newest route', () => {
    const first = fakeTimeline();
    const second = fakeTimeline();
    const timelines = [first, second];
    const settled = vi.fn();
    const director = new SceneDirector(
      new PerspectiveCamera(),
      new Vector3(),
      {
        '/dashboard': { position: new Vector3(0, 0, 10), target: new Vector3() },
        '/signals': { position: new Vector3(10, 0, 0), target: new Vector3() },
        '/chart': { position: new Vector3(0, 10, 0), target: new Vector3() },
        '/watchlist': { position: new Vector3(-10, 0, 0), target: new Vector3() },
      },
      ({ onComplete, onInterrupt }) => {
        const timeline = timelines.shift()!;
        timeline.configure?.(onComplete, onInterrupt);
        return timeline;
      },
      settled,
    );

    director.go('/signals', 1);
    director.go('/chart', 1);
    second.finish();

    expect(first.kill).toHaveBeenCalledOnce();
    expect(director.route).toBe('/chart');
    expect(settled).toHaveBeenLastCalledWith('/chart');
  });

  it('applies the pose immediately when motion is disabled', () => {
    const camera = new PerspectiveCamera();
    const target = new Vector3();
    const director = new SceneDirector(camera, target, {
      '/dashboard': { position: new Vector3(1, 2, 3), target: new Vector3(0, 1, 0) },
      '/signals': { position: new Vector3(), target: new Vector3() },
      '/chart': { position: new Vector3(), target: new Vector3() },
      '/watchlist': { position: new Vector3(), target: new Vector3() },
    }, vi.fn(), vi.fn());
    director.go('/dashboard', 0);
    expect(camera.position.toArray()).toEqual([1, 2, 3]);
    expect(target.toArray()).toEqual([0, 1, 0]);
  });
});
