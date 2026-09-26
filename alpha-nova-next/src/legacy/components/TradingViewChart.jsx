import { useEffect, useRef } from 'react';
import { CandlestickSeries, createChart, HistogramSeries, LineSeries } from 'lightweight-charts';

export default function TradingViewChart({ data, intraday = false, overlays = null }) {
  const containerRef = useRef(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !data?.dates?.length) return undefined;
    const chart = createChart(container, {
      width: container.clientWidth,
      height: container.clientHeight,
      layout: { background: { color: '#10181d' }, textColor: '#91a4ac', attributionLogo: true },
      grid: { vertLines: { color: '#1b2b32' }, horzLines: { color: '#1b2b32' } },
      rightPriceScale: { borderColor: '#2b3b42' },
      timeScale: { borderColor: '#2b3b42', timeVisible: intraday, secondsVisible: false },
    });
    const time = (date) => intraday ? Math.floor(new Date(date).getTime() / 1000) : date.slice(0, 10);
    const candles = chart.addSeries(CandlestickSeries, {
      upColor: '#34c759', downColor: '#ff5b65', borderVisible: false,
      wickUpColor: '#34c759', wickDownColor: '#ff5b65',
    });
    candles.setData(data.dates.map((date, i) => ({
      time: time(date), open: data.open[i], high: data.high[i], low: data.low[i], close: data.close[i],
    })));
    if (!intraday && data.sma20) {
      const sma = chart.addSeries(LineSeries, { color: '#58a6ff', lineWidth: 2, priceLineVisible: false, lastValueVisible: false });
      sma.setData(data.dates.flatMap((date, i) => Number.isFinite(data.sma20[i]) ? [{ time: time(date), value: data.sma20[i] }] : []));
    }
    if (!intraday && overlays) {
      const lineFor = (values, color, width = 2, dashed = false) => {
        const s = chart.addSeries(LineSeries, {
          color, lineWidth: width, priceLineVisible: false, lastValueVisible: false,
          ...(dashed ? { lineStyle: 2 } : {}),
        });
        s.setData(data.dates.flatMap((date, i) => Number.isFinite(values?.[i]) ? [{ time: time(date), value: values[i] }] : []));
      };
      if (overlays.showEma20 && overlays.ema20) lineFor(overlays.ema20, '#e4c58b', 2);
      if (overlays.showEma50 && overlays.ema50) lineFor(overlays.ema50, '#8be2df', 2);
      if (overlays.showBb && overlays.bbUpper) lineFor(overlays.bbUpper, '#5b6b76', 1, true);
      if (overlays.showBb && overlays.bbLower) lineFor(overlays.bbLower, '#5b6b76', 1, true);
      if (overlays.showRsi && data.rsi) {
        const rsi = chart.addSeries(LineSeries, { color: '#b48ce8', lineWidth: 1, priceScaleId: 'rsi', priceLineVisible: false, lastValueVisible: false });
        chart.priceScale('rsi').applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });
        rsi.setData(data.dates.flatMap((date, i) => Number.isFinite(data.rsi[i]) ? [{ time: time(date), value: data.rsi[i] }] : []));
      }
    }
    if (data.volume) {
      const volume = chart.addSeries(HistogramSeries, {
        priceScaleId: 'volume', priceFormat: { type: 'volume' }, priceLineVisible: false, lastValueVisible: false,
      });
      chart.priceScale('volume').applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });
      volume.setData(data.dates.map((date, i) => ({
        time: time(date), value: data.volume[i] || 0,
        color: data.close[i] >= data.open[i] ? '#34c75966' : '#ff5b6566',
      })));
    }
    chart.timeScale().fitContent();
    const observer = new ResizeObserver(() => chart.applyOptions({ width: container.clientWidth, height: container.clientHeight }));
    observer.observe(container);
    return () => { observer.disconnect(); chart.remove(); };
  }, [data, intraday, overlays]);

  return <div className="chart-tradingview" ref={containerRef} role="img" aria-label="Interactive TradingView candlestick chart" />;
}
