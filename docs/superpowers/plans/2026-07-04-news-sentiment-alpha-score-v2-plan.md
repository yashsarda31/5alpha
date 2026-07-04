# News Sentiment + Alpha Nova Score v2 — Implementation Plan

**Spec:** `docs/superpowers/specs/2026-07-04-news-sentiment-alpha-score-v2-design.md`

## Phase 1 — Sentiment backend
1. `api/requirements.txt`: add `vaderSentiment`.
2. `api/main.py` (near the news endpoint): guarded import + module analyzer with
   `FINANCE_LEXICON` update; `_news_sentiment(text)` → `{score 0-100, label}`;
   wire per-article `sentiment` + top-level `sentiment_summary` into `get_news`.

## Phase 2 — Alpha Nova Score v2 backend
1. Replace `_alpha_nova_score_lite` with `_alpha_nova_score(price, eps, pe, growth_pct,
   rev_growth_pct, roe_pct, margin_pct, dte_pct, div_pct)` per spec pillar table
   (renormalize over available pillars, clamp 5-99, None when nothing available).
2. Screener: pass the extra `info` fields it already reads (ROE, margins, D/E, revenue growth).
3. `/api/dcf/data/{ticker}`: add `alphaScore` from the same `info` pull.

## Phase 3 — Frontend
1. `News.jsx`: sentiment summary strip (score, Badge label, ▲—▼ counts) + per-article badge.
2. `Dcf.jsx`: header shows `stockData.alphaScore ?? 'N/A'`; delete the duplicated JS formula.

## Phase 4 — Tests
`api/test_sentiment.py` (direction, bounds, summary, finance-lexicon presence) and
`api/test_alpha_score.py` (compounder ≥ 65, value trap ≤ 45, renormalization, None, bounds grid).

## Phase 5 — Ship
pytest all suites → `npm run build` → browser check News + DCF against prod API →
commit → `npx vercel --prod --yes` → prod verify (news sentiment fields when key present:
verify shape via a mocked-key 400 path or lexicon unit only; screener alphaScore sanity on prod).
