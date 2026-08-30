import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import App from '../App';
import { fakeUniverse } from './fakeUniverse';

afterEach(() => vi.unstubAllGlobals());
const chart = (ticker: string) => ({ ticker, dates:['a','b'], open:[10,11], high:[12,13], low:[9,10], close:[11,12], volume:[1,2], sma20:[10,11], sma50:[9,10], rsi:[50,55] });
const ok = (body: unknown, status=200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type':'application/json' } });

describe('Analyse route', () => {
  it('loads a URL-backed ticker and adopts a newer search', async () => {
    vi.stubGlobal('fetch', vi.fn((path: string) => Promise.resolve(ok(path.includes('RELIANCE') ? chart('RELIANCE.NS') : path.includes('fundamentals') ? {} : chart('NVDA')))));
    render(<MemoryRouter initialEntries={['/chart?symbol=NVDA']}><App universeFactory={fakeUniverse}/></MemoryRouter>);
    expect(await screen.findByRole('heading', { name: 'NVDA trajectory' })).toBeVisible();
    await userEvent.clear(screen.getByRole('searchbox')); await userEvent.type(screen.getByRole('searchbox'), 'RELIANCE.NS'); await userEvent.click(screen.getByRole('button', { name: 'Analyse symbol' }));
    expect(await screen.findByRole('heading', { name: 'RELIANCE.NS trajectory' })).toBeVisible();
  });
  it('keeps AI errors inside the panel', async () => {
    vi.stubGlobal('fetch', vi.fn((path: string) => Promise.resolve(path === '/api/ai/chart' ? ok({ detail: 'provider unavailable' }, 503) : path.includes('fundamentals') ? ok({}) : ok(chart('NVDA')))));
    render(<MemoryRouter initialEntries={['/chart?symbol=NVDA']}><App universeFactory={fakeUniverse}/></MemoryRouter>);
    await screen.findByRole('heading', { name: 'NVDA trajectory' }); await userEvent.click(screen.getByRole('button', { name: 'Generate market insight' }));
    expect(await screen.findByRole('status')).toHaveTextContent('provider unavailable');
    expect(screen.getByRole('navigation', { name: 'Core research' })).toBeVisible();
  });
});
