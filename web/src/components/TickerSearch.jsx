import React, { useState, useEffect, useRef } from 'react';
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
  const [results, setResults] = useState([]);
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(-1);
  const boxRef = useRef(null);
  const debounceRef = useRef(null);
  const lastQ = useRef('');

  useEffect(() => {
    const onDoc = (e) => { if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    return () => { document.removeEventListener('mousedown', onDoc); clearTimeout(debounceRef.current); };
  }, []);

  const search = (q) => {
    lastQ.current = q;
    const trimmed = q.trim();
    if (trimmed.length < 2) { setResults([]); setOpen(false); return; }
    if (queryCache.has(trimmed)) {
      setResults(queryCache.get(trimmed)); setOpen(true); setHi(-1);
      return;
    }
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      try {
        const r = await fetch(`/api/symbol-search?q=${encodeURIComponent(trimmed)}`);
        const j = await r.json();
        queryCache.set(trimmed, j.results || []);
        if (lastQ.current === q) { setResults(j.results || []); setOpen(true); setHi(-1); }
      } catch { /* no dropdown on failure — typing still works as before */ }
    }, 250);
  };

  const handleChange = (e) => {
    const raw = e.target.value;
    onChange(autoUpper ? raw.toUpperCase() : raw);
    search(raw);
  };

  const pick = (r) => {
    setOpen(false);
    setResults([]);
    onChange(r.symbol);
    if (onSelect) onSelect(r.symbol, r);
  };

  const { onKeyDown: externalKeyDown, ...restInputProps } = inputProps;

  const onKeyDown = (e) => {
    if (open && results.length) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setHi((h) => Math.min(h + 1, results.length - 1)); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); setHi((h) => Math.max(h - 1, 0)); return; }
      if (e.key === 'Enter' && hi >= 0) { e.preventDefault(); pick(results[hi]); return; }
      if (e.key === 'Escape') { setOpen(false); return; }
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
        onFocus={(e) => { e.target.select(); if (results.length) setOpen(true); }}
        placeholder={placeholder}
        style={inputStyle}
        autoComplete="off"
        spellCheck={false}
        {...restInputProps}
      />
      {open && results.length > 0 && (
        <ul className="tsearch-list" role="listbox">
          {results.map((r, i) => (
            <li
              key={r.symbol}
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
