import React, { useState, useEffect, useRef, useCallback, useId } from 'react';
import { useMarket } from '../MarketContext';
import './TickerSearch.css';

// Ticker input with company-name autocomplete. Type "asian paints" and pick
// ASIANPAINT.NS — no need to know the NSE/Yahoo symbol. Results come from
// /api/symbol-search (Yahoo search proxied server-side, NSE listings first).
//
// Props:
//   value / onChange(str)   — controlled input value
//   onSelect(symbol, row)   — a suggestion was picked (input already updated);
//                             pages with a cheap fetch use this to auto-load
//   placeholder, inputStyle, inputProps, autoUpper (default true)
const queryCache = new Map();

const TickerSearch = ({ value, onChange, onSelect, placeholder, inputStyle, inputProps = {}, autoUpper = true }) => {
  const { market } = useMarket();
  const [results, setResults] = useState([]);
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(-1);
  const boxRef = useRef(null);
  const debounceRef = useRef(null);
  const requestRef = useRef(0);
  const abortRef = useRef(null);
  const listId = useId();

  const cancelSearch = useCallback(() => {
    requestRef.current += 1;
    clearTimeout(debounceRef.current);
    abortRef.current?.abort();
  }, []);

  const dismiss = useCallback(() => {
    cancelSearch();
    setOpen(false);
    setResults([]);
    setHi(-1);
  }, [cancelSearch]);

  useEffect(() => {
    const onDoc = (e) => { if (boxRef.current && !boxRef.current.contains(e.target)) dismiss(); };
    document.addEventListener('mousedown', onDoc);
    return () => { document.removeEventListener('mousedown', onDoc); cancelSearch(); };
  }, [dismiss, cancelSearch]);

  const search = (q) => {
    dismiss();
    const requestId = requestRef.current;
    const trimmed = q.trim().toUpperCase();
    if (trimmed.length < 2) return;
    const cacheKey = `${market}:${trimmed}`;
    if (queryCache.has(cacheKey)) {
      setResults(queryCache.get(cacheKey)); setOpen(true); setHi(-1);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      const controller = new AbortController();
      abortRef.current = controller;
      try {
        const r = await fetch(`/api/symbol-search?q=${encodeURIComponent(trimmed)}&market=${encodeURIComponent(market)}`, { signal: controller.signal });
        if (!r.ok) return;
        const j = await r.json();
        if (!Array.isArray(j.results)) return;
        const next = j.results.filter((row) => row && typeof row.symbol === 'string' && row.symbol.trim());
        if (requestRef.current !== requestId) return;
        if (queryCache.size >= 100) queryCache.delete(queryCache.keys().next().value);
        queryCache.set(cacheKey, next);
        setResults(next); setOpen(true); setHi(-1);
      } catch { /* no dropdown on failure — typing still works as before */ }
    }, 250);
  };

  const handleChange = (e) => {
    const raw = e.target.value;
    onChange(autoUpper ? raw.toUpperCase() : raw);
    search(raw);
  };

  const pick = (r) => {
    dismiss();
    onChange(r.symbol);
    if (onSelect) onSelect(r.symbol, r);
  };

  const { onKeyDown: externalKeyDown, onFocus: externalFocus, onBlur: externalBlur, ...restInputProps } = inputProps;
  const expanded = open && results.length > 0;

  const onKeyDown = (e) => {
    if (e.key === 'Escape') {
      // The first Escape dismisses suggestions; with no suggestions visible,
      // leave the native dialog cancel action available to the parent search.
      if (expanded) {
        e.preventDefault();
        e.stopPropagation();
      }
      dismiss();
      if (!expanded) externalKeyDown?.(e);
      return;
    }
    if (open && results.length) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setHi((h) => Math.min(h + 1, results.length - 1)); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); setHi((h) => Math.max(h - 1, 0)); return; }
      if (e.key === 'Enter' && hi >= 0) { e.preventDefault(); pick(results[hi]); return; }
    }
    // Not handled by the dropdown — let the page's own handler run
    // (e.g. Chart's Enter-to-fetch).
    if (externalKeyDown) externalKeyDown(e);
  };

  return (
    <div className="tsearch" ref={boxRef}>
      <input
        type="text"
        value={value}
        onChange={handleChange}
        onKeyDown={onKeyDown}
        onFocus={(e) => { e.target.select(); externalFocus?.(e); }}
        onBlur={(e) => { dismiss(); externalBlur?.(e); }}
        placeholder={placeholder}
        style={inputStyle}
        autoComplete="off"
        spellCheck={false}
        {...restInputProps}
        role="combobox"
        aria-label={restInputProps['aria-label'] || 'Stock symbol or company name'}
        aria-autocomplete="list"
        aria-expanded={expanded}
        aria-controls={expanded ? listId : undefined}
        aria-activedescendant={expanded && hi >= 0 ? `${listId}-${hi}` : undefined}
      />
      {expanded && (
        <ul id={listId} className="tsearch-list" role="listbox" aria-label="Matching stocks">
          {results.map((r, i) => (
            <li
              key={r.symbol}
              id={`${listId}-${i}`}
              className={`tsearch-item ${i === hi ? 'hi' : ''}`}
              onMouseDown={(e) => { e.preventDefault(); pick(r); }}
              onMouseEnter={() => setHi(i)}
              role="option"
              aria-selected={i === hi}
            >
              <span className="tsearch-sym">{r.symbol}</span>
              <span className="tsearch-name">{r.name}</span>
              <span className="tsearch-exch">{r.exchange}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default TickerSearch;
