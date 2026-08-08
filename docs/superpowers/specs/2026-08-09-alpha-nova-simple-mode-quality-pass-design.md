# Alpha Nova Simple Mode Quality Pass Design

## Goal

Make Simple Mode feel clear, calm, and dependable across the full app while preserving Alpha Nova's existing data, routes, and terminal character. The Signals page should lead with actionable setups and place supporting trust copy below the setups, as requested.

## Scope

- Keep this pass limited to Simple Mode; do not simplify or redesign Advanced Mode.
- Move the Signals promise card and inline trust statement below the actionable-setups table and its methodology footnote.
- Fix new signups remaining in Advanced Mode until the first reload.
- Give the Chart Analyser page a semantic level-one heading.
- Bring primary navigation and dismiss controls toward a 44-by-44-pixel minimum target.
- Make the mobile navigation drawer keyboard-operable, focus-managed, and correctly described to assistive technology.
- Preserve all existing routes, data fields, market behavior, signal calculations, and signup gates.
- Do not deploy without a separate request.

## Confirmed Problems

### New-user mode state

`Login.jsx` writes the Simple Mode preference directly to local storage after signup. The already-mounted `UiModeProvider` does not observe that write, so the user lands in Advanced Mode until reload.

The signup flow should set the mode through the provider's `setMode` API. The storage helper remains responsible for deciding whether a genuinely new user should start in Simple Mode; existing explicit choices must not be overwritten.

### Signals information hierarchy

The current page places a large promotional promise and a trust strip before the actionable setups. This delays the content the user came to inspect and makes the top of the page read like marketing rather than a decision surface.

The approved order is:

1. Page identity, market state, and refresh controls
2. Actionable setups heading and sharing action
3. Setups table and methodology footnote
4. Risk-defined-setups promise card
5. Published-levels trust statement
6. Existing downstream Signals analysis and sections

The copy, links, and behavior stay unchanged; only their placement changes.

### Chart heading semantics

The visible `Chart Analyser` title is a styled span. It should render as the page's `h1` without changing its appearance.

### Primary control sizing

The mobile menu button, disclaimer dismiss button, mode switch, and sidebar navigation rows currently fall below the intended comfortable touch target. Their interactive boxes should reach at least 44 pixels in the relevant dimension while preserving the present visual density through internal icon sizing and spacing.

### Mobile drawer behavior

When opened, the drawer should:

- expose dialog/navigation semantics and an accessible name;
- move focus to the first useful drawer control;
- close on Escape and backdrop activation;
- keep keyboard focus inside while open;
- restore focus to the menu button after closing;
- continue preventing background scrolling.

The desktop sidebar remains unchanged apart from shared target-size improvements.

## Design Direction

The pass follows a content-first product hierarchy: the user's task appears before persuasion, state is explicit, controls have generous hit areas, and visual emphasis is reserved for the most important action. It retains the existing dark terminal aesthetic rather than introducing a new design language.

No content is hidden behind progressive disclosure in this pass. Dense downstream Signals analytics remain available because the user approved the focused correction rather than a broader restructuring.

## Implementation Boundaries

- Prefer existing UI primitives and CSS tokens.
- Keep the Signals reordering within `MarketSignals` and its existing stylesheet.
- Use `UiModeContext` as the single source of truth for the active mode.
- Add drawer behavior inside the existing app shell rather than introducing a second navigation implementation.
- Avoid changes to generated `web/dist` files until the normal production build regenerates them during verification.
- Preserve unrelated changes in the dirty worktree.

## Testing

- Add or update a focused signup-flow test proving a new signup enters Simple Mode immediately without reload and does not overwrite an existing explicit choice.
- Add a Signals structure test proving the actionable setups and footnote precede both trust elements.
- Add a Chart contract check for one semantic `h1`.
- Add app-shell tests for Escape close, focus entry, focus containment, focus restoration, and drawer semantics.
- Verify primary interactive target dimensions in desktop and mobile browser sessions.
- Re-run all Simple Mode routes on desktop and mobile, checking navigation, interaction, horizontal overflow, and console errors.
- Run the complete frontend Node test suite, lint, production build, and `git diff --check`.

## Out of Scope

- Advanced Mode redesign
- Signal model, scoring, portfolio, or API changes
- Removing or collapsing the downstream Signals analytics
- New routes or navigation categories
- Billing, Vercel firewall, OAuth, or Blob-persistence changes
- Production deployment
