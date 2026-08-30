import type { ResourceState } from '../data/contracts';

export const loadingResource = <T>(): ResourceState<T> => ({ status: 'loading', data: null, error: null });

export const readyResource = <T>(data: T): ResourceState<T> => ({ status: 'ready', data, error: null });

export const failedResource = <T>(current: ResourceState<T>, error: unknown): ResourceState<T> => {
  if (current.data !== null) return { status: 'stale', data: current.data, error: null };
  return {
    status: 'error',
    data: null,
    error: error instanceof Error ? error.message : 'Unavailable',
  };
};
