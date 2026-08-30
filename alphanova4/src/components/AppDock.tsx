import { NavLink } from 'react-router-dom';
import { CORE_ROUTES } from '../coreRoutes';

const glyphs: Record<string, string> = {
  Today: '◉',
  Signals: 'ϟ',
  Analyse: '⌁',
  Watchlist: '✦',
};

export const AppDock = () => (
  <nav className="app-dock" aria-label="Core research">
    {CORE_ROUTES.map(({ path, label }) => (
      <NavLink key={path} to={path} className={({ isActive }) => `dock-link${isActive ? ' is-active' : ''}`}>
        <span className="dock-glyph" aria-hidden="true">{glyphs[label]}</span>
        <span>{label}</span>
      </NavLink>
    ))}
  </nav>
);
