import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useUniverse } from '../hooks/useUniverse';
import type { UniverseRuntime } from '../scene/createUniverse';

const Harness = ({ factory }: { factory: () => UniverseRuntime }) => {
  const { hostRef } = useUniverse({ factory, tier: 'balanced' });
  return <div ref={hostRef} data-testid="universe-host" />;
};

describe('useUniverse', () => {
  it('mounts the runtime, applies the tier, and disposes on unmount', () => {
    const runtime = {
      mount: vi.fn(), setTier: vi.fn(), dispose: vi.fn(),
    } as unknown as UniverseRuntime;
    const view = render(<Harness factory={() => runtime} />);
    expect(runtime.mount).toHaveBeenCalledWith(screen.getByTestId('universe-host'));
    expect(runtime.setTier).toHaveBeenCalledWith('balanced');
    view.unmount();
    expect(runtime.dispose).toHaveBeenCalledOnce();
  });
});
