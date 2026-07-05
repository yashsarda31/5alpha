import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import axios from 'axios';
import { useAuth } from './AuthContext';

const PredictionContext = createContext();

// eslint-disable-next-line react-refresh/only-export-components
export const usePrediction = () => useContext(PredictionContext);

const TOKEN_KEY = 'alphanova_auth_token';
const authHeader = () => {
  const token = localStorage.getItem(TOKEN_KEY);
  return token ? { Authorization: `Bearer ${token}` } : {};
};

export const PredictionProvider = ({ children }) => {
  const { currentUser } = useAuth();
  const [today, setToday] = useState(null);   // { qdate, prompt, locked, your_choice, outcome, ... }
  const [stats, setStats] = useState(null);   // { current_streak, accuracy, hidden, recent, ... }
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const reload = useCallback(async () => {
    if (!localStorage.getItem(TOKEN_KEY)) { setLoading(false); return; }
    try {
      const [t, m] = await Promise.all([
        axios.get('/api/predict/today', { headers: authHeader() }),
        axios.get('/api/predict/me', { headers: authHeader() }),
      ]);
      setToday(t.data);
      setStats(m.data);
    } catch {
      // non-fatal
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (currentUser) { setLoading(true); reload(); }
    else { setToday(null); setStats(null); setLoading(false); }
  }, [currentUser, reload]);

  const submit = useCallback(async (choice) => {
    setError(null);
    const prev = today;
    setToday((t) => (t ? { ...t, your_choice: choice } : t)); // optimistic
    try {
      await axios.post('/api/predict', { choice }, { headers: authHeader() });
    } catch (e) {
      setToday(prev); // rollback
      setError(e.response?.data?.detail || 'Could not submit your call.');
      throw e;
    }
  }, [today]);

  const setHidden = useCallback(async (hidden) => {
    setStats((s) => (s ? { ...s, hidden } : s)); // optimistic
    try {
      await axios.post('/api/predict/hide', { hidden }, { headers: authHeader() });
    } catch {
      setStats((s) => (s ? { ...s, hidden: !hidden } : s)); // rollback
    }
  }, []);

  const value = useMemo(() => ({
    today, stats, loading, error, submit, setHidden, reload,
    clearError: () => setError(null),
  }), [today, stats, loading, error, submit, setHidden, reload]);

  return <PredictionContext.Provider value={value}>{children}</PredictionContext.Provider>;
};
