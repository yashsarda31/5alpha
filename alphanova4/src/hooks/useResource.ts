import { useEffect, useState } from 'react';
import type { ResourceState } from '../data/contracts';
import { failedResource, loadingResource, readyResource } from '../lib/resourceState';

export const useResource = <T,>(
  key: string,
  loader: (signal: AbortSignal) => Promise<T>,
  refreshMs: number,
): ResourceState<T> => {
  const [state, setState] = useState<ResourceState<T>>(() => loadingResource<T>());

  useEffect(() => {
    const controller = new AbortController();
    const load = async () => {
      try {
        const data = await loader(controller.signal);
        if (!controller.signal.aborted) setState(readyResource(data));
      } catch (error) {
        if (!controller.signal.aborted) setState((current) => failedResource(current, error));
      }
    };
    void load();
    const interval = refreshMs > 0
      ? window.setInterval(() => { if (!document.hidden) void load(); }, refreshMs)
      : null;
    return () => {
      controller.abort();
      if (interval !== null) window.clearInterval(interval);
    };
  }, [key, loader, refreshMs]);

  return state;
};
