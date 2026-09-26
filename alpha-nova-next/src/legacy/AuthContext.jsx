import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { apiClient } from './lib/apiClient';

const AuthContext = createContext();

// eslint-disable-next-line react-refresh/only-export-components
export const useAuth = () => useContext(AuthContext);

const TOKEN_KEY = 'alphanova_auth_token';
const USER_KEY = 'alphanova_auth_user';

const readToken = () => {
  try { return localStorage.getItem(TOKEN_KEY); } catch { return null; }
};

const authHeader = () => {
  const token = readToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
};

const readCachedUser = () => {
  try {
    if (!readToken()) return null;
    return JSON.parse(localStorage.getItem(USER_KEY));
  } catch {
    return null;
  }
};

const writeCachedUser = (user) => {
  try { localStorage.setItem(USER_KEY, JSON.stringify(user)); } catch { /* quota */ }
};

const clearSession = () => {
  try { localStorage.removeItem(TOKEN_KEY); localStorage.removeItem(USER_KEY); } catch { /* storage disabled */ }
};

export const AuthProvider = ({ children }) => {
  // Optimistic restore: with a stored token + user, render the app IMMEDIATELY
  // and validate the session in the background. This takes the /api/auth/me
  // round-trip (0.5s warm, seconds on a serverless cold start) off the
  // critical path of every app open. A revoked session still logs out — just
  // a beat later; data endpoints reject the dead token server-side anyway.
  const [currentUser, setCurrentUser] = useState(readCachedUser);
  const [loading, setLoading] = useState(() => !readCachedUser() && !!readToken());
  const sessionVersion = useRef(0);

  useEffect(() => {
    const version = ++sessionVersion.current;
    const controller = new AbortController();
    let stopped = false;
    const isCurrent = () => !stopped && sessionVersion.current === version;
    // A cold start or offline provider must not block public research forever.
    const timer = window.setTimeout(() => controller.abort(), 15000);
    const restoreSession = async () => {
      const token = readToken();
      if (!token) {
        setLoading(false);
        window.clearTimeout(timer);
        return;
      }
      try {
        const res = await apiClient.get('/api/auth/me', { headers: { Authorization: `Bearer ${token}` }, signal: controller.signal });
        if (!isCurrent() || readToken() !== token) return;
        setCurrentUser(res.data.user);
        writeCachedUser(res.data.user);
      } catch (err) {
        // Only a definitive rejection kills the session — a network blip or
        // cold-start timeout must not log the user out of the optimistic UI.
        if (isCurrent() && readToken() === token && err.response && [401, 403].includes(err.response.status)) {
          clearSession();
          setCurrentUser(null);
        }
      } finally {
        window.clearTimeout(timer);
        if (isCurrent()) setLoading(false);
      }
    };
    restoreSession();
    return () => {
      stopped = true;
      sessionVersion.current += 1;
      controller.abort();
      window.clearTimeout(timer);
    };
  }, []);

  const authenticate = async (url, body) => {
    const version = ++sessionVersion.current;
    const res = await apiClient.post(url, body);
    // Ignore completions from before sign-out or a newer authentication attempt.
    if (sessionVersion.current !== version) return res.data;
    localStorage.setItem(TOKEN_KEY, res.data.token);
    writeCachedUser(res.data.user);
    setCurrentUser(res.data.user);
    setLoading(false);
    return res.data;
  };

  const loginWithEmail = async (email, password) => {
    const data = await authenticate('/api/auth/login', { email, password });
    return data.user;
  };

  const signupWithEmail = async (email, password, displayName) => {
    const data = await authenticate('/api/auth/signup', { email, password, displayName });
    return data.user;
  };

  const loginWithGoogle = async (credential) => {
    return authenticate('/api/auth/google', { credential });
  };

  const logout = async () => {
    const headers = authHeader();
    sessionVersion.current += 1;
    clearSession();
    setCurrentUser(null);
    setLoading(false);
    try {
      await apiClient.post('/api/auth/logout', null, { headers });
    } catch {
      // Session is cleared locally even if the server call fails
    }
  };

  const value = {
    currentUser,
    loginWithEmail,
    signupWithEmail,
    loginWithGoogle,
    logout,
    loading
  };

  return (
    <AuthContext.Provider value={value}>
      {loading ? <div className="an-loading" role="status">Restoring your workspace…</div> : children}
    </AuthContext.Provider>
  );
};
