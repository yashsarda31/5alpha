import React, { createContext, useContext, useState, useEffect } from 'react';
import axios from 'axios';

const AuthContext = createContext();

// eslint-disable-next-line react-refresh/only-export-components
export const useAuth = () => useContext(AuthContext);

const TOKEN_KEY = 'alphanova_auth_token';

const authHeader = () => {
  const token = localStorage.getItem(TOKEN_KEY);
  return token ? { Authorization: `Bearer ${token}` } : {};
};

export const AuthProvider = ({ children }) => {
  const [currentUser, setCurrentUser] = useState(null);
  // Hold rendering until the stored session is validated, so a logged-in
  // user refreshing the page doesn't flash the login screen.
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const restoreSession = async () => {
      const token = localStorage.getItem(TOKEN_KEY);
      if (!token) {
        setLoading(false);
        return;
      }
      try {
        const res = await axios.get('/api/auth/me', { headers: authHeader() });
        setCurrentUser(res.data.user);
      } catch {
        localStorage.removeItem(TOKEN_KEY);
      } finally {
        setLoading(false);
      }
    };
    restoreSession();
  }, []);

  const loginWithEmail = async (email, password) => {
    const res = await axios.post('/api/auth/login', { email, password });
    localStorage.setItem(TOKEN_KEY, res.data.token);
    setCurrentUser(res.data.user);
    return res.data.user;
  };

  const signupWithEmail = async (email, password, displayName) => {
    const res = await axios.post('/api/auth/signup', { email, password, displayName });
    localStorage.setItem(TOKEN_KEY, res.data.token);
    setCurrentUser(res.data.user);
    return res.data.user;
  };

  const logout = async () => {
    try {
      await axios.post('/api/auth/logout', null, { headers: authHeader() });
    } catch {
      // Session is cleared locally even if the server call fails
    }
    localStorage.removeItem(TOKEN_KEY);
    setCurrentUser(null);
  };

  const value = {
    currentUser,
    loginWithEmail,
    signupWithEmail,
    logout,
    loading
  };

  return (
    <AuthContext.Provider value={value}>
      {!loading && children}
    </AuthContext.Provider>
  );
};
