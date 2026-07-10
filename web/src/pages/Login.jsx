import React, { useState } from 'react';
import { useAuth } from '../AuthContext';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import InstallApp from '../components/InstallApp';
import AppLogo from '../components/AppLogo';

// What a free account actually gets you — shown in signup mode. Keep these
// concrete (features that exist today), not aspirational marketing.
const SIGNUP_PERKS = [
  'Live NSE & US F&O signals with entry, stop and target',
  'Push alerts the moment a new setup scores',
  'Your watchlist across NSE & US with live prices',
  'Every signal tracked in a published model portfolio',
];

const Login = () => {
  const location = useLocation();
  // Guests arrive from in-app CTAs with ?mode=signup; direct /login visits are
  // returning users (anonymous visitors land on the dashboard now, not here).
  const [isLogin, setIsLogin] = useState(
    () => new URLSearchParams(location.search).get('mode') !== 'signup'
  );
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const { loginWithEmail, signupWithEmail } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      if (isLogin) {
        await loginWithEmail(email, password);
      } else {
        await signupWithEmail(email, password, displayName);
      }
      // Return the user to whatever page brought them here (watchlist star,
      // guest banner…) so the action they wanted is one tap away.
      navigate(location.state?.from?.pathname || '/dashboard');
    } catch (err) {
      setError(err.response?.data?.detail || err.message || 'Sign-in failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-container fade-in">
      <div className="login-card card">
        <div className="login-header">
          <div className="logo-icon"><AppLogo size={76} /></div>
          <h1>{isLogin ? 'Alpha Nova' : 'Create your free account'}</h1>
          <p>{isLogin ? 'Welcome back — sign in to your terminal' : 'Full access · free · no credit card'}</p>
        </div>

        {!isLogin && (
          <ul className="login-perks">
            {SIGNUP_PERKS.map((perk) => (
              <li key={perk}><span className="login-perk-check">✓</span>{perk}</li>
            ))}
          </ul>
        )}

        {error && <div className="login-error">{error}</div>}

        <form onSubmit={handleSubmit} className="login-form">
          {!isLogin && (
            <div className="form-group">
              <label>Display Name (Optional)</label>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Your name"
                autoComplete="name"
              />
            </div>
          )}
          <div className="form-group">
            <label>Email Address</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@company.com"
              autoComplete="email"
              required
            />
          </div>
          <div className="form-group">
            <label>Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              autoComplete={isLogin ? 'current-password' : 'new-password'}
              minLength={6}
              required
            />
          </div>

          <button type="submit" disabled={loading} className="login-btn">
            {loading ? <span className="spinner"></span> : (isLogin ? 'Log in' : 'Create free account')}
          </button>
        </form>

        <div className="login-footer">
          <p>
            {isLogin ? 'New here?' : 'Already have an account?'}
            <button
              type="button"
              className="text-btn"
              onClick={() => setIsLogin(!isLogin)}
            >
              {isLogin ? 'Create your free account' : 'Log in here'}
            </button>
          </p>
          <p style={{ marginTop: '10px' }}>
            <Link to="/dashboard" className="text-btn" style={{ textDecoration: 'none' }}>
              Explore the terminal first →
            </Link>
          </p>
          <p style={{ fontSize: '12px', marginTop: '12px', color: 'var(--text-secondary)' }}>
            Accounts are stored locally in the app's own database — no third-party services.
          </p>
          <div style={{ marginTop: '16px' }}>
            <InstallApp compact />
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;
