import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Panel } from '../components/ui';
import { formatStamp, symbolPath } from '../lib/market';
import { useResource } from '../lib/useResource';

interface SavedStock { symbol: string; market?: 'IN' | 'US' }
interface Quote { symbol: string; change_pct?: number | null; as_of?: string | null }
interface CompanyEvent {
  id: string;
  symbol: string;
  category: string;
  title: string;
  detail: string;
  published_at: string | null;
  url: string;
  source: string;
}
interface EventsResponse { events: CompanyEvent[]; coverage: string; checked_at?: string; window_days: number }

export default function WatchlistResearch({ stocks, quotes, quoteError, accountKey }: {
  stocks: SavedStock[];
  quotes: Quote[];
  quoteError: string | null;
  accountKey: string;
}) {
  const indianStocks = stocks.filter(stock => stock.market !== 'US');
  const [selection, setSelection] = useState<string | null>(null);
  const savedKey = indianStocks.map(stock => stock.symbol).join(',');
  const selected = indianStocks.some(stock => stock.symbol === selection)
    ? selection : indianStocks[0]?.symbol ?? null;
  const feed = useResource<EventsResponse>(indianStocks.length
    ? `/api/watchlist/company-events?account=${encodeURIComponent(accountKey)}&saved=${encodeURIComponent(savedKey)}` : null, 300_000);
  const timeline = useResource<EventsResponse>(selected
    ? `/api/company-events/${encodeURIComponent(selected)}` : null, 0);
  const quoteMap = useMemo(() => new Map(quotes.map(quote => [quote.symbol.toUpperCase(), quote])), [quotes]);
  const eventsBySymbol = useMemo(() => {
    const map = new Map<string, CompanyEvent[]>();
    for (const event of feed.data?.events ?? []) {
      const group = map.get(event.symbol) ?? [];
      group.push(event);
      map.set(event.symbol, group);
    }
    return map;
  }, [feed.data]);
  const coverageReady = !indianStocks.length || (feed.data?.coverage === 'available' && !feed.error);

  return <div className="an-watchlist__research">
    <Panel title="Saved-stock changes" subtitle="Recent NSE filings and large daily price moves for the stocks you follow."
      action={indianStocks.length ? <button className="an-button" type="button" onClick={feed.refresh} disabled={feed.refreshing}>Refresh changes</button> : undefined}>
      {feed.error && <p className="an-watchlist__research-warning" role="status">Company filings could not be checked. {feed.error}</p>}
      {quoteError && <p className="an-watchlist__research-warning" role="status">Price moves could not be checked. {quoteError}</p>}
      {feed.loading && indianStocks.length > 0 && <p className="an-muted" role="status">Checking company filings…</p>}
      <div className="an-watchlist__change-list">
        {stocks.map(stock => {
          const events = eventsBySymbol.get(stock.symbol) ?? [];
          const quote = quoteMap.get(stock.symbol.toUpperCase());
          const largeMove = Number.isFinite(quote?.change_pct) && Math.abs(quote!.change_pct!) >= 3;
          const noChange = coverageReady && !quoteError && quote?.change_pct != null && !events.length && !largeMove;
          return <article className="an-watchlist__change" key={`${stock.market ?? 'IN'}-${stock.symbol}`}>
            <div className="an-watchlist__change-top">
              <Link to={symbolPath(stock.symbol, stock.market === 'US' ? 'US' : 'IN')}>{stock.symbol}</Link>
              <span className="an-muted">{stock.market === 'US' ? 'US' : 'NSE'}</span>
            </div>
            {stock.market === 'US' && <p>Company filings are currently covered for NSE stocks only.</p>}
            {largeMove && <p>Day move {quote!.change_pct! > 0 ? '+' : ''}{quote!.change_pct!.toFixed(1)}% <span className="an-muted">· {quote?.as_of ? formatStamp(quote.as_of) : 'quote time unavailable'}</span></p>}
            {events.slice(0, 2).map(event => <p key={event.id}><span className="an-watchlist__event-kind">{event.category}</span> <a href={event.url} target="_blank" rel="noopener noreferrer">{event.title}</a> <span className="an-muted">· {event.published_at ? formatStamp(event.published_at) : 'date unavailable'}</span></p>)}
            {events.length > 2 && <p className="an-muted">+{events.length - 2} more filings in the timeline</p>}
            {noChange && <p>No recent NSE filing or large day move found in the available snapshot.</p>}
            {!noChange && stock.market !== 'US' && !largeMove && !events.length && (feed.loading || !coverageReady || quote?.change_pct == null) && <p className="an-muted">Change check incomplete.</p>}
            {stock.market !== 'US' && <button className="an-watchlist__timeline-button" type="button" onClick={() => setSelection(stock.symbol)}>View company timeline</button>}
          </article>;
        })}
      </div>
      <p className="an-watchlist__signal-note">A large day move means 3% or more; it is a filter, not a signal. Filings cover the past 7 days. Source availability and quote dates can differ.</p>
    </Panel>

    {selected && <Panel title={`${selected} company timeline`} subtitle="NSE company filings from the past 30 days.">
      {timeline.loading && <p className="an-muted" role="status">Loading filings…</p>}
      {timeline.error && <p className="an-watchlist__research-warning" role="status">Filings could not be checked. <button type="button" onClick={timeline.refresh}>Retry</button></p>}
      {!timeline.loading && !timeline.error && timeline.data?.events.length === 0 && <p>No NSE filings found in this 30-day window.</p>}
      <ol className="an-watchlist__timeline">
        {(timeline.data?.events ?? []).map(event => <li key={event.id}>
          <span className="an-watchlist__event-kind">{event.category}</span>
          <a href={event.url} target="_blank" rel="noopener noreferrer">{event.title}</a>
          <span className="an-muted">{event.published_at ? formatStamp(event.published_at) : 'date unavailable'} · {event.source}</span>
          {event.detail && <p>{event.detail}</p>}
        </li>)}
      </ol>
      <p className="an-watchlist__signal-note">Open the linked NSE filing to read the company’s full disclosure. A missing filing here does not confirm that no announcement exists.</p>
    </Panel>}
  </div>;
}
