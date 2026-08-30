import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it } from 'vitest';
import App from '../App';
import { fakeUniverse } from './fakeUniverse';

beforeEach(() => localStorage.clear());

describe('AlphaNova4 shell', () => {
  it('keeps four destinations reachable and marks the active route', () => {
    render(<MemoryRouter initialEntries={['/signals']}><App universeFactory={fakeUniverse} /></MemoryRouter>);
    const nav = screen.getByRole('navigation', { name: 'Core research' });
    expect(within(nav).getAllByRole('link')).toHaveLength(4);
    expect(within(nav).getByRole('link', { name: 'Signals' })).toHaveAttribute('aria-current', 'page');
  });

  it('focus mode freezes the universe and exposes a stable data surface', async () => {
    const runtime = fakeUniverse();
    const user = userEvent.setup();
    render(<MemoryRouter initialEntries={['/dashboard']}><App universeFactory={() => runtime} /></MemoryRouter>);
    await user.click(screen.getByRole('button', { name: 'Focus data' }));
    expect(screen.getByRole('main')).toHaveAttribute('data-focus-mode', 'true');
    expect(runtime.pause).toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Resume universe' })).toBeVisible();
  });

  it('keeps the acknowledged compliance notice reopenable', async () => {
    const user = userEvent.setup();
    render(<MemoryRouter initialEntries={['/dashboard']}><App universeFactory={fakeUniverse} /></MemoryRouter>);
    expect(screen.getByText('Discl: Not Investment Advice')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Dismiss compliance notice' }));
    expect(screen.getByText('Educational analytics — not investment advice.')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'View notice' }));
    expect(screen.getByText('Discl: Not Investment Advice')).toBeVisible();
  });
});
