import { useEffect, useState } from 'react';
import axios from 'axios';
import { loadWatchlistChartSignals } from './chartTechnicalSignal.js';

export function useWatchlistChartSignals(items, refreshVersion) {
  const key = JSON.stringify(items.map(({ symbol, market }) => ({ symbol, market })));
  const [batch, setBatch] = useState(null);
  useEffect(() => {
    const controller = new AbortController();
    const results = {};
    void loadWatchlistChartSignals(JSON.parse(key), async (ticker, signal) => {
      const response = await axios.get(`/api/chart/${encodeURIComponent(ticker)}`, { signal, timeout: 20000 });
      return response.data;
    }, (ticker, result) => {
      results[ticker] = result;
      setBatch({ key, version: refreshVersion, results: { ...results } });
    }, controller.signal);
    return () => controller.abort();
  }, [key, refreshVersion]);
  return batch?.key === key && batch?.version === refreshVersion ? batch.results : {};
}
