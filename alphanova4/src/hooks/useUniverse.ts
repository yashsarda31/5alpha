import { useEffect, useRef, useState } from 'react';
import { createUniverse, type UniverseRuntime } from '../scene/createUniverse';
import type { RenderTier } from '../scene/types';

interface UniverseOptions {
  factory?: () => UniverseRuntime;
  tier: RenderTier;
}

export const useUniverse = ({ factory = createUniverse, tier }: UniverseOptions) => {
  const hostRef = useRef<HTMLDivElement>(null);
  const [runtime] = useState<UniverseRuntime>(factory);

  useEffect(() => {
    if (!hostRef.current) return undefined;
    runtime.mount(hostRef.current);
    return () => runtime.dispose();
  }, [runtime]);

  useEffect(() => {
    runtime.setTier(tier);
  }, [runtime, tier]);

  return { hostRef, runtime };
};
