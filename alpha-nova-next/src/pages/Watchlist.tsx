import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ArrowDownUp, Plus, RefreshCw, Search, Trash2 } from 'lucide-react';
import { useAuth } from '../legacy/AuthContext';
import { useWatchlist } from '../legacy/WatchlistContext';
import { authState, watchlistIntent } from '../legacy/lib/authIntent';
import { watchlistChartSymbol } from '../legacy/lib/chartTechnicalSignal';
import { useWatchlistChartSignals } from '../legacy/lib/useWatchlistChartSignals';
import { Change, EmptyState, ErrorState, Loading, PageHeading, Panel } from '../components/ui';
import { formatPrice, formatStamp, symbolPath } from '../lib/market';
import { useResource } from '../lib/useResource';
import WatchlistResearch from './WatchlistResearch';
import './Watchlist.css';

type Market = 'IN' | 'US';

interface WatchlistItem {
  symbol: string;
  market?: Market;
  added_at?: string;
  sort_order?: number | null;
}

interface Quote {
  symbol: string;
  last?: number | null;
  change_pct?: number | null;
  day_low?: number | null;
  day_high?: number | null;
  as_of?: string | null;
  source?: string | null;
}

interface QuoteResponse {
  quotes?: Quote[];
  market_open?: boolean | null;
  as_of?: string | null;
  source?: string | null;
}

type SortKey = 'saved' | 'symbol' | 'change' | 'price';

const marketLabel = (market: Market) => market === 'US' ? 'US' : 'NSE';
export default function Watchlist() {
  const { currentUser } = useAuth() as { currentUser: { uid?: string | number } | null };
  const watchlist = useWatchlist() as {
    items: WatchlistItem[];
    loading: boolean;
    error: string | null;
    loadError: string | null;
    add: (symbol: string, market: Market) => Promise<void>;
    remove: (symbol: string) => Promise<void>;
    reload: () => Promise<void>;
    clearError: () => void;
  };
  const navigate = useNavigate();
  const location = useLocation();
  const [symbol, setSymbol] = useState('');
  const [market, setMarket] = useState<Market>('IN');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<SortKey>('saved');
  const [busySymbol, setBusySymbol] = useState<string | null>(null);
  const [signalRefreshVersion, setSignalRefreshVersion] = useState(0);
  const accountKey = currentUser?.uid == null ? 'signed-in' : String(currentUser.uid);
  const symbolKey = watchlist.items.map((item) => `${item.symbol}:${item.market || 'IN'}`).join(',');
  // The harmless account query keeps useResource data isolated when accounts
  // change. Symbol edits refresh the stable account resource while preserving
  // the last successful snapshot until the replacement arrives.
  const quoteUrl = currentUser && watchlist.items.length
    ? `/api/watchlist/quotes?account=${encodeURIComponent(accountKey)}`
    : null;
  const quotes = useResource<QuoteResponse>(quoteUrl, 120_000);
  const chartSignals = useWatchlistChartSignals(currentUser ? watchlist.items : [], signalRefreshVersion) as Record<string, { signal: string; asOf: string | null }>;
  const previousSymbols = useRef(symbolKey);
  const refreshQuotes = quotes.refresh;

  useEffect(() => {
    setQuery('');
  }, [accountKey]);

  useEffect(() => {
    if (previousSymbols.current !== symbolKey) {
      previousSymbols.current = symbolKey;
      if (quoteUrl) refreshQuotes();
    }
  }, [quoteUrl, refreshQuotes, symbolKey]);

  const quoteMap = useMemo(() => new Map(
    (quotes.data?.quotes ?? []).map((quote) => [quote.symbol.toUpperCase(), quote]),
  ), [quotes.data]);

  const rows = useMemo(() => {
    const needle = query.trim().toUpperCase();
    const indexed = watchlist.items.map((item, index) => ({
      item,
      index,
      quote: quoteMap.get(item.symbol.toUpperCase()),
    })).filter(({ item }) => !needle || item.symbol.toUpperCase().includes(needle));

    return indexed.sort((a, b) => {
      if (sort === 'saved') return a.index - b.index;
      if (sort === 'symbol') return a.item.symbol.localeCompare(b.item.symbol);
      const av = sort === 'price' ? a.quote?.last : a.quote?.change_pct;
      const bv = sort === 'price' ? b.quote?.last : b.quote?.change_pct;
      if (av == null) return 1;
      if (bv == null) return -1;
      return bv - av;
    });
  }, [query, quoteMap, sort, watchlist.items]);

  const requireAuth = (candidate: string, selectedMarket: Market) => {
    navigate('/login?mode=signup', {
      state: authState(location, watchlistIntent(candidate, selectedMarket)),
    });
  };

  const addSymbol = async (event: FormEvent) => {
    event.preventDefault();
    const candidate = symbol.trim().toUpperCase();
    if (!candidate) return;
    if (!currentUser) {
      requireAuth(candidate, market);
      return;
    }
    setBusySymbol(candidate);
    try {
      await watchlist.add(candidate, market);
      setSymbol('');
    } catch {
      // The context restores state and exposes the server error.
    } finally {
      setBusySymbol(null);
    }
  };

  const removeSymbol = async (candidate: string) => {
    setBusySymbol(candidate);
    try {
      await watchlist.remove(candidate);
    } catch {
      // The context restores the removed row and exposes the server error.
    } finally {
      setBusySymbol(null);
    }
  };

  const asOf = quotes.data?.as_of ?? quotes.data?.quotes?.find((quote) => quote.as_of)?.as_of;
  const source = quotes.data?.source ?? quotes.data?.quotes?.find((quote) => quote.source)?.source;
  const refresh = () => {
    quotes.refresh();
    setSignalRefreshVersion((version) => version + 1);
  };

  return (
    <div className="an-watchlist">
      <PageHeading
        eyebrow="Your market shortlist"
        title="Watchlist"
        description="The stocks you follow."
        actions={currentUser && watchlist.items.length ? (
          <button className="an-button" type="button" onClick={refresh} disabled={quotes.refreshing}>
            <RefreshCw size={15} aria-hidden="true" />
            {quotes.refreshing ? 'Refreshing' : 'Refresh quotes & signals'}
          </button>
        ) : undefined}
      />

      {!currentUser ? (
        <Panel className="an-watchlist__guest">
          <span className="an-kicker">One list, available whenever you return</span>
          <h2>Keep your research close.</h2>
          <p>Sign in to save NSE and US stocks in one list.</p>
          <button className="an-button an-button-primary" type="button" onClick={() => requireAuth(symbol.trim(), market)}>
            Sign in to build your watchlist
          </button>
        </Panel>
      ) : (
        <>
          <Panel title="Add a stock" subtitle="Search by ticker and choose a market.">
            <form className="an-watchlist__add" onSubmit={addSymbol}>
              <label className="an-watchlist__symbol-input">
                <span>Symbol</span>
                <input
                  className="an-input"
                  name="watchlist-symbol-add"
                  value={symbol}
                  onChange={(event) => { setSymbol(event.target.value.toUpperCase()); watchlist.clearError(); }}
                  placeholder={market === 'IN' ? 'RELIANCE' : 'AAPL'}
                  autoComplete="off"
                />
              </label>
              <fieldset className="an-watchlist__market">
                <legend>Market</legend>
                {(['IN', 'US'] as Market[]).map((value) => (
                  <button className={`an-chip ${market === value ? 'is-active' : ''}`} type="button" key={value} onClick={() => setMarket(value)} aria-pressed={market === value}>
                    {marketLabel(value)}
                  </button>
                ))}
              </fieldset>
              <button className="an-button an-button-primary" type="submit" disabled={!symbol.trim() || busySymbol !== null}>
                <Plus size={16} aria-hidden="true" /> Add symbol
              </button>
            </form>
            {watchlist.error && <p className="an-watchlist__mutation-error" role="alert">{watchlist.error}</p>}
          </Panel>

          {watchlist.loading ? <Loading label="Loading your watchlist" /> : watchlist.loadError ? (
            <ErrorState message={watchlist.loadError} retry={watchlist.reload} />
          ) : watchlist.items.length === 0 ? (
            <EmptyState
              title="Your watchlist is ready for its first stock"
              description="Add a ticker above. Saved symbols are research shortcuts, not recommendations."
            />
          ) : (
            <><Panel
              title="Prices & technicals"
              subtitle={`${watchlist.items.length} symbol${watchlist.items.length === 1 ? '' : 's'} · ${quotes.data?.market_open ? 'Market open' : 'Latest available snapshot'}`}
              action={<span className="an-chip">{source || 'Provider snapshot'} · {asOf ? formatStamp(asOf) : 'source time unavailable'}</span>}
            >
              <div className="an-watchlist__controls">
                <label className="an-watchlist__filter">
                  <Search size={16} aria-hidden="true" />
                  <span className="sr-only">Filter saved symbols</span>
                  <input className="an-input" name="watchlist-symbol-filter" autoComplete="off" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Filter symbols" />
                </label>
                <label className="an-watchlist__sort">
                  <ArrowDownUp size={15} aria-hidden="true" />
                  <span className="sr-only">Sort watchlist</span>
                  <select className="an-input" value={sort} onChange={(event) => setSort(event.target.value as SortKey)}>
                    <option value="saved">Saved order</option>
                    <option value="symbol">Symbol A–Z</option>
                    <option value="change">Largest move</option>
                    <option value="price">Highest price</option>
                  </select>
                </label>
              </div>

              {quotes.error && <div className="an-watchlist__quote-error" role="status">Quotes could not be refreshed. Saved symbols are still available. <button type="button" onClick={refresh}>Try again</button></div>}

              {rows.length === 0 ? (
                <EmptyState title="No matching symbols" description="Clear the filter to see your saved stocks." />
              ) : (
                <div className="an-watchlist__list" role="list">
                  <div className="an-watchlist__table-head" aria-hidden="true">
                    <span>Stock</span><span>Price</span><span>Chart signal</span><span>Day move</span><span>Day range</span><span />
                  </div>
                  {rows.map(({ item, quote }) => {
                    const rowMarket = item.market === 'US' ? 'US' : 'IN';
                    const chartSignal = chartSignals[watchlistChartSymbol(item)];
                    return (
                      <article className="an-watchlist__row" role="listitem" key={`${rowMarket}-${item.symbol}`}>
                        <div className="an-watchlist__identity">
                          <Link to={symbolPath(item.symbol, rowMarket)}>{item.symbol}</Link>
                          <span className="an-chip">{marketLabel(rowMarket)}</span>
                        </div>
                        <div className="an-watchlist__metric" data-label="Price">
                          <strong>{quote?.last == null ? '—' : formatPrice(quote.last, rowMarket)}</strong>
                        </div>
                        <div className="an-watchlist__metric an-watchlist__signal" data-label="Chart signal">
                          <span className={`an-watchlist__signal-label ${chartSignal?.signal === 'BUY' ? 'is-buy' : ''}`}>
                            {chartSignal ? (chartSignal.signal === 'N/A' ? 'Unavailable' : chartSignal.signal) : 'Loading…'}
                          </span>
                          <small>{chartSignal?.asOf ? `Candle ${chartSignal.asOf}` : 'Chart Analyser'}</small>
                        </div>
                        <div className="an-watchlist__metric" data-label="Day move">
                          {quote?.change_pct == null ? <span className="an-muted">Unavailable</span> : <Change value={quote.change_pct} />}
                        </div>
                        <div className="an-watchlist__metric" data-label="Day range">
                          <span>{quote?.day_low == null ? '—' : formatPrice(quote.day_low, rowMarket)}</span>
                          <span className="an-muted"> to </span>
                          <span>{quote?.day_high == null ? '—' : formatPrice(quote.day_high, rowMarket)}</span>
                        </div>
                        <button className="an-watchlist__remove" type="button" onClick={() => removeSymbol(item.symbol)} disabled={busySymbol === item.symbol} aria-label={`Remove ${item.symbol}`}>
                          <Trash2 size={16} aria-hidden="true" />
                        </button>
                      </article>
                    );
                  })}
                </div>
              )}
              <p className="an-watchlist__signal-note">Chart signals use RSI and the 20-day moving average on the dated candle. BUY is a research indicator, not a trade recommendation.</p>
            </Panel>
            <WatchlistResearch stocks={watchlist.items} quotes={quotes.data?.quotes ?? []} quoteError={quotes.error} accountKey={accountKey} />
            </>
          )}
        </>
      )}
    </div>
  );
}
