import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { expect, it } from 'vitest';
import App from '../App';
import { fakeUniverse } from './fakeUniverse';

it.each([
  ['/dashboard', 'Today'],
  ['/signals', 'Signals'],
  ['/chart?symbol=NVDA', 'Analyse'],
  ['/watchlist', 'Watchlist'],
  ['/login', 'Account'],
])('renders %s inside the AlphaNova4 shell', (path, label) => {
  render(<MemoryRouter initialEntries={[path]}><App universeFactory={fakeUniverse} /></MemoryRouter>);
  expect(screen.getByRole('main')).toHaveAttribute('data-route-label', label);
});
