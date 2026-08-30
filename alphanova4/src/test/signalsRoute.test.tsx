import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import App from '../App';
import { SignalAlertProvider } from '../alerts/SignalAlertProvider';
import { fakeUniverse } from './fakeUniverse';

afterEach(() => { vi.unstubAllGlobals(); localStorage.clear(); });
const response = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });

describe('Signals route', () => {
  it('recovers from malformed persisted alert history without blanking the app', async () => {
    localStorage.setItem('alphanova_seen_signals', 'not-json');
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(response({
      signals_market: 'IN', data_status: { state: 'ready', observed_at: '2026-08-30T09:30:00+05:30' },
      regime: { overall: 'RISK-ON' }, setups: { plans: [{ symbol: 'RELIANCE', side: 'LONG', score: 78, entry: 1400, stop: 1350, target: 1500 }] },
    }))));

    render(<MemoryRouter initialEntries={['/signals']}><SignalAlertProvider><App universeFactory={fakeUniverse} /></SignalAlertProvider></MemoryRouter>);

    expect(await screen.findByRole('heading', { name: 'LONG RELIANCE' })).toBeVisible();
    expect(screen.getByRole('navigation', { name: 'Core research' })).toBeVisible();
  });

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

  it('loads the current signals API contract without false provider warnings', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(response({
      signals_market: 'US',
      data_status: { status: 'last_session', observed_at: '2026-08-31T00:30:31+05:30' },
      regime: { overall: 'RISK-ON' },
      setups: { plans: [{ symbol: 'CRM', side: 'LONG', score: 73, entry: 247.32, stop: 231, target: 271.8, why: 'Open position with locked levels' }] },
    }))));
    render(<MemoryRouter initialEntries={['/signals']}><App universeFactory={fakeUniverse} /></MemoryRouter>);
    expect(await screen.findByRole('heading', { name: 'LONG CRM' })).toBeVisible();
    expect(screen.getByText(/stale/i)).toBeVisible();
    expect(screen.queryByText(/provider_limited/i)).not.toBeInTheDocument();
    expect(screen.getByText('Open position with locked levels')).toBeVisible();
  });
});
