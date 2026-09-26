import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { FIRST_RUN_KEY, markFirstRunStep } from '../lib/productAnalytics.js';

const loadProgress = () => {
  try { return JSON.parse(localStorage.getItem(FIRST_RUN_KEY) || '{}'); } catch { return {}; }
};

const Step = ({ done, number, children }) => (
  <li className={done ? 'is-complete' : ''}>
    <span className="first-run-step__number" aria-hidden="true">{done ? '✓' : number}</span>
    <div>{children}</div>
  </li>
);

export default function FirstRunWorkflow() {
  const [progress, setProgress] = useState(loadProgress);

  useEffect(() => {
    const update = (event) => setProgress(event.detail || loadProgress());
    window.addEventListener('alphanova:first-run', update);
    return () => window.removeEventListener('alphanova:first-run', update);
  }, []);

  const complete = (key) => () => {
    const stored = markFirstRunStep(key);
    setProgress((current) => ({ ...current, ...stored }));
  };

  return (
    <section className="first-run-workflow" aria-labelledby="first-run-title">
      <h3 id="first-run-title">Start your workflow</h3>
      <p>Move from a market observation to a risk-defined plan. No account is required to analyse or size a position.</p>
      <ol>
        <Step number="1" done={progress.choose}>
          <a href="#market-movers" onClick={complete('choose')}>Choose a displayed mover</a> or use search in Analyse.
        </Step>
        <Step number="2" done={progress.analyse}>
          <Link to="/chart" onClick={complete('choose')}>Analyse the chart and evidence</Link>.
        </Step>
        <Step number="3" done={progress.size}>
          <Link to="/position-sizing">Define the stop and size the position</Link>.
        </Step>
        <Step number="4" done={progress.durable}>
          Save the symbol with its star, or enable alerts when you want a durable workflow.
        </Step>
      </ol>
    </section>
  );
}
