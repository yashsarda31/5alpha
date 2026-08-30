import gsap from 'gsap';
import type { PerspectiveCamera, Vector3 } from 'three';
import type { CoreRoutePath } from '../coreRoutes';
import type { CameraPose } from './types';

export interface TimelineLike {
  to(target: object, vars: Record<string, unknown>, position?: number): TimelineLike;
  kill(): void;
  configure?(onComplete: () => void, onInterrupt: () => void): void;
}

export type TimelineFactory = (options: { onComplete: () => void; onInterrupt: () => void }) => TimelineLike;
export type RoutePoses = Record<CoreRoutePath, CameraPose>;

const gsapTimeline: TimelineFactory = (options) => gsap.timeline(options) as unknown as TimelineLike;

export class SceneDirector {
  public route: CoreRoutePath = '/dashboard';
  private active: TimelineLike | null = null;
  private transitionId = 0;

  constructor(
    private readonly camera: PerspectiveCamera,
    private readonly target: Vector3,
    private readonly poses: RoutePoses,
    private readonly timelineFactory: TimelineFactory = gsapTimeline,
    private readonly onSettled: (route: CoreRoutePath) => void = () => {},
  ) {}

  go(route: CoreRoutePath, transitionScale: number): void {
    const transitionId = ++this.transitionId;
    this.active?.kill();
    this.active = null;
    const pose = this.poses[route];
    const settle = () => {
      if (transitionId !== this.transitionId) return;
      this.route = route;
      this.active = null;
      this.onSettled(route);
    };
    if (transitionScale <= 0) {
      this.camera.position.copy(pose.position);
      this.target.copy(pose.target);
      settle();
      return;
    }
    this.active = this.timelineFactory({ onComplete: settle, onInterrupt: settle });
    this.active
      .to(this.camera.position, {
        x: pose.position.x, y: pose.position.y, z: pose.position.z,
        duration: 0.9 * transitionScale, ease: 'power3.inOut',
      }, 0)
      .to(this.target, {
        x: pose.target.x, y: pose.target.y, z: pose.target.z,
        duration: 0.9 * transitionScale, ease: 'power3.inOut',
      }, 0);
  }

  cancelAndSettle(): void {
    this.transitionId += 1;
    this.active?.kill();
    this.active = null;
  }
}
