import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import App from '../App';
import { fakeUniverse } from './fakeUniverse';

afterEach(() => vi.unstubAllGlobals());
const response = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });

describe('Signals route', () => {
  it('shows a selectable evidence dossier and projects its zone', async () => {
    const runtime = fakeUniverse();
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(response({
      signals_market: 'IN', data_status: { state: 'ready', observed_at: '2026-08-30T09:30:00+05:30' },
      regime: { overall: 'RISK-ON' }, setups: { plans: [{ symbol: 'RELIANCE', side: 'LONG', score: 78, entry: 1400, stop: 1350, target: 1500, invalidation: 'Close below support', rationale: 'Momentum confirmation', risk_context: 'Size conservatively' }] },
    }))));
    render(<MemoryRouter initialEntries={['/signals']}><App universeFactory={() => runtime} /></MemoryRouter>);
    await userEvent.click(await screen.findByRole('button', { name: /RELIANCE/ }));
    expect(screen.getByRole('heading', { name: 'LONG RELIANCE' })).toBeVisible();
    expect(screen.getByText('Close below support')).toBeVisible();
    expect(screen.getByText('Research analytics only — not investment advice.')).toBeVisible();
    await waitFor(() => expect(runtime.renderZone).toHaveBeenCalledWith('signals', expect.objectContaining({ setups: expect.any(Array) })));
  });

  it('fails closed when no valid plan survives normalization', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(response({ data_status: { state: 'ready' }, setups: { plans: [{ symbol: 'BAD', side: 'LONG', score: 90, entry: null, stop: 1, target: 2 }] } }))));
    render(<MemoryRouter initialEntries={['/signals']}><App universeFactory={fakeUniverse} /></MemoryRouter>);
    expect(await screen.findByText('HOLD (INSUFFICIENT EVIDENCE)')).toBeVisible();
    expect(screen.queryByText('BUY')).not.toBeInTheDocument();
  });
});
