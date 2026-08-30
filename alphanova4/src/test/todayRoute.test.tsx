import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import App from '../App';
import { fakeUniverse } from './fakeUniverse';

afterEach(() => vi.unstubAllGlobals());

const okResponse = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });

describe('Today route', () => {
  it('renders the API snapshot and projects the composed Today model', async () => {
    const runtime = fakeUniverse();
    vi.stubGlobal('fetch', vi.fn((path: string) => Promise.resolve(path === '/api/dashboard'
      ? okResponse({ market_open: true, indices: [{ name: 'NIFTY 50', last: 24252, change_pct: 0.4 }], movers: [] })
      : okResponse({ data_status: { state: 'ready', observed_at: '2026-08-30T09:30:00+05:30' }, regime: { overall: 'RISK-ON', breadth: { adv: 30, dec: 20 } }, setups: { plans: [] } }))));
    render(<MemoryRouter initialEntries={['/dashboard']}><App universeFactory={() => runtime} /></MemoryRouter>);
    expect(await screen.findByText('NIFTY 50')).toBeVisible();
    expect(screen.getByText('RISK-ON')).toBeVisible();
    await waitFor(() => expect(runtime.renderZone).toHaveBeenCalledWith('today', expect.objectContaining({ status: 'ready' })));
  });

  it('labels complete provider failure without inventing market values', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
    render(<MemoryRouter initialEntries={['/dashboard']}><App universeFactory={fakeUniverse} /></MemoryRouter>);
    expect(await screen.findByRole('status')).toHaveTextContent('Market data unavailable');
    expect(screen.queryByText('NIFTY 50')).not.toBeInTheDocument();
  });
});
