import { useEffect, useRef, useState } from 'react';
import { CandlestickSeries, createChart, HistogramSeries, LineSeries } from 'lightweight-charts';

// Build unique, ascending candles — setData() throws on duplicates or
// out-of-order times, and provider history is not guaranteed clean.
const toCandles = (data) => {
  if (!data?.dates?.length) return [];
  const byTime = new Map();
  data.dates.forEach((raw, i) => {
    const time = typeof raw === 'string' ? raw.slice(0, 10) : null;
    const open = data.open?.[i];
    const high = data.high?.[i];
    const low = data.low?.[i];
    const close = data.close?.[i];
    if (!time || byTime.has(time)) return;
    if (![open, high, low, close].every((n) => typeof n === 'number' && Number.isFinite(n))) return;
    byTime.set(time, { time, open, high, low, close });
  });
  return [...byTime.values()].sort((a, b) => (a.time < b.time ? -1 : 1));
};

const readTheme = () => {
  const fallback = { text: '#8a9ba3', grid: '#22333a', bg: 'transparent' };
  try {
    const probe = document.createElement('span');
    probe.style.cssText =
      'position:absolute;visibility:hidden;pointer-events:none;color:var(--text-secondary);border:1px solid var(--border-subtle)';
    document.body.appendChild(probe);
    const styles = getComputedStyle(probe);
    const theme = { text: styles.color || fallback.text, grid: styles.borderTopColor || fallback.grid, bg: fallback.bg };
    probe.remove();
    return theme;
  } catch {
    return fallback;
  }
};

export default function TradingViewChart({ data }) {
  const mainRef = useRef(null);
  const rsiRef = useRef(null);
  const [themeTick, setThemeTick] = useState(0);

  useEffect(() => {
    const observer = new MutationObserver(() => setThemeTick((n) => n + 1));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'class', 'style'] });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const mainEl = mainRef.current;
    const rsiEl = rsiRef.current;
    if (!mainEl || !rsiEl) return undefined;
    const candles = toCandles(data).map((candle, index) => ({ ...candle, index }));
    if (!candles.length) return undefined;

    const theme = readTheme();
    const baseOptions = {
      layout: { background: { color: theme.bg }, textColor: theme.text, attributionLogo: true },
      grid: { vertLines: { color: theme.grid }, horzLines: { color: theme.grid } },
      rightPriceScale: { borderColor: theme.grid },
      timeScale: { borderColor: theme.grid },
    };

    const main = createChart(mainEl, {
      ...baseOptions,
      width: mainEl.clientWidth,
      height: mainEl.clientHeight,
    });
    const price = main.addSeries(CandlestickSeries, {
      upColor: '#34c759',
      downColor: '#ff3b30',
      borderVisible: false,
      wickUpColor: '#34c759',
      wickDownColor: '#ff3b30',
    });
    price.setData(candles.map(({ time, open, high, low, close }) => ({ time, open, high, low, close })));

    const smaPoints = [];
    candles.forEach((candle) => {
      const value = data?.sma20?.[candle.index];
      if (typeof value === 'number' && Number.isFinite(value)) smaPoints.push({ time: candle.time, value });
    });
    if (smaPoints.length > 1) {
      const sma = main.addSeries(LineSeries, {
        color: '#007aff',
        lineWidth: 2,
        priceLineVisible: false,
        lastValueVisible: false,
      });
      sma.setData(smaPoints);
    }

    if (Array.isArray(data?.volume)) {
      const volume = main.addSeries(HistogramSeries, {
        priceScaleId: 'volume',
        priceFormat: { type: 'volume' },
        priceLineVisible: false,
        lastValueVisible: false,
      });
      main.priceScale('volume').applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });
      volume.setData(
        candles.map((candle) => ({
          time: candle.time,
          value: data.volume[candle.index] || 0,
          color: candle.close >= candle.open ? 'rgba(52, 199, 89, 0.45)' : 'rgba(255, 59, 48, 0.45)',
        })),
      );
    }
    main.timeScale().fitContent();

    // RSI sub-pane mirrors the old Plotly RSI subplot (30/70 bands).
    const rsiPoints = [];
    candles.forEach((candle) => {
      const value = data?.rsi?.[candle.index];
      if (typeof value === 'number' && Number.isFinite(value)) rsiPoints.push({ time: candle.time, value });
    });
    let rsi = null;
    if (rsiPoints.length > 1) {
      rsi = createChart(rsiEl, {
        ...baseOptions,
        width: rsiEl.clientWidth,
        height: rsiEl.clientHeight,
        rightPriceScale: { borderColor: theme.grid },
      });
      const line = rsi.addSeries(LineSeries, { color: '#af52de', lineWidth: 2, priceLineVisible: true, lastValueVisible: true });
      line.setData(rsiPoints);
      const band = (priceValue, color) => {
        const series = rsi.addSeries(LineSeries, { color, lineWidth: 1, priceLineVisible: false, lastValueVisible: false });
        series.setData(rsiPoints.map((p) => ({ time: p.time, value: priceValue })));
      };
      band(70, 'rgba(255, 59, 48, 0.6)');
      band(30, 'rgba(52, 199, 89, 0.6)');
      rsi.timeScale().fitContent();
      rsi.timeScale().setVisibleLogicalRange(main.timeScale().getVisibleLogicalRange());
      const sync = (range) => {
        if (!range || !rsi) return;
        try {
          rsi.timeScale().setVisibleLogicalRange(range);
        } catch {
          // Ignore transient sync failures during resizes.
        }
      };
      main.timeScale().subscribeVisibleLogicalRangeChange(sync);
    } else if (rsiEl) {
      rsiEl.style.display = 'none';
    }

    const observer = new ResizeObserver(() => {
      main.applyOptions({ width: mainEl.clientWidth, height: mainEl.clientHeight });
      if (rsi) rsi.applyOptions({ width: rsiEl.clientWidth, height: rsiEl.clientHeight });
    });
    observer.observe(mainEl);
    observer.observe(rsiEl);
    return () => {
      observer.disconnect();
      main.remove();
      if (rsi) rsi.remove();
      if (rsiEl) rsiEl.style.display = '';
    };
  }, [data, themeTick]);

  if (!toCandles(data).length) {
    return (
      <div className="chart-tradingview-empty" role="status">
        Price history is unavailable for this symbol right now.
      </div>
    );
  }

  return (
    <div className="chart-tradingview-stack">
      <div className="chart-tradingview" ref={mainRef} role="img" aria-label="Interactive candlestick chart with 20-day average and volume" />
      <div className="chart-tradingview-rsi" ref={rsiRef} role="img" aria-label="RSI momentum chart" />
    </div>
  );
}
