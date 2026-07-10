import React from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowUpRight, BarChart3, Bird, Calculator, ChevronsUpDown,
  Compass, GraduationCap, Landmark, LineChart, Link2, Newspaper,
  Rocket, Search, Sparkles,
} from 'lucide-react';
import './Research.css';

const GROUPS = [
  {
    title: 'Find opportunity',
    subtitle: 'Start with strength, rotation and systematic filters.',
    items: [
      { to: '/momentum', title: 'Momentum Leaders', copy: 'Relative strength across India and US sessions.', Icon: Rocket },
      { to: '/sectors', title: 'Sector Rotation', copy: 'See where leadership is strengthening or fading.', Icon: Compass },
      { to: '/screener', title: 'Quant Screener', copy: 'Filter value, quality, growth and momentum.', Icon: Search },
    ],
  },
  {
    title: 'Validate the setup',
    subtitle: 'Pressure-test price structure, fundamentals and flow.',
    items: [
      { to: '/chart', title: 'Chart Analyser', copy: 'Structure, indicators and evidence-backed interpretation.', Icon: LineChart },
      { to: '/fundamentals', title: 'Fundamentals', copy: 'Quality, growth, balance sheet and valuation context.', Icon: BarChart3 },
      { to: '/option-chain', title: 'Option Chain', copy: 'Positioning, support, resistance and volatility.', Icon: Link2 },
      { to: '/flcl', title: 'FLCL Analysis', copy: 'First-leg and corrective-leg swing structure.', Icon: ChevronsUpDown },
      { to: '/druck-minervini', title: 'Druck & Minervini', copy: 'Growth, trend template and risk discipline.', Icon: Bird },
    ],
  },
  {
    title: 'Understand the context',
    subtitle: 'Add institutional, macro and catalyst evidence.',
    items: [
      { to: '/fiidii', title: 'FII / DII Activity', copy: 'Institutional cash-market participation.', Icon: Landmark },
      { to: '/news', title: 'News & Catalysts', copy: 'Recent material events with sentiment context.', Icon: Newspaper },
      { to: '/arima', title: 'SARIMAX Forecaster', copy: 'Scenario-based price and volatility forecasts.', Icon: Sparkles },
      { to: '/dcf', title: 'DCF Calculator', copy: 'Longer-term valuation guardrails for swing ideas.', Icon: Calculator },
      { to: '/learn', title: 'Learn', copy: 'Plain-language explanations for every model.', Icon: GraduationCap },
    ],
  },
];

const Research = () => (
  <main className="research-hub fade-in">
    <header>
      <span>Research library</span>
      <h1>Go deeper only when the decision needs it.</h1>
      <p>V2’s strongest analytical tools, reorganized around finding, validating and understanding a 2–20 day setup.</p>
    </header>

    {GROUPS.map((group) => (
      <section key={group.title}>
        <div className="research-section-title">
          <div><h2>{group.title}</h2><p>{group.subtitle}</p></div>
          <span>{group.items.length} tools</span>
        </div>
        <div className="research-grid">
          {group.items.map((item) => {
            const ToolIcon = item.Icon;
            return (
            <Link to={item.to} key={item.to}>
              <div className="research-icon"><ToolIcon size={19} aria-hidden="true" /></div>
              <div><h3>{item.title}</h3><p>{item.copy}</p></div>
              <ArrowUpRight size={16} aria-hidden="true" />
            </Link>
            );
          })}
        </div>
      </section>
    ))}
  </main>
);

export default Research;
