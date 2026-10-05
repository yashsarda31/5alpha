import React, { useState, StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { useResource } from '../src/lib/useResource';
import { Loading } from '../src/components/ui';
import ConnectionStatus from '../src/components/ConnectionStatus';
import { MarketProvider, useMarket } from '../src/legacy/MarketContext';
import TickerSearch from '../src/legacy/components/TickerSearch';
import '../src/styles.css';
function Reader({ label, url }: { label: string; url: string }) {
  const resource = useResource<{ request: number; market: string }>(url);
  return <section aria-label={label}><h2>{label}</h2><pre>{JSON.stringify(resource.data)}</pre>{resource.loading && <Loading/>}{resource.error && <p role="alert">{resource.error}</p>}<button onClick={resource.refresh}>Retry {label}</button></section>;
}
function Fixture() {
  const [url, setUrl] = useState('/api/dashboard?market=IN');
  const [show, setShow] = useState(true);
  const [query, setQuery] = useState('');
  const { market, setMarket } = useMarket();
  return <main style={{ padding: 24 }}><ConnectionStatus/><h1>Research recovery verification</h1>
    <button onClick={() => setShow(!show)}>Toggle readers</button>
    <button onClick={() => setUrl('/api/dashboard?market=US')}>US data</button>
    <button onClick={() => setUrl('/api/dashboard?market=FAIL')}>Failed data</button>
    <button onClick={() => setUrl('/api/dashboard?market=SLOW')}>Slow data</button>
    <button onClick={() => setUrl('/api/dashboard?market=IN')}>India data</button>
    {show && <><Reader label="First" url={url}/><Reader label="Second" url={url}/></>}
    <button onClick={() => setMarket(market === 'IN' ? 'US' : 'IN')}>Switch search market ({market})</button>
    <TickerSearch value={query} onChange={setQuery} onSelect={symbol => setQuery(symbol)}/>
  </main>;
}
createRoot(document.getElementById('root')!).render(<StrictMode><BrowserRouter><MarketProvider><Fixture/></MarketProvider></BrowserRouter></StrictMode>);
