# News Sentiment + Alpha Nova Score v2 — Design

**Date:** 2026-07-04
**Status:** Approved
**Features:** (1) keyless finance-tuned sentiment scoring on the News tab; (2) multi-factor rebuild of the Alpha Nova Score used by the screener and DCF header.

## Decisions (from brainstorm)

| Question | Decision |
|---|---|
| Sentiment method | Server-side lexicon (VADER + finance vocabulary), keyless, always-on |
| Alpha model | Multi-factor 0-100 (Value 30 / Quality 30 / Growth 25 / Yield 15), missing pillars renormalize; momentum stays a separate column |

---

## Feature 1 — News sentiment

### Backend (`api/main.py`, extend `/api/news/{ticker}`)

- New dependency: `vaderSentiment` (pure Python; add to `api/requirements.txt`).
- Module-level analyzer with `analyzer.lexicon.update(FINANCE_LEXICON)` — a ~60-term
  finance vocabulary on VADER's −4..+4 scale, e.g. `beats +2.5, upgrade +2.2, breakout +1.8,
  buyback +1.5, record +1.5, outperform +2.0, downgrade −2.5, miss −2.0, probe −2.2,
  fraud −3.2, layoffs −1.8, recall −1.8, default −2.8, bankruptcy −3.4, plunge −2.4 …`
  (full list finalized in code; both cased and lowercase forms handled by VADER's lowercasing).
- `_news_sentiment(text) -> {"score": int 0-100, "label": str}`:
  VADER `compound` ∈ [−1, 1] mapped to `round((compound + 1) * 50)`;
  label `Bullish` if score ≥ 60, `Bearish` if ≤ 40, else `Neutral`.
- Each returned article gains `"sentiment"` computed on `title + ". " + (description or "")`.
- Response gains top-level `"sentiment_summary"`:
  `{score, label, positive, neutral, negative, n}` — mean of article scores, same label
  thresholds, counts by per-article label. Empty article list → `sentiment_summary: null`.
- Failure isolation: analyzer import/failure is caught at module load; if unavailable,
  articles are returned exactly as today (no `sentiment` keys) and summary is null.

### Frontend (`web/src/pages/News.jsx`)

- Summary strip (a `panel`) between the search form and the feed, shown when
  `sentiment_summary` exists: large 0-100 score, Bullish/Neutral/Bearish `Badge`
  (tone gain/dim/loss), and a `6▲ 2— 2▼` count readout.
- Per-article: small sentiment badge (score + arrow) beside the source name; absent
  when the article has no `sentiment` key.

---

## Feature 2 — Alpha Nova Score v2

### Model (`_alpha_nova_score`, replaces `_alpha_nova_score_lite`)

Inputs (all optional except price/eps for the Value pillar): `price, eps, pe, growth_pct
(EPS growth %), rev_growth_pct, roe_pct, margin_pct, dte_pct (debt/equity %), div_pct`.

| Pillar | Max | Scoring |
|---|---|---|
| Value | 30 | Margin of safety from the existing two-stage EPS model (10y at clamp(growth, 2-50%), 10y terminal 4%, 11% discount): `mos = (fv − price)/fv` mapped linearly from −50%→0 pts to +50%→22 pts (clamped). PEG bonus: `pe/growth < 1.5` → up to 8 pts (8 if PEG ≤ 1.0, 4 if ≤ 1.5). Requires price > 0 and eps > 0; otherwise pillar unavailable. |
| Quality | 30 | ROE %: ≥25→14, ≥15→10, ≥10→6, >0→3, else 0. Profit margin %: ≥20→8, ≥10→5, >0→2. Debt/equity %: <50→8, <100→5, <200→2, else 0. Pillar available if ANY input present; missing sub-inputs score 0 within the pillar only when at least one other sub-input exists — if all three are None the pillar is unavailable. |
| Growth | 25 | EPS growth %: ≥25→15, ≥15→11, ≥8→7, >0→4, else 0. Revenue growth %: ≥15→10, ≥8→6, >0→3. Availability rule as Quality. |
| Yield | 15 | Dividend yield %: ≥3→15, ≥1.5→10, ≥0.5→6, >0→3, 0/None→pillar unavailable when None; a true 0 yield scores 0 but counts as available. |

Final: `score = 100 × earned / available_max` over available pillars, rounded,
clamped to [5, 99]. All four pillars unavailable → `None` (screener shows N/A, as today).

### Call sites

- **Screener** (`/api/screener`): reads the extra fields it already has in `info`
  (`returnOnEquity`, `profitMargins`, `debtToEquity`, `revenueGrowth`) and passes them in.
  Column name (`alphaScore`) and `min_alpha_score` filter behavior unchanged.
- **DCF** (`/api/dcf/data/{ticker}`): response gains `"alphaScore"` computed server-side
  from the same `info` pull. `Dcf.jsx` header displays `stockData.alphaScore ?? 'N/A'`
  and the duplicated JS formula (and its `predictability` input) is deleted.
  The header score becomes a stable per-ticker number — it no longer reacts to the
  user's DCF slider assumptions (accepted trade-off for one-model consistency).

---

## Error handling

- Sentiment: any per-article scoring exception → that article ships without `sentiment`.
- Alpha v2: any malformed input treated as None (pillar availability rules absorb it).
- No new endpoints; existing error paths (news 401/400, screener per-ticker skip) unchanged.

## Testing

- `api/test_sentiment.py`: bullish headline ("beats estimates, raises guidance") scores > 60;
  bearish ("fraud probe, shares plunge") < 40; neutral factual line ~40-60; bounds 0-100;
  summary counts/label; finance terms present in analyzer lexicon (e.g. plain VADER
  wouldn't know "buyback").
- `api/test_alpha_score.py`: growth compounder (high ROE/margins/growth, PE 30, no div)
  scores ≥ 65; leveraged value trap (low PE, no growth, D/E 250%, thin margins) ≤ 45;
  partial data renormalizes (Quality-only stock scored out of 30 → ×100/30);
  all-None → None; bounds [5, 99] over an input grid.

## Out of scope

- No Gemini/AI sentiment (existing per-tab AI buttons unaffected).
- No momentum pillar in the alpha score (separate column remains).
- No sentiment persistence/history — computed per request only.
