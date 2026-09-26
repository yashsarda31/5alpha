import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { apiClient } from './lib/apiClient';
import { useLocation } from 'react-router-dom';
import { useAuth } from './AuthContext';
import { readLocalChoice, writeLocalChoice } from './lib/localPrediction';
import { shouldLoadPrediction } from './lib/lightweightPolicy';

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
  const location = useLocation();
  const [today, setToday] = useState(null);   // { qdate, prompt, locked, your_choice, outcome, ... }
  const [stats, setStats] = useState(null);   // { current_streak, accuracy, hidden, recent, ... }
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const reload = useCallback(async () => {
    try {
      const todayRequest = apiClient.get('/api/predict/today', { headers: authHeader() });
      if (currentUser) {
        const [t, m] = await Promise.all([
          todayRequest,
          apiClient.get('/api/predict/me', { headers: authHeader() }),
        ]);
        setToday(t.data);
        setStats(m.data);
      } else {
        const t = await todayRequest;
        const localChoice = readLocalChoice(window.localStorage, t.data.qdate);
        setToday({ ...t.data, your_choice: localChoice });
        setStats(null);
      }
    } catch {
      // non-fatal
    } finally {
      setLoading(false);
    }
  }, [currentUser]);

  useEffect(() => {
    if (!shouldLoadPrediction(location.pathname)) {
      setLoading(false);
      return;
    }
    setLoading(true);
    reload();
  }, [currentUser, location.pathname, reload]);

  const submit = useCallback(async (choice) => {
    setError(null);
    if (!currentUser) {
      if (today?.qdate) writeLocalChoice(window.localStorage, today.qdate, choice);
      setToday((t) => (t ? { ...t, your_choice: choice } : t));
      return;
    }
    const prev = today;
    setToday((t) => (t ? { ...t, your_choice: choice } : t)); // optimistic
    try {
      await apiClient.post('/api/predict', { choice }, { headers: authHeader() });
    } catch (e) {
      setToday(prev); // rollback
      setError(e.response?.data?.detail || 'Could not submit your call.');
      throw e;
    }
  }, [currentUser, today]);

  const setHidden = useCallback(async (hidden) => {
    setStats((s) => (s ? { ...s, hidden } : s)); // optimistic
    try {
      await apiClient.post('/api/predict/hide', { hidden }, { headers: authHeader() });
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
