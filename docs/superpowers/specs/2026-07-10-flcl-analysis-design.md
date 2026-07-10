# FLCL Analysis (Floor/Ceiling Regime Engine) — Design

Date: 2026-07-10
Source: improved port of `FLCLindicator.ipynb` (floor/ceiling regime analyzer).
Goal: a high-quality regime-analysis tab traders can actually rely on.

## Why a rewrite, not a port

The notebook has four defects that make its output untrustworthy:

1. **Look-ahead bias.** A swing at bar *i* needs bars up to *i+window* to be
   identified, but the notebook applies the regime flip at bar *i* itself. The
   plotted history shows flips no live trader could have seen at that time.
2. **Broken significance filter.** `min_swing_pct` compares the swing bar to the
   *immediately previous bar* — a meaningless test that arbitrarily discards
   most valid swings.
3. **No swing alternation.** Consecutive same-side swings are all kept, so the
   regime walk reacts to noise.
4. **Levels only ratchet outward.** Ceiling only ever rises and floor only ever
   falls over the whole lookback, so "range position" decays into noise after
   the first few months.

## The improved engine (`_flcl_engine` in api/main.py)

Pure function over an OHLC dataframe → per-bar arrays. Fully **causal**: the
value at bar *t* uses only data ≤ *t* (verified by a prefix-equality test).

- **ATR(14)** (Wilder smoothing) is the volatility yardstick.
- **Swing detection:** bar *i* is a raw swing high/low if it is the strict
  extreme of `[i-w, i+w]` (w = `swing_window`, default 5). The swing is only
  *confirmed* at bar `i+w` — everything downstream keys off confirmation time.
- **Alternation + significance:** confirmed swings feed a zigzag builder —
  same-side swings keep only the more extreme; an opposite-side swing must be
  ≥ `atr_mult × ATR` (default 1.5) away from the previous swing to register.
- **Regime walk** (Bernut-style floor/ceiling):
  - Neutral until first break. Close above the last confirmed swing high →
    **Bullish** (floor := the swing low that preceded the breakout). Close
    below the last confirmed swing low → **Bearish** (ceiling := preceding
    swing high).
  - Bullish: each newly confirmed *higher* swing low ratchets the floor up
    (trailing structure stop). Close below the floor → Bearish.
  - Bearish: each newly confirmed *lower* swing high ratchets the ceiling
    down. Close above the ceiling → Bullish.
  - Ceiling in bull / floor in bear track the latest opposite swing
    (informational resistance/support).
- **Derived:** range position `(close-floor)/(ceiling-floor)`, days-in-regime,
  regime segments with per-segment returns.
- **Honest scorecard:** long-only-in-bull strategy vs buy & hold over the
  visible window, executed at the *next* bar's close after a flip (no same-bar
  fill), plus exposure, flip count, max drawdown both legs. This tells the
  user whether the regime filter added value on this name — the notebook had
  nothing like it.
- **Signals:** position bias, structure-stop suggestion (floor − 0.5×ATR in
  bull), entry-zone / caution / fresh-flip / squeeze notes. Same spirit as the
  notebook's `get_trading_signals`, computed from the corrected levels.

## API

- `POST /api/flcl` `{ticker, days=252 (60–756), swing_window=5 (2–15),
  atr_mult=1.5 (0.5–4)}` — all optional fields `X | None` (Android null
  gotcha). yfinance via `_yf_resolve_history` with period sized to lookback +
  warm-up buffer; engine runs on full history, response returns the tail
  `days` window. 404 unknown ticker, 400 < ~90 sessions. Cached 15 min per
  (ticker, params) in `API_CACHE`; response wrapped in `_json_safe`, numerics
  rounded server-side.
- Response: `ticker, params, candles{dates,open,high,low,close,volume},
  levels{floor[],ceiling[],regime[],range_pos[]}, swings[], flips[],
  current{...}, signals{bias,suggested_stop,items[]}, segments[],
  scorecard{...}`.
- `POST /api/ai/flcl` — Gemini brief over the summary payload (same pattern as
  /api/ai/arima; `_ai_error_report` on failure).

## Frontend

`web/src/pages/Flcl.jsx`, route `/flcl`, label **FLCL Analysis** (Research nav
after Chart Analyser, `ChevronsUpDown` icon), Dashboard NAV_MODULES card,
`HEAVY_ROUTES` (page pulls the Plotly bundle).

- Controls: TickerSearch + Lookback (6M/1Y/2Y/3Y) + Sensitivity (Fast/
  Balanced/Smooth = swing window 3/5/8) + Noise filter (Loose/Standard/Strict
  = 1.0/1.5/2.0 ATR).
- StatGrid: Regime (+days), Price, Floor (+distance), Ceiling (+distance),
  Range Position, Regime Edge (strategy − buy&hold).
- One Plot, two panes: candlesticks + step-line floor (green dash) & ceiling
  (red dash) + swing markers + gold flip diamonds + per-segment regime tint
  rects (price pane only); lower pane = range position area with 20/80 guides.
  Concrete hex only, `autosize:true`, `width:'100%'`, `useResizeHandler`.
- Signals panel (bias badge + reason cards), regime-history table, scorecard
  tiles with a one-line honesty note, ShareButton (`#flcl-analysis`), AI
  insight with `useAutoAiInsight`, inline error banner.

## Testing

`api/test_flcl.py`, fully offline via monkeypatched `_yf_resolve_history`
(test_arima.py pattern): response shape; synthetic uptrend → Bullish and
downtrend → Bearish; **causality** (engine on a prefix == prefix of engine on
full series); param clamps; 404 empty / 400 short history; floor ≤ close
region sanity; segments/scorecard consistency.
