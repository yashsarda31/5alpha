import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import axios from 'axios';
import { PageHeader, Badge } from '../components/ui';
import TickerSearch from '../components/TickerSearch';

const sentimentTone = (label) =>
  label === 'Bullish' ? 'gain' : label === 'Bearish' ? 'loss' : 'neutral';

// Per-source identity so the reader can see the feed is genuinely aggregated.
const PROVIDER_META = {
  'Yahoo Finance': { color: '#A78BFA', short: 'Yahoo' },
  'Google News': { color: '#3EE6FF', short: 'Google' },
  NewsAPI: { color: '#F5DC8C', short: 'NewsAPI' },
  'Investing.com': { color: '#FF9F45', short: 'Investing' },
};
const providerColor = (p) => (PROVIDER_META[p] || {}).color || 'var(--text-secondary)';

const SentimentBadge = ({ sentiment }) => {
  if (!sentiment) return null;
  const arrow = sentiment.label === 'Bullish' ? '▲' : sentiment.label === 'Bearish' ? '▼' : '—';
  return <Badge tone={sentimentTone(sentiment.label)}>{arrow} {sentiment.score}</Badge>;
};

const ProviderTag = ({ provider }) => (
  <span style={{
    fontSize: '10px', fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase',
    padding: '2px 7px', borderRadius: '5px', whiteSpace: 'nowrap',
    color: providerColor(provider), background: `${providerColor(provider)}1f`,
    border: `1px solid ${providerColor(provider)}44`,
  }}>{provider}</span>
);

const News = () => {
  const [searchParams] = useSearchParams();
  const [ticker, setTicker] = useState(() => searchParams.get('symbol') || 'RELIANCE');
  const [newsApiKey, setNewsApiKey] = useState(() => localStorage.getItem('news_api_key') || '');
  const [news, setNews] = useState([]);
  const [sentiment, setSentiment] = useState(null);
  const [sources, setSources] = useState([]);
  const [query, setQuery] = useState('');
  const [activeSource, setActiveSource] = useState('All');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [searched, setSearched] = useState(false);

  const persistKey = (v) => { setNewsApiKey(v); localStorage.setItem('news_api_key', v); };

  const fetchNews = async (e, overrideTicker) => {
    if (e) e.preventDefault();
    const sym = (overrideTicker || ticker || '').trim();
    if (!sym) return;
    setLoading(true);
    setError(null);
    setActiveSource('All');
    try {
      const url = newsApiKey
        ? `/api/news/${sym.toUpperCase()}?apiKey=${encodeURIComponent(newsApiKey)}`
        : `/api/news/${sym.toUpperCase()}`;
      const { data } = await axios.get(url);
      setNews(data.articles || []);
      setSentiment(data.sentiment_summary || null);
      setSources(data.sources || []);
      setQuery(data.query || '');
    } catch (err) {
      setError(err.response?.data?.detail || err.message);
      setNews([]); setSentiment(null); setSources([]);
    } finally {
      setLoading(false);
      setSearched(true);
    }
  };

  // Load a feed on arrival — the page shouldn't open empty. A ?symbol= link
  // (e.g. a watchlist row's News action) wins over the default ticker, and
  // in-app navigations that change the param re-fetch for the new symbol.
  const autoFetched = useRef(false);
  const lastParamSym = useRef(null);
  useEffect(() => {
    const sym = searchParams.get('symbol');
    if (sym && sym !== lastParamSym.current) {
      lastParamSym.current = sym;
      autoFetched.current = true;
      setTicker(sym);
      fetchNews(null, sym);
    }
  }, [searchParams]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (autoFetched.current || searchParams.get('symbol')) return;
    autoFetched.current = true;
    fetchNews();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Count per source for the filter chips, and apply the active filter.
  const counts = useMemo(() => {
    const c = {};
    news.forEach((a) => { c[a.provider] = (c[a.provider] || 0) + 1; });
    return c;
  }, [news]);
  const visible = activeSource === 'All' ? news : news.filter((a) => a.provider === activeSource);

  return (
    <div className="page">
      <PageHeader code="NEWS" title="Latest News"
        subtitle="Aggregated from Yahoo Finance, Google News, Investing.com & NewsAPI — ranked by relevance." />

      <div className="panel" style={{ marginBottom: '20px' }}>
        <form onSubmit={fetchNews} style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
          <div style={{ display: 'flex', gap: '10px' }}>
            <TickerSearch
              value={ticker}
              onChange={setTicker}
              onSelect={(sym) => fetchNews(null, sym)}
              placeholder="Ticker or company name (e.g. Tata Motors, AAPL)"
            />
            <button type="submit" className="btn" disabled={loading} style={{ width: 'auto', padding: '12px 24px' }}>
              {loading ? 'Fetching...' : 'Get News'}
            </button>
          </div>
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            <input
              type="password"
              value={newsApiKey}
              onChange={(e) => persistKey(e.target.value)}
              placeholder="NewsAPI key (optional — adds one more source)"
              style={{ flex: 1, marginBottom: 0, fontSize: '0.9em', padding: '10px' }}
            />
            <small style={{ color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
              Works without a key. Optional key at{' '}
              <a href="https://newsapi.org" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--primary-gold)' }}>newsapi.org</a>
            </small>
          </div>
        </form>
      </div>

      {error && (
        <div className="error" style={{ color: 'var(--red-loss)', padding: '20px', backgroundColor: 'rgba(255,69,58,0.1)', borderRadius: '8px' }}>
          <strong>Error:</strong> {error}
        </div>
      )}

      {!loading && sentiment && (
        <div className="panel" style={{ marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '24px', flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.2em', color: 'var(--text-secondary)', marginBottom: '4px' }}>
              NEWS SENTIMENT · {news.length} ARTICLES{query ? ` · ${query.toUpperCase()}` : ''}
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '12px' }}>
              <span className={`tone-${sentimentTone(sentiment.label)}`} style={{ fontSize: '34px', fontWeight: 800 }}>
                {sentiment.score}
              </span>
              <span style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>/ 100</span>
              <Badge tone={sentimentTone(sentiment.label)}>{sentiment.label.toUpperCase()}</Badge>
            </div>
          </div>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: '16px', fontSize: '14px', fontFamily: 'var(--font-mono, monospace)' }}>
            <span className="tone-gain">{sentiment.positive} ▲</span>
            <span style={{ color: 'var(--text-secondary)' }}>{sentiment.neutral} —</span>
            <span className="tone-loss">{sentiment.negative} ▼</span>
          </div>
        </div>
      )}

      {/* Source filter chips — proof the feed is aggregated, and a way to narrow it */}
      {!loading && news.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '18px', alignItems: 'center' }}>
          <span style={{ fontSize: '11px', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.08em', marginRight: '2px' }}>Sources</span>
          {['All', ...sources].map((s) => {
            const active = activeSource === s;
            const col = s === 'All' ? 'var(--primary-gold)' : providerColor(s);
            const n = s === 'All' ? news.length : counts[s] || 0;
            return (
              <button key={s} onClick={() => setActiveSource(s)}
                style={{
                  width: 'auto', flex: '0 0 auto', cursor: 'pointer', fontSize: '12px', fontWeight: 600,
                  padding: '5px 11px', borderRadius: '8px',
                  color: active ? '#000' : col, background: active ? col : `${col}14`,
                  border: `1px solid ${col}${active ? '' : '44'}`,
                }}>
                {s} <span style={{ opacity: 0.75 }}>{n}</span>
              </button>
            );
          })}
        </div>
      )}

      {!loading && searched && news.length === 0 && !error && (
        <div style={{ color: 'var(--text-secondary)', textAlign: 'center', padding: '40px' }}>
          No news articles found. Try a different ticker or company name.
        </div>
      )}

      {loading && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
          {[1, 2, 3].map((_, i) => (
            <div key={i} className="panel" style={{ padding: '20px' }}>
              <div className="skeleton skeleton-row" style={{ width: '60%', marginBottom: '15px', height: '24px' }}></div>
              <div className="skeleton skeleton-row" style={{ width: '30%', marginBottom: '15px', height: '16px' }}></div>
              <div className="skeleton skeleton-row" style={{ width: '100%', marginBottom: '8px' }}></div>
              <div className="skeleton skeleton-row" style={{ width: '80%' }}></div>
            </div>
          ))}
        </div>
      )}

      {!loading && visible.length > 0 && (
        <div className="news-feed" style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
          {visible.map((article, index) => (
            <div key={index} className="panel" style={{ padding: '20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', marginBottom: '10px' }}>
                <h3 style={{ margin: 0, fontSize: '1.2em' }}>
                  <a href={article.url} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--text-primary)', textDecoration: 'none' }}>
                    {article.title}
                  </a>
                </h3>
                <ProviderTag provider={article.provider} />
              </div>

              <div style={{ color: 'var(--text-secondary)', fontSize: '0.85em', marginBottom: '10px', display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
                <span><strong style={{ color: 'var(--primary-gold)' }}>{article.source?.name}</strong></span>
                {article.publishedAt && (<><span>•</span><span>{new Date(article.publishedAt).toLocaleString()}</span></>)}
                <SentimentBadge sentiment={article.sentiment} />
              </div>

              {article.description && (
                <p style={{ color: 'var(--text-secondary)', lineHeight: '1.5', margin: 0 }}>
                  {article.description}
                </p>
              )}

              <div style={{ marginTop: '15px' }}>
                <a href={article.url} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--primary-gold)', textDecoration: 'none', fontWeight: 'bold', fontSize: '0.9em' }}>
                  Read Full Article →
                </a>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default News;
