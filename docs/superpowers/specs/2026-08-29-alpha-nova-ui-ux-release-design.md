# Alpha Nova UI/UX Completion and Release Design

## Goal

Complete and release the approved Alpha Nova UI/UX improvements so the live
product behaves as a trustworthy daily decision tool on desktop and mobile.
The release builds on the already-implemented trust and usability phase rather
than redesigning the terminal or changing its research-only contract.

## Approved Product Direction

Alpha Nova remains a complete public terminal. The core journey is:

1. Today explains the current market state and the next useful action.
2. Signals presents qualifying setups, no-trade states, and evidence freshness.
3. Analyse helps the user inspect one symbol.
4. Watchlist makes the workflow durable, with contextual authentication only
   when cross-device persistence or browser alerts are requested.

Specialist research routes remain available. No paywall, pricing, model
promotion, trading execution, or return claim is introduced.

## Current State

The local `main` branch already contains the first trust/usability phase:

- evidence-aware signal outcomes and fail-closed data gates;
- shared data-status and provenance presentation;
- mobile setup cards and progressive disclosure;
- first-run workflow guidance;
- privacy-safe product activation events;
- readable compliance acknowledgement; and
- preserved contextual authentication intent.

The reviewed production UI did not expose all of that current local behavior.
This pass completes the remaining presentation work, verifies the combined
tree, and deploys it to the existing Alpha Nova production project.

## Alternatives Considered

### A. Deploy the existing local tree unchanged

This would release substantial improvements quickly, but it would leave the
remaining problems observed in production: competing Today-page priorities,
large mobile alert overlays, redundant mobile navigation, a weak watchlist
empty state, and small or non-semantic controls.

### B. Full visual redesign

This could produce a new brand expression, but it adds migration risk and would
discard a coherent terminal design that already works. It would also delay the
trust and mobile improvements that are ready for release.

### C. Focused completion and release — selected

Preserve the current visual system and analytical routes, finish the remaining
high-impact interaction and accessibility gaps, run the complete release gate,
and deploy the combined result. This gives users the largest practical gain
without an unrelated rewrite.

## Today Page

The default reading order is:

1. page title, market-session state, and data timestamp;
2. market regime and lead-index pulse;
3. priority setups or an explicit no-trade state;
4. one next-action row linking to Signals, Analyse, and Position Sizing;
5. the user's watchlist or first-run workflow; and
6. supporting movers, macro data, and learning/game surfaces.

Priority setups move above watchlist onboarding. The page must answer, within
one initial desktop viewport or approximately two mobile viewports: what is the
market state, is there a qualifying setup, and what should the user inspect
next? Existing market data and analytical sections are preserved.

## Signals Page and Freshness

The already-implemented data-status component is the single trust summary for
Signals. It distinguishes live/latest-session data from stale cached data and
shows observation time, source, session state, and warnings. Cached content may
render immediately, but the UI must label it while a refresh is in progress and
must not silently present it as current.

On mobile, actionable setups use cards that expose symbol, side, Quality Score,
entry, stop, target, and Analyse action without horizontal scrolling. Model
methodology and execution-policy copy move behind a clear `How scoring works`
disclosure. Detailed regime, volatility, options, buildup, structure, and
portfolio content remains available through accessible progressive disclosure.

## Alert Presentation

In-app signal alerts remain available to signed-out visitors as a product
demonstration, but they must not obscure the page header or duplicate several
setups at once.

- Display at most one toast at a time.
- Use a five-second lifetime.
- On mobile, position the toast below the top bar and above the bottom tab bar.
- Keep symbol, side, score, and a concise risk summary; detailed levels remain
  on Signals.
- Preserve dismiss and open-Signals actions.
- Do not replay a setup already marked as seen for the same session.

## Navigation

Desktop retains the four-item daily workflow and expandable specialist tools.
The `More tools` summary receives a visible chevron and expanded state.

Mobile uses the bottom tab bar as the primary navigation. The `More` tab opens
an accessible sheet containing:

- a tool search field;
- Recent tools stored device-locally;
- the existing Market Context, Research, and Play & Learn groups; and
- account/settings actions at the end of the scroll area.

The separate mobile hamburger is removed to avoid two controls opening the same
navigation. The sheet traps focus, closes with Escape or the backdrop, restores
focus to `More`, and never allows the signup action to cover tool links.

## Watchlist Empty State

The empty Watchlist becomes an actionable starter state. It includes:

- a short explanation of device-local tracking and optional account sync;
- suggested NSE and US symbols appropriate to the selected market;
- one-tap addition through the existing watchlist behavior; and
- a link to choose from Today’s movers.

Suggestions are examples, not recommendations, and use neutral wording. The
state does not create symbols without an explicit user action.

## Conversion and Compliance

The bright signup action is retained only where it explains durable value. The
Settings control no longer repeats the full signup message when signed out; it
uses a neutral `Settings` label. Contextual watchlist and alert actions continue
to preserve the originating route and pending intent.

The full compliance notice remains visible until acknowledged. Its close and
`View notice` controls meet touch-target requirements. Alert and signup chrome
must not cover the notice.

## Accessibility and Readability

- Page titles render as one semantic `h1` per route.
- Section titles render at the appropriate heading level.
- Sortable table headers use keyboard-operable buttons, expose `aria-sort`, and
  retain visible focus.
- Interactive controls have a minimum 44 by 44 CSS-pixel target on mobile.
- Essential text is at least 14px; metadata is at least 12px.
- Side and status never rely on colour alone.
- Drawers, disclosures, toasts, and status changes retain accessible names and
  appropriate live-region behavior.
- Desktop and mobile keep visible focus and reduced-motion support.

## Architecture

The pass stays within existing boundaries:

- `Dashboard.jsx` and `Dashboard.css` own Today ordering and next actions.
- `MarketSignals.jsx`, its focused components, and `MarketSignals.css` own
  Signals hierarchy and methodology disclosure.
- `SignalAlertProvider.jsx`, `ToastStack.jsx`, and `alerts.css` own toast
  queuing and placement.
- `App.jsx` and shared navigation styles own the mobile More sheet.
- `Watchlist.jsx` and `Watchlist.css` own suggested-symbol empty states.
- shared UI components own headings, tables, focus, and touch targets.

No new state service, design system, route, provider, or backend schema is
introduced for this completion pass.

## Error Handling

- Missing or malformed Signals freshness remains provider-limited and
  fail-closed.
- Tool-search failure cannot block navigation because filtering is local.
- Blocked local storage disables Recent tools without hiding the tool list.
- A failed suggested-symbol add leaves the empty state intact and displays the
  existing watchlist error treatment.
- Toast dismissal or navigation failure cannot block the underlying page.
- If production data is unavailable during verification, the UI must show its
  explicit unavailable state; deployment is not called successful on the basis
  of cached analytical content.

## Test-First Implementation

Add failing frontend contracts before production edits for:

- Today ordering and next-action links;
- one-at-a-time, five-second alert presentation;
- mobile More-sheet search, focus, and non-overlapping footer behavior;
- suggested-symbol watchlist empty state;
- semantic page and section headings;
- keyboard-operable sortable headers with `aria-sort`;
- minimum mobile target styles; and
- Signals methodology disclosure and mobile risk-field visibility.

Existing trust, signed-in-account, single-product, Signals, chart, watchlist,
and activation contracts remain green. Backend behavior is unchanged except for
any defect revealed by the existing complete release suite.

## Verification and Deployment

Before deployment:

1. run focused new frontend tests and the complete frontend test suite;
2. run frontend lint, production build, and high-severity dependency audit;
3. run the complete backend suite excluding the explicit live-provider file;
4. run Python compilation and whitespace checks;
5. start the local API and run the live-provider tests;
6. inspect signed-out desktop and 390x844 Today, Signals, Analyse, Watchlist,
   More tools, compliance, and signup flows; and
7. confirm no page overflow, console error, or failed essential request.

After those gates pass, deploy to the existing Vercel `5alpha_v2` production
project. Verify the canonical domain and representative frontend/API routes,
then repeat desktop/mobile smoke checks against production. Do not push to a
remote repository unless separately requested.

## Completion Criteria

The release is complete only when:

- Today prioritizes market state, setups/no-trade, and next action;
- Signals clearly labels freshness and exposes risk fields without mobile table
  scrolling;
- mobile alerts no longer cover primary content;
- mobile has one primary navigation model with searchable specialist tools;
- the empty watchlist offers explicit, neutral starter actions;
- headings, sortable tables, and touch targets meet the specified contract;
- all automated and browser gates pass locally;
- the Vercel production deployment is Ready; and
- the canonical live routes reproduce the verified desktop/mobile behavior.

## Boundaries

- Preserve all specialist routes and analytical data.
- Preserve the public research-only contract and contextual authentication.
- Do not add trading execution, pricing, checkout, entitlement, or a paywall.
- Do not promote or weaken model-validation gates.
- Do not alter unrelated `OpenBB/`, `nourishfit/`, `sales-momentum/`, local ad
  assets, webinar collateral, `.tmp/`, or `.ui-audit/` content.
