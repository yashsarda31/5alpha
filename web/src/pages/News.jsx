import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { PageHeader } from '../components/ui';

const News = () => {
  const [ticker, setTicker] = useState('AAPL');
  const [newsApiKey, setNewsApiKey] = useState(() => localStorage.getItem('news_api_key') || '');
  const [news, setNews] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    localStorage.setItem('news_api_key', newsApiKey);
  }, [newsApiKey]);

  const fetchNews = async (e) => {
    if (e) e.preventDefault();
    if (!ticker) return;

    setLoading(true);
    setError(null);
    try {
      const url = newsApiKey 
        ? `/api/news/${ticker.toUpperCase()}?apiKey=${newsApiKey}`
        : `/api/news/${ticker.toUpperCase()}`;
        
      const response = await axios.get(url);
      setNews(response.data.articles || []);
    } catch (err) {
      const errorMsg = err.response?.data?.detail || err.message;
      setError(errorMsg);
      setNews([]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="page">
      <PageHeader code="NEWS" title="Latest News" subtitle="Recent headlines and articles for specific tickers." />

      <div className="panel" style={{ marginBottom: '20px' }}>
        <form onSubmit={fetchNews} style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
          <div style={{ display: 'flex', gap: '10px' }}>
            <input 
              type="text" 
              value={ticker} 
              onChange={(e) => setTicker(e.target.value)} 
              placeholder="Enter Ticker (e.g. AAPL, TSLA)"
              style={{ flex: 1, marginBottom: 0 }}
            />
            <button type="submit" className="btn" disabled={loading} style={{ width: 'auto', padding: '12px 24px' }}>
              {loading ? 'Fetching...' : 'Get News'}
            </button>
          </div>
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            <input 
              type="password" 
              value={newsApiKey} 
              onChange={(e) => setNewsApiKey(e.target.value)} 
              placeholder="Enter NewsAPI Key (Optional if configured on server)"
              style={{ flex: 1, marginBottom: 0, fontSize: '0.9em', padding: '10px' }}
            />
            <small style={{ color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
              Get a key at <a href="https://newsapi.org" target="_blank" rel="noopener noreferrer" style={{color: 'var(--primary-gold)'}}>newsapi.org</a>
            </small>
          </div>
        </form>
      </div>

      {error && (
        <div className="error" style={{ color: 'var(--accent-red)', padding: '20px', backgroundColor: 'rgba(239, 68, 68, 0.1)', borderRadius: '8px' }}>
          <strong>Error:</strong> {error}
        </div>
      )}

      {!loading && news.length === 0 && !error && (
        <div style={{ color: 'var(--text-secondary)', textAlign: 'center', padding: '40px' }}>
          No news articles to display. Enter a ticker and search.
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

      {!loading && news.length > 0 && (
        <div className="news-feed" style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
          {news.map((article, index) => (
            <div key={index} className="panel" style={{ padding: '20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '10px' }}>
                <h3 style={{ margin: 0, fontSize: '1.2em' }}>
                  <a href={article.url} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--text-primary)', textDecoration: 'none' }}>
                    {article.title}
                  </a>
                </h3>
              </div>
              
              <div style={{ color: 'var(--text-secondary)', fontSize: '0.85em', marginBottom: '10px', display: 'flex', gap: '15px' }}>
                <span><strong style={{color: 'var(--primary-gold)'}}>{article.source?.name}</strong></span>
                <span>•</span>
                <span>{new Date(article.publishedAt).toLocaleString()}</span>
              </div>
              
              <p style={{ color: 'var(--text-secondary)', lineHeight: '1.5', margin: 0 }}>
                {article.description}
              </p>
              
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
