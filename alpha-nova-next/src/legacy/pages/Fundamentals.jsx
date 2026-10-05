import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Link } from 'react-router-dom';
import { apiClient } from '../lib/apiClient';
import LazyMarkdown from '../components/LazyMarkdown';
import { PageHeader } from '../components/ui';
import TickerSearch from '../components/TickerSearch';
import useAutoAiInsight from '../lib/useAutoAiInsight';
import { number, formatStamp } from '../../lib/market';
import { useMarket } from '../MarketContext';
import { FUNDAMENTALS_GUIDE } from '../../fundamentalsContent';

// Preserve missing provider values; Number(null) would fabricate a zero.
// eslint-disable-next-line react-refresh/only-export-components
export const formatFundamentalValue = (value, suffix = '') => {
  const parsed = number(value);
  return parsed === null ? 'N/A' : `${parsed.toFixed(2)}${suffix}`;
};

const currencyFor = (ticker) => {
  const t = (ticker || '').toUpperCase();
  return t.endsWith('.NS') || t.endsWith('.BO') ? '₹' : '$';
};

const Fundamentals = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const { market } = useMarket();
  const requestedSymbol = searchParams.get('symbol') || (market === 'US' ? 'AAPL' : 'RELIANCE.NS');
  const [ticker, setTicker] = useState(requestedSymbol);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // AI State
  const [aiLoading, setAiLoading] = useState(false);
  const [aiReport, setAiReport] = useState(null);

  const requestRef = useRef(0);
  const controllerRef = useRef(null);
  const fetchFundamentals = useCallback(async (sym) => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    const requestId = ++requestRef.current;
    const timer = window.setTimeout(() => controller.abort(), 90000);
    setLoading(true);
    setError(null);
    setData(null);
    setAiReport(null);
    setAiLoading(false);
    try {
      const response = await apiClient.get(`/api/fundamentals/${encodeURIComponent(sym)}`, { signal: controller.signal });
      if (requestId !== requestRef.current) return;
      if (!response.data?.ticker) throw new Error('The provider did not return company fundamentals. Please retry.');
      setData(response.data);
    } catch (err) {
      if (requestId === requestRef.current) setError(controller.signal.aborted ? 'Company data took too long to load. Please retry.' : err.message);
    } finally {
      window.clearTimeout(timer);
      if (requestId === requestRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const sym = requestedSymbol.trim().toUpperCase();
    setTicker(sym);
    void fetchFundamentals(sym);
    return () => { ++requestRef.current; controllerRef.current?.abort(); };
  }, [requestedSymbol, fetchFundamentals]);

  const loadCompany = (e, overrideTicker) => {
    e?.preventDefault();
    let sym = (overrideTicker || ticker || '').trim().toUpperCase();
    if (!sym) return;
    if (market === 'IN' && !sym.includes('.') && !sym.startsWith('^')) sym += '.NS';
    setTicker(sym);
    const params = new URLSearchParams(searchParams);
    params.set('symbol', sym);
    params.set('market', /\.(NS|BO)$/.test(sym) ? 'IN' : 'US');
    setSearchParams(params, { replace: true });
    if (sym === requestedSymbol) void fetchFundamentals(sym);
  };

  const runAiAnalysis = async () => {
    if (!data) return;
    const requestId = requestRef.current;
    const apiKey = localStorage.getItem('gemini_api_key');
    if (!apiKey) {
      setAiReport('**Add your Gemini API key in Settings to generate the fundamentals brief.**');
      return;
    }

    setAiLoading(true);
    try {
      const response = await apiClient.post('/api/ai/fundamentals', {
        ticker: data.ticker,
        apiKey: apiKey,
        fundamentals_data: JSON.stringify(data, null, 2)
      });
      if (requestId === requestRef.current) setAiReport(response.data.report);
    } catch (err) {
      if (requestId === requestRef.current) setAiReport(`**Error generating analysis:** ${err.message}`);
    } finally {
      if (requestId === requestRef.current) setAiLoading(false);
    }
  };

  // With a saved Gemini key, the AI report generates itself once per loaded
  // company — no click needed on first run.
  useAutoAiInsight(data && !data.error ? data : null, runAiAnalysis);

  return (
    <div className="page fade-in">
      <PageHeader
        code="FA"
        title="Company Fundamentals"
        subtitle="Deep-dive into valuation, profitability, and balance sheet metrics."
        right={data && !loading && (
          <button
            onClick={runAiAnalysis}
            disabled={aiLoading}
            style={{
              width: 'auto',
              background: 'linear-gradient(90deg, rgba(62, 230, 255, 0.2), rgba(62, 230, 255, 0.1))',
              border: '1px solid rgba(62, 230, 255, 0.4)',
              color: 'var(--primary-accent)',
              padding: '10px 20px',
              borderRadius: 'var(--r-pill)'
            }}
          >
            {aiLoading ? <><span className="spinner" style={{borderColor: 'rgba(62, 230, 255, 0.2)', borderTopColor: 'var(--primary-accent)', marginRight: '8px'}}></span> Analyzing...</> : 'Gemini AI Analysis'}
          </button>
        )}
      />

      <div className="panel" style={{ marginBottom: '20px' }}>
        <form onSubmit={loadCompany} className="fundamentals-search" style={{ display: 'flex', gap: '10px' }}>
          <TickerSearch
            value={ticker}
            onChange={setTicker}
            onSelect={(sym) => loadCompany(null, sym)}
            placeholder="Ticker or company name (e.g. Asian Paints, AAPL)"
          />
          <button type="submit" className="btn" disabled={loading} style={{ width: 'auto', padding: '12px 24px' }}>
            {loading ? 'Fetching...' : 'Fetch Fundamentals'}
          </button>
        </form>
        <div className="fundamentals-shortcuts" aria-label="Popular companies">
          {(market === 'US' ? ['AAPL', 'MSFT', 'NVDA'] : ['RELIANCE.NS', 'TCS.NS', 'HDFCBANK.NS']).map(sym => <button key={sym} type="button" onClick={() => loadCompany(null, sym)} aria-pressed={data?.ticker === sym}>{sym.replace('.NS', '')}</button>)}
        </div>
        {loading && <p role="status" style={{ marginTop: '12px', color: 'var(--text-secondary)' }}>Loading company data. The first request may take longer while the provider connects.</p>}
      </div>

      {loading && (
        <div className="fundamentals-grid">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="panel">
              <div className="skeleton skeleton-header" style={{ width: '50%' }}></div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
                <div className="skeleton skeleton-row"></div>
                <div className="skeleton skeleton-row"></div>
                <div className="skeleton skeleton-row"></div>
                <div className="skeleton skeleton-row"></div>
              </div>
            </div>
          ))}
        </div>
      )}

      {error && !loading && (
        <div className="error" style={{ color: 'var(--red-loss)', padding: '20px', backgroundColor: 'rgba(255, 69, 58, 0.1)', border: '1px solid rgba(255, 69, 58, 0.2)', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
          <div>
            <h3 style={{ marginBottom: '8px', fontSize: '16px', color: 'var(--red-loss)' }}>Analysis Failed</h3>
            <p style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>{error}</p>
          </div>
          <button onClick={() => fetchFundamentals(requestedSymbol)} style={{ width: 'auto', padding: '8px 16px', background: 'rgba(255, 69, 58, 0.15)', border: '1px solid var(--red-loss)', color: 'var(--red-loss)' }}>Retry</button>
        </div>
      )}

      {aiReport && (
        <div className="ai-insight fade-in" style={{ marginBottom: '20px', background: 'linear-gradient(135deg, rgba(62, 230, 255, 0.05) 0%, rgba(0, 0, 0, 0) 100%)', border: '1px solid rgba(62, 230, 255, 0.2)' }}>
          <h3 style={{ color: 'var(--primary-accent)' }}>Fundamental AI Report</h3>
          <div className="ai-insight-content">
            <LazyMarkdown>{aiReport}</LazyMarkdown>
          </div>
        </div>
      )}

      {data && !loading && <div className="panel fundamentals-provenance" role="status">
        <strong>{data.dataQuality?.provider || 'Yahoo Finance'} · Retrieved {formatStamp(data.dataQuality?.retrievedAt)}</strong>
        <p>Quote metrics may use different reporting periods. Missing figures stay N/A.</p>
        {!!Object.keys(data.dataQuality?.fieldPeriods || {}).length && <details><summary>Annual statement fields · {[...new Set(Object.values(data.dataQuality.fieldPeriods))].map(formatStamp).join(', ')}</summary>{Object.entries(data.dataQuality.fieldPeriods).map(([field, period]) => <p key={field}>{({returnOnEquity:'ROE', returnOnAssets:'ROA', currentRatio:'Current ratio', freeCashflow:'Free cash flow'})[field] || field}: annual · {formatStamp(period)}. {data.dataQuality?.fieldMethods?.[field]}</p>)}</details>}
        {!!data.dataQuality?.missingFields?.length && <p>{data.dataQuality.missingFields.length} fields unavailable from the provider.</p>}
        <Link to={`/chart?symbol=${encodeURIComponent(data.ticker)}&market=${/\.(NS|BO)$/.test(data.ticker) ? 'IN' : 'US'}`}>Open {data.ticker} chart →</Link>
      </div>}
      {data && !loading && (
        <div className="fundamentals-grid fade-in">
          <div className="panel">
            <h3 style={{ color: 'var(--primary-gold)', marginBottom: '5px' }}>{data.name} ({data.ticker})</h3>
            <p style={{ color: 'var(--text-secondary)', marginBottom: '20px' }}>{[data.sector, data.industry].filter(Boolean).join(' · ') || 'Classification unavailable'}</p>
            
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '15px' }}>
              <div>
                <div style={{ color: 'var(--text-secondary)', fontSize: '0.85em' }}>Market Cap</div>
                <div style={{ fontSize: '1.2em', fontWeight: 'bold' }}>
                  {data.marketCap ? `${currencyFor(data.ticker)}${(data.marketCap / 1e9).toFixed(2)}B` : 'N/A'}
                </div>
              </div>
              <div>
                <div style={{ color: 'var(--text-secondary)', fontSize: '0.85em' }}>Total Cash</div>
                <div style={{ fontSize: '1.2em', fontWeight: 'bold' }}>
                  {number(data.totalCash) !== null ? `${currencyFor(data.ticker)}${(data.totalCash / 1e9).toFixed(2)}B` : 'N/A'}
                </div>
              </div>
              <div>
                <div style={{ color: 'var(--text-secondary)', fontSize: '0.85em' }}>Alpha Nova Score</div>
                <div style={{ fontSize: '1.2em', fontWeight: 'bold', color: 'var(--primary-gold)' }}>
                  {data.alphaScore !== undefined && data.alphaScore !== null ? data.alphaScore : 'N/A'}
                </div>
              </div>
            </div>
          </div>

          <div className="panel">
            <h3 style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '10px', marginBottom: '15px' }}>Valuation Metrics</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
              <div>
                <div style={{ color: 'var(--text-secondary)', fontSize: '0.85em' }}>Trailing P/E</div>
                <div style={{ fontWeight: 'bold' }}>{formatFundamentalValue(data.trailingPE)}</div>
              </div>
              <div>
                <div style={{ color: 'var(--text-secondary)', fontSize: '0.85em' }}>Forward P/E</div>
                <div style={{ fontWeight: 'bold' }}>{formatFundamentalValue(data.forwardPE)}</div>
              </div>
              <div>
                <div style={{ color: 'var(--text-secondary)', fontSize: '0.85em' }}>PEG Ratio</div>
                <div style={{ fontWeight: 'bold' }}>{formatFundamentalValue(data.pegRatio)}</div>
              </div>
              <div>
                <div style={{ color: 'var(--text-secondary)', fontSize: '0.85em' }}>Price to Book</div>
                <div style={{ fontWeight: 'bold' }}>{formatFundamentalValue(data.priceToBook)}</div>
              </div>
            </div>
          </div>

          <div className="panel">
            <h3 style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '10px', marginBottom: '15px' }}>Profitability</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
              <div>
                <div style={{ color: 'var(--text-secondary)', fontSize: '0.85em' }}>Profit Margin</div>
                <div style={{ fontWeight: 'bold' }}>{formatFundamentalValue(data.profitMargin, '%')}</div>
              </div>
              <div>
                <div style={{ color: 'var(--text-secondary)', fontSize: '0.85em' }}>Operating Margin</div>
                <div style={{ fontWeight: 'bold' }}>{formatFundamentalValue(data.operatingMargin, '%')}</div>
              </div>
              <div>
                <div style={{ color: 'var(--text-secondary)', fontSize: '0.85em' }}>Return on Equity</div>
                <div style={{ fontWeight: 'bold' }}>{formatFundamentalValue(data.returnOnEquity, '%')}</div>
              </div>
              <div>
                <div style={{ color: 'var(--text-secondary)', fontSize: '0.85em' }}>Return on Assets</div>
                <div style={{ fontWeight: 'bold' }}>{formatFundamentalValue(data.returnOnAssets, '%')}</div>
              </div>
            </div>
          </div>

          <div className="panel">
            <h3 style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '10px', marginBottom: '15px' }}>Financial Health & Growth</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
              <div>
                <div style={{ color: 'var(--text-secondary)', fontSize: '0.85em' }}>Debt to Equity</div>
                <div style={{ fontWeight: 'bold' }}>{formatFundamentalValue(data.debtToEquity, '%')}</div>
              </div>
              <div>
                <div style={{ color: 'var(--text-secondary)', fontSize: '0.85em' }}>Current Ratio</div>
                <div style={{ fontWeight: 'bold' }}>{formatFundamentalValue(data.currentRatio)}</div>
              </div>
              <div>
                <div style={{ color: 'var(--text-secondary)', fontSize: '0.85em' }}>Revenue Growth</div>
                <div style={{ fontWeight: 'bold' }}>{formatFundamentalValue(data.revenueGrowth, '%')}</div>
              </div>
              <div>
                <div style={{ color: 'var(--text-secondary)', fontSize: '0.85em' }}>Earnings Growth</div>
                <div style={{ fontWeight: 'bold' }}>{formatFundamentalValue(data.earningsGrowth, '%')}</div>
              </div>
              <div>
                <div style={{ color: 'var(--text-secondary)', fontSize: '0.85em' }}>Free Cash Flow</div>
                <div style={{ fontWeight: 'bold' }}>{number(data.freeCashflow) !== null ? `${currencyFor(data.ticker)}${(data.freeCashflow / 1e9).toFixed(2)}B` : 'N/A'}</div>
              </div>
            </div>
          </div>
        </div>
      )}
      
      <details className="panel fundamentals-guide"><summary>Understand these metrics and data sources</summary><div dangerouslySetInnerHTML={{__html: FUNDAMENTALS_GUIDE}} /></details>
      <style dangerouslySetInnerHTML={{__html: `
        .fundamentals-shortcuts { display:flex; flex-wrap:wrap; gap:8px; margin-top:12px; }
        .fundamentals-shortcuts button { width:auto; padding:8px 12px; font-size:13px; }
        .fundamentals-provenance { margin-bottom:20px; font-size:13px; }
        .fundamentals-provenance p { margin:8px 0; color:var(--text-secondary); }
        .fundamentals-guide { margin-top:20px; line-height:1.7; }
        .fundamentals-guide h2 { font-size:18px; margin:12px 0; }
        .fundamentals-guide summary, .fundamentals-provenance summary { cursor:pointer; padding:8px 0; }
        .fundamentals-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 20px;
        }
        @media (max-width: 768px) {
          .fundamentals-search { flex-wrap:wrap; }
          .fundamentals-search .tsearch { min-width:0; flex-basis:100%; }
          .fundamentals-search .btn { width:100% !important; }
          .fundamentals-grid {
            grid-template-columns: 1fr;
          }
        }
      `}} />
    </div>
  );
};

export default Fundamentals;
