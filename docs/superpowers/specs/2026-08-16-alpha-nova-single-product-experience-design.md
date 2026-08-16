# Alpha Nova Single-Product Experience Design

## Goal

Show every visitor the complete Alpha Nova application immediately and convert
visitors at the two moments where an account adds durable value: saving a
watchlist and enabling browser notifications.

There is no separate guest product, guest landing page, content teaser, or
locked research view. Existing application pages and navigation remain.

## Approved Product Contract

1. Every existing product route remains available.
2. Signed-out and signed-in visitors see the same market data, research,
   signals, levels, dashboards, tables, and tools.
3. Login is requested only when a visitor tries to:
   - save a stock to the server-backed watchlist; or
   - enable browser push notifications.
4. Authentication keeps its existing Google and email/password methods.
5. After authentication, Alpha Nova returns to the exact originating location
   and completes the pending watchlist or notification action.
6. Daily-call participation works device-locally while signed out. A signed-out
   choice does not create a public leaderboard identity.

## Experience Architecture

### One application shell

The root URL and every deep link render the normal `AppLayout`. The sidebar,
mobile navigation, page headers, and page bodies are the standard application
experience regardless of authentication state.

The following guest-only presentation is retired:

- the persistent guest banner;
- the dormant guest-gate and access-gate experiment;
- the guest Watchlist explainer page;
- guest-only Signals portfolio columns and locked active levels;
- the Dashboard signup teaser in place of Today's Call;
- guest-specific Leaderboard banners and empty-state copy;
- `Browsing as guest` account language in Settings; and
- comments, styles, and tests that encode a separate guest product.

Retiring a guest-only implementation does not remove any real site page or
navigation destination.

### Authentication entry points

Signed-out visitors get a compact account action labelled around the actual
benefits, such as `Save watchlist & enable alerts`, rather than a standing guest
warning. Direct `/login` access remains available.

Contextual conversion occurs only at high-intent actions:

- **Watchlist star/add:** preserve the symbol, market, and full return URL; open
  signup; after successful authentication, save the item and return.
- **Enable notifications:** preserve the alert intent and return URL; open
  signup; after successful authentication, request browser permission from a
  user gesture and subscribe the device.

Cancelling or failing authentication leaves the product usable and does not
discard the current page.

## Component and Data Changes

### App shell

`App.jsx` continues routing all non-login paths through `AppLayout`. It removes
the guest banner and replaces guest-labelled account copy with a concise
benefit-led sign-in action.

### Watchlist

The server watchlist remains authenticated because it belongs to a user and is
shared across devices. The standard Watchlist page remains visible while signed
out. A signed-out add/star action creates a pending watchlist intent rather than
calling an endpoint that will return `401`.

After login, the application consumes that intent once, saves the stock through
the existing watchlist endpoint, refreshes watchlist state, and clears the
intent. Duplicate symbols remain harmless through the existing idempotent
backend behavior.

### Notifications

Push subscriptions remain account-backed. Signed-out visitors can see the same
Signals experience but receive no browser permission nudge on page load.
Choosing to enable notifications starts authentication with a pending alert
intent. After login, the existing notification activation path handles browser
permission, device subscription, denial, unsupported browsers, and retries.

### Signals and research

Signals portfolio rows always use the full column set. Entry, stop, target,
weight, and other active fields are not hidden based on authentication. No
research API or UI content is gated merely because the visitor is signed out.

### Today's Call and leaderboard

Today's Call is shown in the Dashboard for everyone. Signed-out choices are
stored locally on the device with the date and choice so refreshes preserve the
interaction. They do not write to the authenticated prediction endpoint or
claim a public rank. Signed-in behavior continues to use the existing server
record and leaderboard identity.

The Leaderboard itself remains public. Its signed-out presentation uses neutral
community copy and does not describe the visitor as a guest.

### Settings and login

Settings presents `Save watchlist & enable alerts` when signed out and the
existing account controls when signed in. Notification controls that write an
account subscription appear after login; selecting the benefit-led action
starts the contextual auth flow.

Login copy names the saved benefit and preserves Google sign-in, email signup,
email login, validation, analytics, and complete return paths. It must not claim
that signup unlocks research content.

## Conversion Principles

- Deliver product value before requesting identity.
- Ask at a demonstrated intent, not on arrival.
- Explain the durable benefit: cross-device watchlist persistence or alerts.
- Use `free`, `save`, and `enable alerts`; avoid `guest`, `unlock research`,
  guaranteed-return language, or artificial scarcity.
- Record conversion-source context without sending symbols, emails, or other
  personal data to analytics.

## Error Handling

- If authentication fails, keep the pending intent and show the existing login
  error so the visitor can retry.
- If the post-login watchlist save fails, return to the originating page, retain
  the symbol intent for a retry, and surface a specific save error.
- If notification permission is denied or unsupported, keep the user signed in
  and explain the browser limitation without looping back to login.
- If local storage is unavailable, Today's Call remains usable for the current
  render but may not survive refresh; the app must not crash.
- Expired or invalid auth restores the signed-out full application rather than
  redirecting to a guest page.

## Testing and Verification

### Focused automated coverage

- all application paths use the normal application shell while signed out;
- no guest gate, guest banner, locked Signals columns, or guest-only page branch
  remains reachable;
- signed-out watchlist intent survives authentication, saves exactly once, and
  returns to the full originating URL;
- signed-out notification intent survives authentication and resumes the
  existing permission/subscription flow;
- full Signals portfolio columns render without a user;
- device-local Today's Call works without authenticated API writes;
- Google and email authentication continue to work; and
- expired authentication falls back to the full app.

### Regression checks

- run the complete frontend Node test suite;
- run focused lint for changed frontend files, noting unrelated baseline debt;
- run the production frontend build;
- run relevant backend auth, watchlist, push, prediction, and leaderboard tests;
- run Python compilation for changed backend modules; and
- run `git diff --check`.

### Browser verification

Exercise the full route inventory while signed out, then verify at desktop and
390-by-844 mobile sizes:

- `/` opens the normal Dashboard;
- navigation exposes every existing page with no guest variant;
- Signals shows complete levels and portfolio fields;
- Watchlist star -> signup/login -> automatic save -> original page;
- enable alerts -> signup/login -> permission/subscription continuation;
- Today's Call works while signed out and survives refresh; and
- no horizontal overflow, blocking banner, or guest-labelled copy remains.

## Boundaries

- Preserve every current product page and navigation destination.
- Preserve unrelated dirty-worktree changes.
- Do not redesign signal logic, scoring, pricing, or market-data providers.
- Do not manually edit generated `web/dist` assets.
- Do not deploy without a separate explicit deployment request.
