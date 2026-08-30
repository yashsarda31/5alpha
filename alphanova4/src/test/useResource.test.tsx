import { renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useResource } from '../hooks/useResource';

describe('useResource', () => {
  it('loads data and aborts the active request on unmount', async () => {
    const captured: { signal?: AbortSignal } = {};
    const loader = vi.fn(async (signal: AbortSignal) => {
      captured.signal = signal;
      return { value: 42 };
    });
    const view = renderHook(() => useResource('answer', loader, 0));
    await waitFor(() => expect(view.result.current).toEqual({ status: 'ready', data: { value: 42 }, error: null }));
    view.unmount();
    expect(captured.signal?.aborted).toBe(true);
  });
});
