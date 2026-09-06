import React, { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Search } from 'lucide-react';
import ShareButton from '../components/ShareButton';
import { DataTable, EmptyState, PageHeader } from '../components/ui';
import {
  deliveryApiPath,
  deliveryStockPath,
  formatDeliveryNumber,
  normalizeDeliverySymbol,
  sourceNotice,
} from '../lib/deliveryView';
import './DeliveryRadar.css';

const ResearchNote = ({ payload }) => (
  <div className={`delivery-source ${payload?.source_status === 'stale' ? 'is-stale' : ''}`} role="status">
    <strong>{sourceNotice(payload)}</strong>
    <span>Delivery activity is end-of-day research context, not proof of institutional buying or a trade recommendation.</span>
  </div>
);

const StockSearch = () => {
  const [value, setValue] = useState('');
  const navigate = useNavigate();
  const submit = (event) => {
    event.preventDefault();
    const symbol = normalizeDeliverySymbol(value);
    if (symbol) navigate(deliveryStockPath(symbol));
  };
  return (
    <form className="delivery-search" onSubmit={submit}>
      <label htmlFor="delivery-symbol">Stock delivery history</label>
      <div><input id="delivery-symbol" value={value} onChange={(event) => setValue(event.target.value)} placeholder="RELIANCE" /><button type="submit"><Search size={16} /> View</button></div>
    </form>
  );
};

const Radar = () => {
  const [payload, setPayload] = useState(null);
  const [error, setError] = useState('');
  const captureRef = useRef(null);
  useEffect(() => {
    let active = true;
    axios.get('/api/delivery/radar?limit=100')
      .then(({ data }) => { if (active) setPayload(data); })
      .catch((requestError) => { if (active) setError(requestError.response?.data?.detail || 'Delivery data is temporarily unavailable.'); });
    return () => { active = false; };
  }, []);

  const columns = [
    { key: 'symbol', label: 'Stock', render: (row) => <Link className="delivery-symbol" to={deliveryStockPath(row.symbol)}>{row.symbol}</Link> },
    { key: 'delivered_qty', label: 'Delivered qty', align: 'right', render: (row) => formatDeliveryNumber(row.delivered_qty, 'quantity') },
    { key: 'delivered_qty_ratio', label: 'Vs 20-session avg', align: 'right', render: (row) => <strong>{formatDeliveryNumber(row.delivered_qty_ratio, 'ratio')}</strong> },
    { key: 'delivery_pct', label: 'Delivery %', align: 'right', render: (row) => formatDeliveryNumber(row.delivery_pct, 'percent') },
    { key: 'delivery_pct_ratio', label: 'Delivery % vs avg', align: 'right', render: (row) => formatDeliveryNumber(row.delivery_pct_ratio, 'ratio') },
    { key: 'price_change_pct', label: 'Price move', align: 'right', render: (row) => <span className={row.price_change_pct >= 0 ? 'tone-gain' : 'tone-loss'}>{formatDeliveryNumber(row.price_change_pct, 'percent')}</span> },
  ];
  const rows = payload?.data || [];

  return <div className="delivery-page fade-in" ref={captureRef}>
    <PageHeader title="Delivery Radar" subtitle="Find unusual NSE delivered quantity with price context." right={<ShareButton capture={() => captureRef.current} shareText="Alpha Nova Delivery Radar" filename="alpha-nova-delivery-radar.png" />} />
    <p className="delivery-wedge">Alpha Nova turns NSE delivery data into a daily, shareable shortlist for Indian swing traders.</p>
    <StockSearch />
    {payload && <ResearchNote payload={payload} />}
    {payload && <div className="delivery-coverage"><span><strong>{payload.coverage.eligible}</strong> stocks with complete baselines</span><span><strong>{payload.coverage.latest_rows}</strong> latest-session records</span><span>Ranked by delivered quantity versus its prior 20-session average</span></div>}
    <DataTable
      columns={columns}
      rows={rows}
      rowKey={(row) => row.symbol}
      loading={!payload && !error}
      empty={<EmptyState title={error ? 'Delivery data unavailable' : 'Baseline building'} body={error || 'The public list appears after 20 validated prior sessions with delivered quantities are available.'} />}
    />
    <p className="delivery-method">Source: NSE security-wise price volume and deliverable position files. The latest available session is shown explicitly; incomplete stocks do not enter the ranking.</p>
  </div>;
};

const StockHistory = ({ routeSymbol }) => {
  const symbol = normalizeDeliverySymbol(routeSymbol);
  const [payload, setPayload] = useState(null);
  const [error, setError] = useState(() => symbol ? '' : 'Enter a valid NSE symbol.');
  const captureRef = useRef(null);
  useEffect(() => {
    let active = true;
    if (!symbol) return undefined;
    axios.get(deliveryApiPath(symbol))
      .then(({ data }) => { if (active) setPayload(data); })
      .catch((requestError) => { if (active) setError(requestError.response?.data?.detail || 'Delivery history is temporarily unavailable.'); });
    return () => { active = false; };
  }, [symbol]);
  const latest = payload?.data?.[0];
  const columns = [
    { key: 'trade_date', label: 'Session' },
    { key: 'close', label: 'Close', align: 'right', render: (row) => formatDeliveryNumber(row.close, 'price') },
    { key: 'price_change_pct', label: 'Price move', align: 'right', render: (row) => formatDeliveryNumber(row.price_change_pct, 'percent') },
    { key: 'delivered_qty', label: 'Delivered qty', align: 'right', render: (row) => formatDeliveryNumber(row.delivered_qty, 'quantity') },
    { key: 'delivery_pct', label: 'Delivery %', align: 'right', render: (row) => formatDeliveryNumber(row.delivery_pct, 'percent') },
    { key: 'delivered_qty_ratio', label: 'Qty vs prior 20', align: 'right', render: (row) => formatDeliveryNumber(row.delivered_qty_ratio, 'ratio') },
  ];
  return <div className="delivery-page fade-in" ref={captureRef}>
    <Link className="delivery-back" to="/delivery-radar"><ArrowLeft size={15} /> Delivery Radar</Link>
    <PageHeader title={`${symbol || 'Stock'} delivery percentage`} subtitle="Delivered quantity, delivery percentage, and price context by NSE session." right={<ShareButton capture={() => captureRef.current} shareText={`${symbol} delivery history on Alpha Nova`} filename={`alpha-nova-${symbol || 'stock'}-delivery.png`} />} />
    {payload && <ResearchNote payload={payload} />}
    {latest && <div className="delivery-stat-grid">
      <div><span>Delivered quantity</span><strong>{formatDeliveryNumber(latest.delivered_qty, 'quantity')}</strong></div>
      <div><span>Vs prior 20 sessions</span><strong>{formatDeliveryNumber(latest.delivered_qty_ratio, 'ratio')}</strong></div>
      <div><span>Delivery percentage</span><strong>{formatDeliveryNumber(latest.delivery_pct, 'percent')}</strong></div>
      <div><span>Price move</span><strong>{formatDeliveryNumber(latest.price_change_pct, 'percent')}</strong></div>
    </div>}
    {payload && !payload.baseline_complete && <div className="delivery-source is-stale"><strong>Comparison incomplete</strong><span>{payload.baseline_samples} of 20 prior sessions are available. Ratio fields stay blank until the baseline is complete.</span></div>}
    <DataTable columns={columns} rows={payload?.data || []} rowKey={(row) => row.trade_date} loading={!payload && !error} empty={<EmptyState title="No delivery history" body={error || 'No validated NSE delivery sessions are available for this stock.'} />} />
  </div>;
};

export default function DeliveryRadar() {
  const { symbol } = useParams();
  return symbol ? <StockHistory routeSymbol={symbol} /> : <Radar />;
}
