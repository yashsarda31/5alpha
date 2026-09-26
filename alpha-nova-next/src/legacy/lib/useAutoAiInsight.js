import { useEffect, useRef } from 'react';

// Auto-generate a page's Gemini insight the first time its underlying data is
// ready, but only when the user has already saved an API key — visitors
// without a key keep the manual "generate" button and its explanatory alert.
// `dataKey` identifies the loaded dataset (ticker string or response object);
// the insight re-generates when it changes, never twice for the same load.
export default function useAutoAiInsight(dataKey, run) {
  const last = useRef(null);
  useEffect(() => {
    if (!dataKey || last.current === dataKey) return;
    if (!localStorage.getItem('gemini_api_key')) return;
    last.current = dataKey;
    run();
    // `run` is recreated each render but only `dataKey` should re-trigger
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataKey]);
}
