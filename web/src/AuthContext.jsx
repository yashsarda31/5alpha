import React, { createContext, useContext, useState, useEffect } from 'react';
import { apiClient } from './lib/apiClient';

const AuthContext = createContext();

// eslint-disable-next-line react-refresh/only-export-components
export const useAuth = () => useContext(AuthContext);

const TOKEN_KEY = 'alphanova_auth_token';
const USER_KEY = 'alphanova_auth_user';

const authHeader = () => {
  const token = localStorage.getItem(TOKEN_KEY);
  return token ? { Authorization: `Bearer ${token}` } : {};
};

const readCachedUser = () => {
  try {
    if (!localStorage.getItem(TOKEN_KEY)) return null;
    return JSON.parse(localStorage.getItem(USER_KEY));
  } catch {
    return null;
  }
};

const writeCachedUser = (user) => {
  try { localStorage.setItem(USER_KEY, JSON.stringify(user)); } catch { /* quota */ }
};

export const AuthProvider = ({ children }) => {
  // Optimistic restore: with a stored token + user, render the app IMMEDIATELY
  // and validate the session in the background. This takes the /api/auth/me
  // round-trip (0.5s warm, seconds on a serverless cold start) off the
  // critical path of every app open. A revoked session still logs out — just
  // a beat later; data endpoints reject the dead token server-side anyway.
  const [currentUser, setCurrentUser] = useState(readCachedUser);
  const [loading, setLoading] = useState(() => !readCachedUser() && !!localStorage.getItem(TOKEN_KEY));

  useEffect(() => {
    const restoreSession = async () => {
      const token = localStorage.getItem(TOKEN_KEY);
      if (!token) {
        setLoading(false);
        return;
      }
      try {
        const res = await apiClient.get('/api/auth/me', { headers: authHeader() });
        setCurrentUser(res.data.user);
        writeCachedUser(res.data.user);
      } catch (err) {
        // Only a definitive rejection kills the session — a network blip or
        // cold-start timeout must not log the user out of the optimistic UI.
        if (err.response && [401, 403].includes(err.response.status)) {
          localStorage.removeItem(TOKEN_KEY);
          localStorage.removeItem(USER_KEY);
          setCurrentUser(null);
        }
      } finally {
        setLoading(false);
      }
    };
    restoreSession();
  }, []);

  const loginWithEmail = async (email, password) => {
    const res = await apiClient.post('/api/auth/login', { email, password });
    localStorage.setItem(TOKEN_KEY, res.data.token);
    writeCachedUser(res.data.user);
    setCurrentUser(res.data.user);
    return res.data.user;
  };

  const signupWithEmail = async (email, password, displayName) => {
    const res = await apiClient.post('/api/auth/signup', { email, password, displayName });
    localStorage.setItem(TOKEN_KEY, res.data.token);
    writeCachedUser(res.data.user);
    setCurrentUser(res.data.user);
    return res.data.user;
  };

  const loginWithGoogle = async (credential) => {
    const res = await apiClient.post('/api/auth/google', { credential });
    localStorage.setItem(TOKEN_KEY, res.data.token);
    writeCachedUser(res.data.user);
    setCurrentUser(res.data.user);
    return res.data;
  };

  const logout = async () => {
    try {
      await apiClient.post('/api/auth/logout', null, { headers: authHeader() });
    } catch {
      // Session is cleared locally even if the server call fails
    }
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    setCurrentUser(null);
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
      {!loading && children}
    </AuthContext.Provider>
  );
};
