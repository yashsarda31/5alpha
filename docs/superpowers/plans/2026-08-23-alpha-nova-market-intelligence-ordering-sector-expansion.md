# Alpha Nova Market Intelligence Ordering and Sector Expansion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the Chart Analyser, Option Chain, and Market Signals presentation order, expand India Sector Rotation to 20 groups, and show three relative-momentum stocks for each of the top three groups.

**Architecture:** Keep the three presentation fixes inside their existing React pages, extracting only the option build-up color rule into a pure helper. For India rotation history, add a focused backend module that reads official NSE weekly all-index archive snapshots; retain the existing yfinance path for US sectors. Fetch official Nifty Indices constituent CSVs only for the three winning India groups, then make one batched yfinance price call and rank stocks with a pure 21-session relative-momentum helper.

**Tech Stack:** React 19, Vite, Node test runner, FastAPI, pytest, pandas, requests, yfinance, NSE/Nifty Indices public data.

## Global Constraints

- Preserve the Chart Analyser fetch logic, latest-request guard, indicators, signal calculations, watchlist control, sharing, and AI behavior.
- Put Selling is green; Call Selling remains red; other build-up colors remain unchanged.
- Do not change setup scoring, levels, risk sizing, market routing, refresh cadence, or Signals portfolio behavior.
- Retain all 12 current India rotation groups and add exactly eight: Midcap 100, Smallcap 100, Healthcare, Consumer Durables, India Consumption, Oil & Gas, Commodities, and Services Sector.
- Keep Midcap 100 and Smallcap 100 explicitly labelled as market-cap groups.
- Show three stocks for each of the first three ranked India groups, ranked by 21-session return minus the Nifty 50's 21-session return.
- Surface incomplete index, constituent, and price-provider states; never imply partial data is complete.
- Keep US sector coverage unchanged and label top-stock cards as India-only during US routing.
- Keep the eight new index labels unlinked in Sector Rotation until a chart provider exposes sufficient daily history; stock-leader links remain active.
- Preserve unrelated dirty and untracked workspace files.
- Do not deploy unless the user separately requests deployment.

---

### Task 1: Make Option Chain build-up colors option-side aware

**Files:**
- Create: `web/src/lib/optionChainPresentation.js`
- Create: `web/src/lib/optionChainPresentation.test.js`
- Modify: `web/src/pages/OptionChain.jsx:35-64,329-363`

**Interfaces:**
- Consumes: raw build-up values (`Long Buildup`, `Short Buildup`, `Short Covering`, `Long Unwinding`) and option side (`call` or `put`).
- Produces: `getBuildupLabel(buildup, side): string` and `getBuildupColorClass(buildup, side): string`.

- [ ] **Step 1: Write the failing pure-helper tests**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { getBuildupColorClass, getBuildupLabel } from './optionChainPresentation.js';

test('put short buildup is labelled Put Selling and colored green', () => {
  assert.equal(getBuildupLabel('Short Buildup', 'put'), 'Put Selling');
  assert.equal(getBuildupColorClass('Short Buildup', 'put'), 'text-green');
});

test('call short buildup remains Call Selling and red', () => {
  assert.equal(getBuildupLabel('Short Buildup', 'call'), 'Call Selling');
  assert.equal(getBuildupColorClass('Short Buildup', 'call'), 'text-red');
});

test('all non-selling buildup colors retain the current contract', () => {
  assert.equal(getBuildupColorClass('Long Buildup', 'call'), 'text-green');
  assert.equal(getBuildupColorClass('Long Buildup', 'put'), 'text-green');
  assert.equal(getBuildupColorClass('Short Covering', 'call'), 'text-green');
  assert.equal(getBuildupColorClass('Long Unwinding', 'put'), 'text-red');
  assert.equal(getBuildupColorClass('Unknown', 'put'), 'text-neutral');
});
```

- [ ] **Step 2: Run the test and verify the missing module fails**

Run from `web`:

```powershell
rtk node --test src/lib/optionChainPresentation.test.js
```

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `optionChainPresentation.js`.

- [ ] **Step 3: Add the minimal presentation helper**

```js
export const getBuildupLabel = (buildup, side) => {
  if (!buildup) return '';
  if (buildup === 'Long Buildup') return side === 'call' ? 'Call Buying' : 'Put Buying';
  if (buildup === 'Short Buildup') return side === 'call' ? 'Call Selling' : 'Put Selling';
  return buildup;
};

export const getBuildupColorClass = (buildup, side) => {
  if (buildup === 'Short Buildup' && side === 'put') return 'text-green';
  if (buildup === 'Long Buildup') return 'text-green';
  if (buildup === 'Short Buildup') return 'text-red';
  if (buildup === 'Short Covering') return 'text-green';
  if (buildup === 'Long Unwinding') return 'text-red';
  return 'text-neutral';
};
```

Import both functions into `OptionChain.jsx`, delete the local duplicates, and pass the side in both table cells:

```jsx
<td className={`calls-section ${getBuildupColorClass(row.calls_builtup, 'call')}`}>
  {getBuildupLabel(row.calls_builtup, 'call')}
</td>
<td className={`puts-section ${getBuildupColorClass(row.puts_builtup, 'put')}`}>
  {getBuildupLabel(row.puts_builtup, 'put')}
</td>
```

Retain the existing inline font weight and font size on both cells.

- [ ] **Step 4: Run the focused test and page lint**

```powershell
rtk node --test src/lib/optionChainPresentation.test.js
rtk npx eslint src/lib/optionChainPresentation.js src/lib/optionChainPresentation.test.js src/pages/OptionChain.jsx
```

Expected: three tests pass and ESLint exits 0.

- [ ] **Step 5: Commit the isolated option-chain change**

```powershell
rtk git add web/src/lib/optionChainPresentation.js web/src/lib/optionChainPresentation.test.js web/src/pages/OptionChain.jsx
rtk git commit -m "fix(options): color put selling green"
```

---

### Task 2: Restore the Chart Analyser chart-first responsive hierarchy

**Files:**
- Create: `web/src/lib/chartLayoutContract.test.js`
- Create: `web/src/pages/Chart.css`
- Modify: `web/src/pages/Chart.jsx:1-2,18-28,146-406`

**Interfaces:**
- Consumes: existing `chartData`, `fundamentals`, `techSignal`, `ticker`, and `cur` values.
- Produces: DOM order `Plot -> Stock Pro Dash -> summary metrics -> AI`, plus desktop two-column and mobile stacked styling.

- [ ] **Step 1: Write a failing source-order contract test**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('../pages/Chart.jsx', import.meta.url), 'utf8');

test('Chart Analyser renders chart and dash before summary data and AI', () => {
  const chart = source.indexOf('className="chart-plot-pane"');
  const dash = source.indexOf('className="chart-stock-pro"');
  const summary = source.indexOf('className="stats-grid chart-summary-grid"');
  const ai = source.indexOf('className="chart-ai-section"');
  assert.ok(chart >= 0 && dash > chart && summary > dash && ai > summary);
});

test('VCP Rating and Alpha Score live inside Stock Pro Dash', () => {
  const dash = source.indexOf('className="chart-stock-pro"');
  const summary = source.indexOf('className="stats-grid chart-summary-grid"');
  const vcp = source.indexOf('VCP RATING', dash);
  const alpha = source.indexOf('ALPHA SCORE', dash);
  assert.ok(vcp > dash && vcp < summary);
  assert.ok(alpha > dash && alpha < summary);
});

test('Chart uses the mobile-height branch', () => {
  assert.match(source, /height:\s*isNarrow\s*\?\s*430\s*:\s*650/);
});
```

- [ ] **Step 2: Run the contract and verify the current stats-first markup fails**

Run from `web`:

```powershell
rtk node --test src/lib/chartLayoutContract.test.js
```

Expected: FAIL because the required class names/mobile-height branch are absent and the current summary precedes the chart.

- [ ] **Step 3: Reorder the existing blocks without changing their calculations**

Add `import './Chart.css';`. Add a local responsive hook matching Sector Rotation's established pattern:

```jsx
const useIsNarrow = (px = 700) => {
  const [narrow, setNarrow] = useState(() => (
    typeof window !== 'undefined' && window.matchMedia
      ? window.matchMedia(`(max-width: ${px}px)`).matches
      : false
  ));
  useEffect(() => {
    if (!window.matchMedia) return undefined;
    const mq = window.matchMedia(`(max-width: ${px}px)`);
    const onChange = (event) => setNarrow(event.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [px]);
  return narrow;
};
```

Inside `Chart`, set `const isNarrow = useIsNarrow(700);`. Change the analysis-card opening tag to `<div id="chart-analysis" className="card chart-analysis-card">`, the current chart/dash flex wrapper to `<div className="chart-main-row">`, the Plot pane to `<div className="chart-plot-pane">`, and the Stock Pro pane to `<div className="chart-stock-pro">`. In the current Plot layout object, replace `height: 650` with `height: isNarrow ? 430 : 650`. Leave every other Plot trace/layout key, the technical-signal card, fundamental rows, watchlist star, and Gemini control unchanged.

Immediately after the current technical-signal card and before the fundamental comparison header, insert:

```jsx
<div className="chart-score-grid">
  <div className="stat-box">
    <div className="stat-label">VCP RATING</div>
    <div className="stat-value chart-score-value">
      {'★'.repeat(chartData.vcp_rating || 0)}{'☆'.repeat(5 - (chartData.vcp_rating || 0))}
    </div>
  </div>
  <div className="stat-box">
    <div className="stat-label">ALPHA SCORE</div>
    <div className="stat-value chart-score-value">
      {fundamentals?.alphaScore ?? 'N/A'}
    </div>
  </div>
</div>
```

Delete the original six-card stats grid above the chart. Immediately after `chart-main-row`, insert only these four summary cards:

```jsx
<div className="stats-grid chart-summary-grid">
  <div className="stat-box">
    <div className="stat-label">{ticker} PRICE</div>
    <div className="stat-value" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
      {cur}{lastPrice.toFixed(2)}
      <span style={{ fontSize: '14px', color: change >= 0 ? 'var(--green-gain)' : 'var(--red-loss)' }}>
        {change >= 0 ? '+' : ''}{change.toFixed(2)} ({changePercent.toFixed(2)}%)
      </span>
      <WatchlistStar symbol={ticker} market={ticker.toUpperCase().endsWith('.NS') ? 'IN' : 'US'} size={22} />
    </div>
  </div>
  <div className="stat-box">
    <div className="stat-label">DAY HIGH</div>
    <div className="stat-value">{cur}{chartData.high[chartData.high.length - 1].toFixed(2)}</div>
  </div>
  <div className="stat-box">
    <div className="stat-label">DAY LOW</div>
    <div className="stat-value">{cur}{chartData.low[chartData.low.length - 1].toFixed(2)}</div>
  </div>
  <div className="stat-box">
    <div className="stat-label">VOLUME</div>
    <div className="stat-value">{(chartData.volume[chartData.volume.length - 1] / 1e6).toFixed(2)}M</div>
  </div>
</div>
```

Change the Gemini wrapper's opening tag to `<div className="chart-ai-section">`. Remove the old VCP Rating and Alpha Score cards so each metric appears exactly once.

Add focused responsive CSS:

```css
.chart-analysis-card { padding: 0; overflow: hidden; }
.chart-main-row { display: flex; flex-wrap: wrap; }
.chart-plot-pane { flex: 1 1 65%; min-width: 0; background: #000; padding: 10px; }
.chart-stock-pro { flex: 1 1 30%; padding: 24px; background: var(--card-bg); border-left: 1px solid var(--glass-border); }
.chart-score-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; margin: 0 0 24px; }
.chart-score-value { color: var(--primary-gold); font-size: 17px; }
.chart-summary-grid { grid-template-columns: repeat(4, minmax(0, 1fr)); padding: 24px; border-top: 1px solid var(--glass-border); }
.chart-ai-section { padding: 24px; border-top: 1px solid var(--glass-border); background: rgba(0, 0, 0, 0.02); }

@media (max-width: 700px) {
  .chart-main-row { display: block; }
  .chart-plot-pane { width: 100%; padding: 4px; }
  .chart-stock-pro { width: 100%; padding: 18px; border-left: 0; border-top: 1px solid var(--glass-border); }
  .chart-summary-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); padding: 16px; }
  .chart-ai-section { padding: 16px; }
}
```

- [ ] **Step 4: Run the contract, focused lint, and build**

```powershell
rtk node --test src/lib/chartLayoutContract.test.js src/lib/latestRequest.test.js
rtk npx eslint src/pages/Chart.jsx src/pages/Chart.css src/lib/chartLayoutContract.test.js
rtk npm run build
```

Expected: contract/latest-request tests pass, lint exits 0, and Vite build exits 0.

- [ ] **Step 5: Commit the chart-only change**

```powershell
rtk git add web/src/pages/Chart.jsx web/src/pages/Chart.css web/src/lib/chartLayoutContract.test.js
rtk git commit -m "fix(chart): restore chart-first analysis layout"
```

---

### Task 3: Put Actionable Setups before Regime Context

**Files:**
- Create: `web/src/lib/marketSignalsOrderContract.test.js`
- Modify: `web/src/pages/MarketSignals.jsx:130-373`

**Interfaces:**
- Consumes: existing `setups`, `regime`, `options`, `rvFc`, `isUS`, and formatting values.
- Produces: source/render order `PageHeader -> setups-analysis -> Regime Context -> Volatility Forecast -> Options Intelligence -> SignalsPortfolio`.

- [ ] **Step 1: Write the failing order contract**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('../pages/MarketSignals.jsx', import.meta.url), 'utf8');

test('Actionable Setups renders before Regime Context', () => {
  const header = source.indexOf('<PageHeader', source.indexOf('return ('));
  const setups = source.indexOf('id="setups-analysis"', header);
  const regime = source.indexOf('>Regime Context<', header);
  const options = source.indexOf('>Options Intelligence<', header);
  const portfolio = source.indexOf('<SignalsPortfolio', header);
  assert.ok(header >= 0 && setups > header);
  assert.ok(regime > setups);
  assert.ok(options > regime);
  assert.ok(portfolio > options);
});
```

- [ ] **Step 2: Run it and verify the old regime-first order fails**

```powershell
rtk node --test src/lib/marketSignalsOrderContract.test.js
```

Expected: FAIL at `regime > setups`.

- [ ] **Step 3: Move the complete setups block directly below PageHeader**

Cut the current block beginning at the exact marker `{/* ---- Actionable setups ---- */}` and ending at the `</div>` immediately before `<SignalsPortfolio market={isUS ? 'US' : 'IN'} />`. Paste that whole block, including its footnote, immediately after the self-closing `PageHeader` in the successful-data return. Keep every table column, empty state, ShareButton, 2R/locked label, quantity calculation text, and disclaimer byte-for-byte unchanged. After the move, the section markers must appear in this literal order: `Actionable setups`, `Regime context`, `Volatility forecast`, `Options intelligence`, `Index Option Structures`, then `SignalsPortfolio`.

- [ ] **Step 4: Run focused verification**

```powershell
rtk node --test src/lib/marketSignalsOrderContract.test.js src/lib/signalsPortfolioContract.test.js
rtk npx eslint src/pages/MarketSignals.jsx src/lib/marketSignalsOrderContract.test.js
rtk npm run build
```

Expected: both contracts pass, lint exits 0, and Vite build exits 0.

- [ ] **Step 5: Commit the signals-only change**

```powershell
rtk git add web/src/pages/MarketSignals.jsx web/src/lib/marketSignalsOrderContract.test.js
rtk git commit -m "fix(signals): show actionable setups first"
```

---

### Task 4: Add official NSE weekly history and expand India rotation to 20 groups

**Files:**
- Create: `api/sector_rotation_data.py`
- Create: `api/test_sector_rotation_data.py`
- Modify: `api/main.py:2100-2299`
- Modify: `api/test_sectors.py:13-48`

**Interfaces:**
- Consumes: NSE archive files at `https://nsearchives.nseindia.com/content/indices/ind_close_all_DDMMYYYY.csv`, current `/api/allIndices`, and the existing RRG scoring functions.
- Produces: `weekly_snapshot_dates(as_of, weeks=32): list[date]`, `fetch_weekly_index_closes(index_names, dates, fetcher=requests.get, min_points=18): tuple[dict[str, pd.Series], list[str]]`, expanded `SECTOR_INDICES`, and response `coverage`/`trend_label` fields.

- [ ] **Step 1: Write failing archive and map tests**

```python
from datetime import date
import pandas as pd

from api.sector_rotation_data import fetch_weekly_index_closes, weekly_snapshot_dates


class FakeResponse:
    def __init__(self, body, status_code=200):
        self.content = body.encode("utf-8")
        self.status_code = status_code


def test_weekly_snapshot_dates_end_on_or_before_as_of_friday():
    dates = weekly_snapshot_dates(date(2026, 8, 23), weeks=3)
    assert dates == [date(2026, 8, 21), date(2026, 8, 14), date(2026, 8, 7)]


def test_fetch_weekly_index_closes_parses_official_archive_rows():
    csv_by_date = {
        "21082026": "Index Name,Index Date,Closing Index Value\nNIFTY 50,21-08-2026,25000\nNIFTY Midcap 100,21-08-2026,63000\n",
        "14082026": "Index Name,Index Date,Closing Index Value\nNIFTY 50,14-08-2026,24800\nNIFTY Midcap 100,14-08-2026,62000\n",
    }

    def fetcher(url, **_kwargs):
        key = url.rsplit("_", 1)[-1].replace(".csv", "")
        return FakeResponse(csv_by_date[key])

    history, missing = fetch_weekly_index_closes(
        ["NIFTY 50", "NIFTY MIDCAP 100"],
        [date(2026, 8, 21), date(2026, 8, 14)],
        fetcher=fetcher,
        min_points=2,
    )
    assert missing == []
    assert list(history["NIFTY MIDCAP 100"].astype(float)) == [62000.0, 63000.0]
    assert isinstance(history["NIFTY 50"].index, pd.DatetimeIndex)
```

Add to `api/test_sectors.py`:

```python
def test_india_sector_map_has_20_groups():
    assert len(main.SECTOR_INDICES) == 20
    assert "Nifty Midcap 100" in main.SECTOR_INDICES
    assert "Nifty Smallcap 100" in main.SECTOR_INDICES
    assert "Nifty Healthcare" in main.SECTOR_INDICES
    assert "Nifty Services Sector" in main.SECTOR_INDICES
```

- [ ] **Step 2: Run the tests and verify imports/map assertions fail**

Run from the repository root:

```powershell
rtk python -m pytest api/test_sector_rotation_data.py api/test_sectors.py -q
```

Expected: collection fails because `api.sector_rotation_data` is absent, or the new 20-group assertion fails after the module is created.

- [ ] **Step 3: Implement the bounded official archive reader**

Create `api/sector_rotation_data.py` with:

```python
from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta
from io import BytesIO

import pandas as pd
import requests

ARCHIVE_URL = "https://nsearchives.nseindia.com/content/indices/ind_close_all_{stamp}.csv"
ARCHIVE_HEADERS = {"User-Agent": "Mozilla/5.0"}


def _key(value):
    return " ".join(str(value or "").upper().split())


def weekly_snapshot_dates(as_of, weeks=32):
    friday = as_of - timedelta(days=(as_of.weekday() - 4) % 7)
    return [friday - timedelta(days=7 * offset) for offset in range(weeks)]


def fetch_weekly_index_closes(index_names, dates, fetcher=requests.get, min_points=18):
    requested = {_key(name): name for name in index_names}

    def fetch_one(snapshot_date):
        url = ARCHIVE_URL.format(stamp=snapshot_date.strftime("%d%m%Y"))
        try:
            response = fetcher(url, headers=ARCHIVE_HEADERS, timeout=10)
            if response.status_code != 200:
                return None
            frame = pd.read_csv(BytesIO(response.content))
            frame.columns = [str(column).strip() for column in frame.columns]
            names = frame["Index Name"].map(_key)
            values = pd.to_numeric(frame["Closing Index Value"], errors="coerce")
            return snapshot_date, dict(zip(names, values))
        except Exception:
            return None

    workers = min(8, max(1, len(dates)))
    with ThreadPoolExecutor(max_workers=workers) as pool:
        snapshots = [item for item in pool.map(fetch_one, dates) if item]
    snapshots.sort(key=lambda item: item[0])

    history = {}
    missing = []
    for normalized, display_name in requested.items():
        points = [(stamp, values.get(normalized)) for stamp, values in snapshots]
        points = [(stamp, value) for stamp, value in points if pd.notna(value)]
        if len(points) < min_points:
            missing.append(display_name)
            continue
        history[display_name] = pd.Series(
            [float(value) for _, value in points],
            index=pd.DatetimeIndex([stamp for stamp, _ in points]),
            dtype="float64",
        )
    return history, missing
```

- [ ] **Step 4: Expand constants and route India calculations through weekly NSE history**

Import the archive helpers with the repository/Vercel dual-path pattern:

```python
try:
    from api.sector_rotation_data import fetch_weekly_index_closes, weekly_snapshot_dates
except ImportError:
    from sector_rotation_data import fetch_weekly_index_closes, weekly_snapshot_dates
```

Extend `SECTOR_INDICES` with these exact entries while retaining the current 12:

```python
"Nifty Midcap 100": (None, "NIFTY MIDCAP 100"),
"Nifty Smallcap 100": (None, "NIFTY SMALLCAP 100"),
"Nifty Healthcare": (None, "NIFTY HEALTHCARE INDEX"),
"Nifty Consumer Durables": (None, "NIFTY CONSUMER DURABLES"),
"Nifty India Consumption": (None, "NIFTY INDIA CONSUMPTION"),
"Nifty Oil & Gas": (None, "NIFTY OIL & GAS"),
"Nifty Commodities": (None, "NIFTY COMMODITIES"),
"Nifty Services Sector": (None, "NIFTY SERVICES SECTOR"),
```

For India, call `fetch_weekly_index_closes` once with all 20 NSE names plus `NIFTY 50`, using 32 Friday snapshots and a minimum of 18 points. Feed those weekly series directly into the existing RRG normalization. Use lookbacks `1`, `4`, and `13` for 1W/1M/3M, and compare the latest close with the mean of the last 10 weekly closes for the trend component. Keep the current score weights `0.32/0.24/0.24/0.20` unchanged. Return the value as `trend_ref` and set response `trend_label` to `vs 10W avg`.

For US, retain the existing yfinance daily history, `5/21/63` return lookbacks, 50-day average, and resampling. Return `trend_ref` with response `trend_label` set to `vs 50-DMA`.

Return explicit coverage metadata:

```python
"coverage": {
    "expected": len(sectors_map),
    "available": len(rows),
    "missing": missing_names,
    "source": "NSE weekly index archive" if market == "IN" else "Yahoo Finance",
},
"trend_label": "vs 10W avg" if market == "IN" else "vs 50-DMA",
```

Do not return `None` merely because one index is missing; return 503 only when the benchmark or every sector is unavailable.

- [ ] **Step 5: Add partial-coverage integration tests and run the focused suite**

Add this deterministic test to `api/test_sectors.py`:

```python
def test_compute_india_rotation_keeps_partial_coverage(monkeypatch):
    import numpy as np
    import pandas as pd

    dates = pd.date_range("2026-01-09", periods=32, freq="W-FRI")
    benchmark = pd.Series(25000 + np.arange(32) * 40, index=dates, dtype="float64")
    missing_display = "Nifty Services Sector"
    missing_nse_name = main.SECTOR_INDICES[missing_display][1]
    history = {main.SECTOR_BENCHMARK[1]: benchmark}
    for offset, (_display, (_ticker, nse_name)) in enumerate(main.SECTOR_INDICES.items(), start=1):
        if nse_name == missing_nse_name:
            continue
        phase = np.arange(32) / 3 + offset
        relative_path = 1 + 0.015 * np.sin(phase) + 0.0004 * offset * np.arange(32)
        history[nse_name] = pd.Series(benchmark.to_numpy() * relative_path, index=dates)

    monkeypatch.setattr(
        main,
        "fetch_weekly_index_closes",
        lambda *_args, **_kwargs: (history, [missing_nse_name]),
    )
    monkeypatch.setattr(
        main,
        "nse_get",
        lambda _path: {
            "data": [
                {"index": nse_name, "percentChange": 0.5}
                for _display, (_ticker, nse_name) in main.SECTOR_INDICES.items()
            ]
        },
    )

    result = main._compute_sector_rotation("IN")

    assert result["coverage"]["expected"] == 20
    assert result["coverage"]["available"] == 19
    assert result["coverage"]["missing"] == [missing_display]
    assert result["trend_label"] == "vs 10W avg"
    assert [row["score"] for row in result["sectors"]] == sorted(
        [row["score"] for row in result["sectors"]], reverse=True
    )
```

Then run:

```powershell
rtk python -m pytest api/test_sector_rotation_data.py api/test_sectors.py -q
```

Expected: all focused tests pass with no live provider call.

- [ ] **Step 6: Commit official history and expanded coverage**

```powershell
rtk git add api/sector_rotation_data.py api/test_sector_rotation_data.py api/main.py api/test_sectors.py
rtk git commit -m "feat(sectors): expand India rotation coverage"
```

---

### Task 5: Rank top stocks for the first three India groups

**Files:**
- Modify: `api/sector_rotation_data.py`
- Modify: `api/test_sector_rotation_data.py`
- Modify: `api/main.py:2165-2299`
- Modify: `api/test_sectors.py`

**Interfaces:**
- Consumes: first three sorted sector rows, `SECTOR_CONSTITUENT_FILES`, official Nifty Indices CSVs, one yfinance batch, and Nifty 50 history.
- Produces: `fetch_index_constituents(filename, fetcher=requests.get): list[str]`, `rank_relative_momentum(close_by_symbol, benchmark, limit=3): tuple[list[dict], int]`, `build_top_sector_stocks(sector_rows, constituent_files, constituent_fetcher, price_downloader, limit_sectors=3, limit_stocks=3): list[dict]`, and API field `top_sector_stocks`.

- [ ] **Step 1: Write failing constituent and ranking tests**

```python
from api.sector_rotation_data import (
    build_top_sector_stocks,
    fetch_index_constituents,
    rank_relative_momentum,
)


def test_fetch_index_constituents_reads_symbols_and_ignores_blank_rows():
    body = "Company Name,Industry,Symbol,Series,ISIN Code\nInfosys,IT,INFY,EQ,INE009A01021\nBlank,, ,EQ,\n"
    response = FakeResponse(body)
    symbols = fetch_index_constituents("ind_niftyitlist.csv", fetcher=lambda *_args, **_kwargs: response)
    assert symbols == ["INFY"]


def test_rank_relative_momentum_returns_top_three_vs_benchmark():
    index = pd.date_range("2026-07-01", periods=22, freq="B")
    benchmark = pd.Series([100 + i for i in range(22)], index=index, dtype="float64")
    closes = {
        "AAA.NS": pd.Series([100 + 2 * i for i in range(22)], index=index, dtype="float64"),
        "BBB.NS": pd.Series([100 + 1.5 * i for i in range(22)], index=index, dtype="float64"),
        "CCC.NS": pd.Series([100 + i for i in range(22)], index=index, dtype="float64"),
        "DDD.NS": pd.Series([100 + 0.5 * i for i in range(22)], index=index, dtype="float64"),
    }
    rows, excluded = rank_relative_momentum(closes, benchmark, limit=3)
    assert [row["symbol"] for row in rows] == ["AAA", "BBB", "CCC"]
    assert rows[0]["relative_1m"] > rows[1]["relative_1m"]
    assert excluded == 0


def test_rank_relative_momentum_counts_short_histories_as_excluded():
    index = pd.date_range("2026-07-01", periods=22, freq="B")
    benchmark = pd.Series(range(100, 122), index=index, dtype="float64")
    closes = {"SHORT.NS": pd.Series([100, 101], index=index[:2], dtype="float64")}
    rows, excluded = rank_relative_momentum(closes, benchmark, limit=3)
    assert rows == []
    assert excluded == 1


def test_build_top_sector_stocks_uses_first_three_groups_and_one_price_batch():
    index = pd.date_range("2026-07-01", periods=22, freq="B")
    tickers = ["AAA.NS", "AAB.NS", "AAC.NS", "BAA.NS", "BAB.NS", "BAC.NS", "CAA.NS", "CAB.NS", "CAC.NS", "^NSEI"]
    frames = {}
    for rank, ticker in enumerate(tickers):
        slope = 1 if ticker == "^NSEI" else 2 + rank / 10
        frames[ticker] = pd.DataFrame({"Close": [100 + slope * i for i in range(22)]}, index=index)
    batch = pd.concat(frames, axis=1)
    memberships = {
        "a.csv": ["AAA", "AAB", "AAC"],
        "b.csv": ["BAA", "BAB", "BAC"],
        "c.csv": ["CAA", "CAB", "CAC"],
    }
    calls = []

    def downloader(symbols, **kwargs):
        calls.append((symbols, kwargs))
        return batch

    groups = build_top_sector_stocks(
        [{"name": "A"}, {"name": "B"}, {"name": "C"}, {"name": "D"}],
        {"A": "a.csv", "B": "b.csv", "C": "c.csv", "D": "d.csv"},
        constituent_fetcher=lambda filename: memberships.get(filename, []),
        price_downloader=downloader,
    )

    assert [group["sector"] for group in groups] == ["A", "B", "C"]
    assert all(len(group["stocks"]) == 3 for group in groups)
    assert len(calls) == 1
    assert calls[0][1]["period"] == "3mo"


def test_build_top_sector_stocks_isolates_constituent_failure():
    groups = build_top_sector_stocks(
        [{"name": "A"}, {"name": "B"}, {"name": "C"}],
        {"A": "a.csv", "B": "b.csv", "C": "c.csv"},
        constituent_fetcher=lambda filename: [] if filename == "b.csv" else [filename[0].upper()],
        price_downloader=lambda *_args, **_kwargs: pd.DataFrame(),
    )
    assert [group["sector"] for group in groups] == ["A", "B", "C"]
    assert groups[1]["status"] == "provider_limited"
    assert groups[1]["stocks"] == []
    assert "membership" in groups[1]["message"].lower()
```

- [ ] **Step 2: Run the tests and verify the new functions are absent**

```powershell
rtk python -m pytest api/test_sector_rotation_data.py -q
```

Expected: FAIL during import because `fetch_index_constituents` and `rank_relative_momentum` do not exist.

- [ ] **Step 3: Implement official constituent parsing and pure momentum ranking**

Add these constants/functions to `sector_rotation_data.py` and import `yfinance` only in `main.py`:

```python
CONSTITUENT_URL = "https://www.niftyindices.com/IndexConstituent/{filename}"


def fetch_index_constituents(filename, fetcher=requests.get):
    try:
        response = fetcher(CONSTITUENT_URL.format(filename=filename), headers=ARCHIVE_HEADERS, timeout=12)
    except Exception:
        return []
    if response.status_code != 200 or response.content.lstrip().startswith(b"<!DOCTYPE html"):
        return []
    frame = pd.read_csv(BytesIO(response.content))
    if "Symbol" not in frame.columns:
        return []
    return [symbol for symbol in frame["Symbol"].astype(str).str.strip() if symbol and symbol.lower() != "nan"]


def rank_relative_momentum(close_by_symbol, benchmark, limit=3):
    ranked = []
    excluded = 0
    for ticker, closes in close_by_symbol.items():
        aligned = pd.concat([closes.rename("stock"), benchmark.rename("benchmark")], axis=1, join="inner").dropna()
        if len(aligned) < 22:
            excluded += 1
            continue
        window = aligned.tail(22)
        stock_return = (float(window.stock.iloc[-1]) / float(window.stock.iloc[0]) - 1) * 100
        benchmark_return = (float(window.benchmark.iloc[-1]) / float(window.benchmark.iloc[0]) - 1) * 100
        ranked.append({
            "symbol": ticker.removesuffix(".NS"),
            "return_1m": round(stock_return, 2),
            "relative_1m": round(stock_return - benchmark_return, 2),
        })
    ranked.sort(key=lambda row: row["relative_1m"], reverse=True)
    return ranked[:limit], excluded


def _batch_close(frame, ticker):
    try:
        if isinstance(frame.columns, pd.MultiIndex):
            if ticker in frame.columns.get_level_values(0):
                return frame[ticker]["Close"].dropna()
            if ticker in frame.columns.get_level_values(1):
                return frame["Close"][ticker].dropna()
        if ticker == "^NSEI" and "Close" in frame:
            return frame["Close"].dropna()
    except (KeyError, TypeError):
        pass
    return pd.Series(dtype="float64")


def build_top_sector_stocks(
    sector_rows,
    constituent_files,
    constituent_fetcher,
    price_downloader,
    limit_sectors=3,
    limit_stocks=3,
):
    groups = []
    memberships = {}
    for row in sector_rows[:limit_sectors]:
        sector = row["name"]
        filename = constituent_files.get(sector)
        try:
            symbols = constituent_fetcher(filename) if filename else []
        except Exception:
            symbols = []
        memberships[sector] = [f"{symbol}.NS" for symbol in symbols]
        groups.append({
            "sector": sector,
            "status": "pending" if symbols else "provider_limited",
            "stocks": [],
            "excluded": 0,
            "message": None if symbols else "Official index membership is unavailable.",
        })

    requested = sorted({ticker for symbols in memberships.values() for ticker in symbols})
    if not requested:
        return groups
    try:
        batch = price_downloader(
            " ".join(requested + ["^NSEI"]),
            period="3mo",
            group_by="ticker",
            threads=True,
            progress=False,
            auto_adjust=True,
        )
        benchmark = _batch_close(batch, "^NSEI")
    except Exception:
        benchmark = pd.Series(dtype="float64")
        batch = pd.DataFrame()

    for group in groups:
        if group["status"] == "provider_limited":
            continue
        closes = {ticker: _batch_close(batch, ticker) for ticker in memberships[group["sector"]]}
        stocks, excluded = rank_relative_momentum(closes, benchmark, limit=limit_stocks)
        complete = len(stocks) == limit_stocks and excluded == 0
        group.update({
            "status": "complete" if complete else "provider_limited",
            "stocks": stocks,
            "excluded": excluded,
            "message": None if complete else "Some constituent price histories were unavailable.",
        })
    return groups
```

- [ ] **Step 4: Add the exact constituent-file map and one-batch integration**

Extend both branches of the Task 4 import with `build_top_sector_stocks` and `fetch_index_constituents`.

Add `SECTOR_CONSTITUENT_FILES` in `main.py` with all 20 groups. The eight new filenames are:

```python
"Nifty Midcap 100": "ind_niftymidcap100list.csv",
"Nifty Smallcap 100": "ind_niftysmallcap100list.csv",
"Nifty Healthcare": "ind_niftyhealthcarelist.csv",
"Nifty Consumer Durables": "ind_niftyconsumerdurableslist.csv",
"Nifty India Consumption": "ind_niftyconsumptionlist.csv",
"Nifty Oil & Gas": "ind_niftyoilgaslist.csv",
"Nifty Commodities": "ind_niftycommoditieslist.csv",
"Nifty Services Sector": "ind_niftyservicelist.csv",
```

Map the existing 12 to their matching official files (`ind_niftybanklist.csv`, `ind_niftyitlist.csv`, `ind_niftyautolist.csv`, `ind_niftypharmalist.csv`, `ind_niftyfmcglist.csv`, `ind_niftymetallist.csv`, `ind_niftyrealtylist.csv`, `ind_niftyenergylist.csv`, `ind_niftymedialist.csv`, `ind_niftypsubanklist.csv`, `ind_niftyfinancelist.csv`, and `ind_niftyinfralist.csv`).

After sorting sector rows in `_compute_sector_rotation`, call `build_top_sector_stocks(rows, SECTOR_CONSTITUENT_FILES, fetch_index_constituents, yf.download)` only for India. For US responses return `top_sector_stocks=[]` and:

```python
"top_sector_stocks_note": "Top-stock rankings currently use official NSE constituents and are available in India mode."
```

- [ ] **Step 5: Add API response assertions for India and US routing**

In the deterministic India test from Task 4, add before calling `_compute_sector_rotation`:

```python
expected_top = [
    {"sector": "A", "status": "complete", "stocks": [{"symbol": "AAA"}]},
    {"sector": "B", "status": "complete", "stocks": [{"symbol": "BBB"}]},
    {"sector": "C", "status": "provider_limited", "stocks": []},
]
monkeypatch.setattr(main, "build_top_sector_stocks", lambda *_args, **_kwargs: expected_top)
```

After the current assertions add:

```python
assert result["top_sector_stocks"] == expected_top
```

Define the India-only note once in `main.py`:

```python
TOP_STOCKS_INDIA_ONLY_NOTE = (
    "Top-stock rankings currently use official NSE constituents and are available in India mode."
)
```

Use that constant in the US response and add to `test_us_sector_map_defined`:

```python
assert main.TOP_STOCKS_INDIA_ONLY_NOTE == (
    "Top-stock rankings currently use official NSE constituents and are available in India mode."
)
```

The pure integration tests above prove first-three selection, one-batch execution, and isolated membership failure without network access.

Run:

```powershell
rtk python -m pytest api/test_sector_rotation_data.py api/test_sectors.py -q
```

Expected: all focused tests pass.

- [ ] **Step 6: Commit backend top-stock ranking**

```powershell
rtk git add api/sector_rotation_data.py api/test_sector_rotation_data.py api/main.py api/test_sectors.py
rtk git commit -m "feat(sectors): add top stocks for leading groups"
```

---

### Task 6: Render expanded coverage and top-stock cards responsively

**Files:**
- Create: `web/src/lib/sectorRotationContract.test.js`
- Modify: `web/src/pages/SectorRotation.jsx:24-407`
- Modify: `web/src/pages/SectorRotation.css`

**Interfaces:**
- Consumes: API `coverage`, `trend_label`, `top_sector_stocks`, and `top_sector_stocks_note`.
- Produces: incomplete-coverage notice, 20-group links/map, dynamic trend heading, and three responsive top-sector cards below ranking.

- [ ] **Step 1: Write the failing frontend contract**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('../pages/SectorRotation.jsx', import.meta.url), 'utf8');

test('Sector Rotation maps all eight new groups', () => {
  for (const name of [
    'Nifty Midcap 100', 'Nifty Smallcap 100', 'Nifty Healthcare',
    'Nifty Consumer Durables', 'Nifty India Consumption', 'Nifty Oil & Gas',
    'Nifty Commodities', 'Nifty Services Sector',
  ]) assert.ok(source.includes(`'${name}'`), `${name} missing`);
});

test('Top Stocks section renders below ranking and before AI brief', () => {
  const ranking = source.indexOf('Sector strength ranking');
  const stocks = source.indexOf('Top Stocks in Top Sectors');
  const ai = source.indexOf('AI rotation brief');
  assert.ok(ranking >= 0 && stocks > ranking && ai > stocks);
  assert.match(source, /top_sector_stocks/);
  assert.match(source, /provider_limited/);
});

test('Coverage warning and dynamic trend label are rendered', () => {
  assert.match(source, /coverage\.missing/);
  assert.match(source, /trend_label/);
});
```

- [ ] **Step 2: Run it and verify the new map/cards are absent**

```powershell
rtk node --test src/lib/sectorRotationContract.test.js
```

Expected: FAIL for the new group names and Top Stocks section.

- [ ] **Step 3: Synchronize the chart ticker map and coverage UI**

Add the eight new names to `SECTOR_TICKER` with `null` values so `SectorName` deliberately renders honest plain text instead of a broken Chart link. The stock rows added in Step 4 remain chartable. Destructure the new API fields with safe defaults:

```jsx
'Nifty Midcap 100': null,
'Nifty Smallcap 100': null,
'Nifty Healthcare': null,
'Nifty Consumer Durables': null,
'Nifty India Consumption': null,
'Nifty Oil & Gas': null,
'Nifty Commodities': null,
'Nifty Services Sector': null,
```

```jsx
const {
  sectors,
  quadrant_counts: qc,
  leaders,
  laggards,
  benchmark,
  as_of,
  coverage = { expected: sectors.length, available: sectors.length, missing: [] },
  trend_label: trendLabel = 'vs 50-DMA',
  top_sector_stocks: topSectorStocks = [],
  top_sector_stocks_note: topSectorStocksNote,
} = data;
```

Above the RRG card, render when `coverage.missing.length > 0`:

```jsx
<div className="card sr-coverage-warning" role="status">
  Showing {coverage.available} of {coverage.expected} groups. Provider data is unavailable for {coverage.missing.join(', ')}.
</div>
```

Use `trendLabel` in the ranking table header and `s.trend_ref` in desktop/mobile values.

- [ ] **Step 4: Add the Top Stocks section below the ranking card**

```jsx
<div className="card sr-top-stocks-card">
  <div className="sr-card-title">
    <span>Top Stocks in Top Sectors</span>
    <span className="sr-asof">21-session momentum vs Nifty 50</span>
  </div>
  {topSectorStocksNote ? (
    <p className="sr-note">{topSectorStocksNote}</p>
  ) : (
    <div className="sr-top-stocks-grid">
      {topSectorStocks.map((group) => (
        <section className="sr-stock-group" key={group.sector}>
          <h3>{group.sector.replace('Nifty ', '')}</h3>
          {group.stocks.length ? group.stocks.map((stock) => (
            <Link className="sr-stock-row" to={`/chart?symbol=${encodeURIComponent(`${stock.symbol}.NS`)}`} key={stock.symbol}>
              <strong>{stock.symbol}</strong>
              <span className={`tone-${toneOf(stock.return_1m)}`}>{pct(stock.return_1m)}</span>
              <span className={`tone-${toneOf(stock.relative_1m)}`}>vs Nifty {pct(stock.relative_1m)}</span>
            </Link>
          )) : (
            <p className="sr-provider-limited">{group.message || 'Constituent price data is unavailable.'}</p>
          )}
          {group.status === 'provider_limited' && group.stocks.length > 0 && (
            <p className="sr-provider-limited">{group.message}</p>
          )}
        </section>
      ))}
    </div>
  )}
</div>
```

Add CSS:

```css
.sr-coverage-warning { margin-bottom: 16px; padding: 12px 16px; color: var(--primary-gold); border-color: rgba(245, 220, 140, 0.35); }
.sr-top-stocks-card { margin-top: 16px; padding: 18px; }
.sr-top-stocks-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 14px; }
.sr-stock-group { min-width: 0; padding: 14px; border: 1px solid var(--border-hairline); border-radius: 12px; background: var(--surface-tile); }
.sr-stock-group h3 { margin: 0 0 10px; font-size: 14px; }
.sr-stock-row { display: grid; grid-template-columns: minmax(64px, 1fr) auto auto; gap: 10px; align-items: center; padding: 9px 0; color: inherit; text-decoration: none; border-top: 1px solid var(--border-hairline); font-size: 12px; }
.sr-stock-row:hover strong { color: var(--primary-gold); }
.sr-provider-limited { margin: 8px 0 0; color: var(--text-secondary); font-size: 12px; }

@media (max-width: 700px) {
  .sr-top-stocks-grid { grid-template-columns: 1fr; }
  .sr-stock-row { grid-template-columns: minmax(64px, 1fr) auto; }
  .sr-stock-row span:last-child { grid-column: 1 / -1; }
}
```

- [ ] **Step 5: Run focused frontend verification**

```powershell
rtk node --test src/lib/sectorRotationContract.test.js
rtk npx eslint src/pages/SectorRotation.jsx src/lib/sectorRotationContract.test.js
rtk npm run build
```

Expected: contract passes, lint exits 0, and Vite build exits 0.

- [ ] **Step 6: Commit the sector frontend**

```powershell
rtk git add web/src/pages/SectorRotation.jsx web/src/pages/SectorRotation.css web/src/lib/sectorRotationContract.test.js
rtk git commit -m "feat(sectors): show expanded groups and stock leaders"
```

---

### Task 7: Full regression and local browser verification

**Files:**
- Modify only if a verification failure reveals a regression in files already listed above.

**Interfaces:**
- Consumes: completed Tasks 1-6.
- Produces: fresh automated and browser evidence for all four requested fixes.

- [ ] **Step 1: Run all frontend contract/unit tests**

Run from `web`:

```powershell
rtk node --test src/**/*.test.js
```

Expected: every Node test passes with zero failures.

- [ ] **Step 2: Run the relevant backend suite**

Run from repository root:

```powershell
rtk python -m pytest api/test_sector_rotation_data.py api/test_sectors.py api/test_main.py api/test_json_safe.py -q
```

Expected: every selected pytest passes with zero failures and no live provider dependency in unit tests.

- [ ] **Step 3: Run lint, production build, audit, and diff checks**

Run from `web`:

```powershell
rtk npm run lint
rtk npm run build
rtk npm audit --audit-level=high
```

Run from repository root:

```powershell
rtk git diff --check
rtk git status --short
```

Expected: lint/build/audit/diff checks exit 0. Confirm status contains only intended tracked changes plus the user's pre-existing untracked files. Restore generated `web/dist` changes if the repository tracks build output and those files were not intentionally part of the implementation.

- [ ] **Step 4: Start the local app and smoke the four routes/APIs**

Start the established local server with `run_server.py`, wait for its health endpoint, and verify:

```text
/chart?symbol=NVDA
/options
/signals?market=IN
/sectors?market=IN
/api/sectors?market=IN
```

For `/api/sectors?market=IN`, confirm `coverage.expected == 20`, `sectors` is score-sorted, and `top_sector_stocks` contains three group records or explicit provider-limited records.

- [ ] **Step 5: Browser-check desktop and 390x844 mobile**

At desktop and 390x844 verify:

1. Chart appears before Stock Pro/summary data, with no horizontal overflow.
2. Put Selling is green and Call Selling remains red on Option Chain.
3. Actionable Setups appears before Regime Context.
4. Sector Rotation shows Midcap 100, Smallcap 100, the expanded group list, and Top Stocks below ranking.
5. Stock links open Chart Analyser with the correct `.NS` symbol.
6. Provider-limited messages remain visible when deliberately stubbing one constituent group failure.
7. Console contains no uncaught errors.

- [ ] **Step 6: Commit any verification-only correction and record the final SHA**

If verification required a correction, rerun the exact failing command before committing only the affected scoped files:

```powershell
rtk git add api/main.py api/sector_rotation_data.py api/test_sector_rotation_data.py api/test_sectors.py web/src/lib/chartLayoutContract.test.js web/src/lib/marketSignalsOrderContract.test.js web/src/lib/optionChainPresentation.js web/src/lib/optionChainPresentation.test.js web/src/lib/sectorRotationContract.test.js web/src/pages/Chart.css web/src/pages/Chart.jsx web/src/pages/MarketSignals.jsx web/src/pages/OptionChain.jsx web/src/pages/SectorRotation.css web/src/pages/SectorRotation.jsx
rtk git commit -m "fix: resolve market intelligence regression"
rtk git rev-parse --short HEAD
```

If no correction was required, run only `rtk git rev-parse --short HEAD` and report the existing final implementation SHA. Do not deploy.
