# Guest Mode + Conversion-First Auth — Design

**Date:** 2026-07-10
**Problem:** ~1000 visitors reached 5alphav2.vercel.app and zero converted to free accounts.
**Root cause:** `ProtectedRoute` wraps the entire app — every anonymous visitor is redirected
to a bare login card with no product preview, login-first copy ("Institutional Access",
"Login to Terminal"), signup hidden as a footer text link, and no mention that accounts are free.
Visitors bounce without ever seeing a chart, signal, or price.

## Goal

Let visitors experience the live product immediately (the data APIs are already public),
then convert them at moments of intent — saving a stock, playing Today's Call, enabling
alerts — instead of at a cold wall.

## Approach chosen

Open the app shell to guests + rework `/login` into a signup-first page with a value
proposition. Rejected alternatives: a separate marketing landing page (slower, still hides
the product) and blur/teaser paywalling (more code, gimmicky). The live terminal is the pitch.

## Changes

### 1. App.jsx — open the shell
- Remove the `ProtectedRoute` redirect; `AppLayout` renders for guests. `/login` stays.
- **GuestBanner** (new, in `.content` above `Disclaimer`): shown when `!currentUser && !loading`,
  dismissible per-session (`sessionStorage alphanova_guest_banner_dismissed`).
  Copy: "You're exploring Alpha Nova as a guest — create a free account to save your
  watchlist and get live signal alerts." Button → `/login?mode=signup`.
- Sidebar footer (guest only): gold **Create free account** button above the Settings gear.
  Settings stays available (Gemini key is localStorage, useful to guests).

### 2. Login.jsx — conversion-first auth
- `?mode=signup` (or router state) opens in signup mode; direct `/login` visits stay
  login-first (that traffic is returning users — guests now land on the dashboard).
- Signup copy: title "Create your free account", subtitle "Full access · no credit card",
  submit button "Create free account". Login mode: "Welcome back".
- 3–4 value bullets shown in signup mode (live F&O signals + alerts, AI research tools,
  watchlist across NSE/US, published signal track record).
- "Explore the terminal first →" link to `/dashboard` for visitors who aren't ready.
- After auth, navigate to `state.from` if present, else `/dashboard`.

### 3. Contextual signup moments
- **WatchlistStar**: guest click navigates to `/login?mode=signup` (passes `state.from`)
  instead of firing a doomed 401 optimistic write.
- **Watchlist page**: guest sees an empty-state card ("Your watchlist lives in your free
  account") with a signup CTA instead of the add form.
- **SettingsSheet**: guest Account section shows "Browsing as guest" + signup/login button
  (no undefined email / Sign Out); notifications section hidden for guests (subscribe
  endpoints require auth).
- **Dashboard Today's Call**: already self-hides for guests (context returns null) — as a
  follow-up conversion surface it could show a teaser CTA, kept minimal: skip for now.

### 4. SignalAlertProvider — guest safety
- Notification nudge suppressed for guests (permission-before-value is itself friction).
- Push auto-subscribe on mount gated on `currentUser` (its POST would 401).
- Signal polling/toasts keep working for guests — live toasts are a demo of the product.

## Not changing
- Backend: none of this needs API changes; personal endpoints already 401 correctly.
- Logged-in experience: identical except the banner never shows.

## Risks / mitigations
- Guests hitting personal endpoints → audited all contexts; they already no-op without a token.
- SW/cached clients: pure frontend change, normal deploy; sw.js network-first navigations pick it up.

## Verification
- Local `vite preview` (web-dist, prod API proxy): guest lands on Dashboard, no console
  errors / failed requests; banner + CTAs render; star click routes to signup; login and
  signup round-trips still work; logged-in user sees no banner.
- Deploy, re-verify on prod.

## Success criteria
Visitor → free-user conversion becomes measurable via `/api/admin/metrics` new-user counts;
qualitatively, an anonymous visit shows the live product within one paint.
