import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../AuthContext';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import InstallApp from '../components/InstallApp';
import AppLogo from '../components/AppLogo';
import { continuationFromAuth } from '../lib/authIntent';

// What a free account actually gets you — shown in signup mode. Keep these
// concrete (features that exist today), not aspirational marketing.
const SIGNUP_PERKS = [
  'Save your NSE & US watchlist across devices',
  'Enable browser alerts for newly published signals',
];

const GOOGLE_SCRIPT_SRC = 'https://accounts.google.com/gsi/client';
let googleScriptPromise;

const loadGoogleIdentity = () => {
  if (window.google?.accounts?.id) return Promise.resolve(window.google);
  if (googleScriptPromise) return googleScriptPromise;

  googleScriptPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${GOOGLE_SCRIPT_SRC}"]`);
    const script = existing || document.createElement('script');
    script.addEventListener('load', () => resolve(window.google), { once: true });
    script.addEventListener('error', () => reject(new Error('Google sign-in could not load.')), { once: true });
    if (!existing) {
      script.src = GOOGLE_SCRIPT_SRC;
      script.async = true;
      script.defer = true;
      document.head.appendChild(script);
    }
  }).catch((error) => {
    googleScriptPromise = undefined;
    throw error;
  });

  return googleScriptPromise;
};

const Login = () => {
  const location = useLocation();
  // Benefit-led actions arrive with ?mode=signup; direct /login visits are
  // returning users.
  const [isLogin, setIsLogin] = useState(
    () => new URLSearchParams(location.search).get('mode') !== 'signup'
  );
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const googleButtonRef = useRef(null);
  const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;

  const { loginWithEmail, signupWithEmail, loginWithGoogle } = useAuth();
  const navigate = useNavigate();

  const continueAfterAuth = useCallback(() => {
    const continuation = continuationFromAuth(location.state);
    navigate(continuation.to, { replace: true, state: continuation.state });
  }, [location.state, navigate]);

  const handleGoogleCredential = useCallback(async (response) => {
    if (!response?.credential) return;
    setError('');
    setGoogleLoading(true);
    try {
      await loginWithGoogle(response.credential);
      continueAfterAuth();
    } catch (err) {
      setError(err.response?.data?.detail || err.message || 'Google sign-in failed.');
    } finally {
      setGoogleLoading(false);
    }
  }, [continueAfterAuth, loginWithGoogle]);

  useEffect(() => {
    if (!googleClientId || !googleButtonRef.current) return undefined;
    let cancelled = false;

    loadGoogleIdentity()
      .then((google) => {
        if (cancelled || !google?.accounts?.id || !googleButtonRef.current) return;
        google.accounts.id.initialize({
          client_id: googleClientId,
          callback: handleGoogleCredential,
        });
        googleButtonRef.current.replaceChildren();
        google.accounts.id.renderButton(googleButtonRef.current, {
          type: 'standard',
          theme: 'outline',
          size: 'large',
          shape: 'rectangular',
          text: 'continue_with',
          logo_alignment: 'left',
          width: Math.min(340, googleButtonRef.current.clientWidth || 340),
        });
      })
      .catch((err) => {
        if (!cancelled) setError(err.message || 'Google sign-in could not load.');
      });

    return () => { cancelled = true; };
  }, [googleClientId, handleGoogleCredential]);

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
      // Return to the complete originating URL and preserve the pending action.
      continueAfterAuth();
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
          <p>{isLogin ? 'Welcome back — sign in to your terminal' : 'Save your watchlist and enable alerts · free · no credit card'}</p>
        </div>

        {!isLogin && (
          <ul className="login-perks">
            {SIGNUP_PERKS.map((perk) => (
              <li key={perk}><span className="login-perk-check">✓</span>{perk}</li>
            ))}
          </ul>
        )}

        {error && <div className="login-error" role="alert">{error}</div>}

        {googleClientId && (
          <>
            <div className="google-signin">
              <div ref={googleButtonRef} className="google-button-mount" aria-label="Continue with Google" />
              {googleLoading && <span className="google-signin-status">Signing in with Google...</span>}
            </div>
            <div className="divider"><span>or use email</span></div>
          </>
        )}

        <form onSubmit={handleSubmit} className="login-form">
          {!isLogin && (
            <div className="form-group">
              <label htmlFor="login-display-name">Display Name (Optional)</label>
              <input
                id="login-display-name"
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Your name"
                autoComplete="name"
              />
            </div>
          )}
          <div className="form-group">
            <label htmlFor="login-email">Email Address</label>
            <input
              id="login-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@company.com"
              autoComplete="email"
              required
            />
          </div>
          <div className="form-group">
            <label htmlFor="login-password">Password</label>
            <input
              id="login-password"
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
            Google is used only for Google sign-in.
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
