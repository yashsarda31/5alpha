# Alpha Nova signed-in account UX audit and repair

## Purpose

Find and repair UI/UX defects in the signed-in Alpha Nova experience without changing the public-terminal product direction. The account remains optional and is used for cross-device watchlists, browser alerts, and account preferences.

## Scope

The audit covers the live `alphanova48.in` experience using one new, disposable email-and-password account, then validates repairs against an isolated local account. It includes desktop and 390 x 844 mobile flows for:

- account creation, login, invalid-login feedback, and logout;
- session restoration and revoked/stale-session behaviour;
- saved watchlist add, remove, and persistence after refresh;
- Settings account state, notification controls, and alert setup feedback;
- post-login return paths for pending watchlist and notification actions;
- keyboard navigation, focus visibility, dialog dismissal, readable errors, and touch-target/layout behaviour.

Google OAuth, real push permission delivery, and email verification are excluded because they require a real identity or browser/device permissions outside the disposable-account test boundary. Their visible fallback states remain in scope.

## Audit method

1. Create an isolated disposable live account and reproduce each signed-in flow on the production app at desktop and mobile sizes.
2. Record reproducible defects with route, viewport, steps, expected result, observed result, and affected component boundary.
3. Trace each defect to its root cause in the frontend state, route hand-off, API boundary, or responsive layout. Compare it with a working in-app pattern before choosing a repair.
4. Write a focused failing regression test for every code repair, then make the smallest root-cause change needed to pass it.
5. Repeat the affected local flow with an isolated account, then run the frontend test suite, lint, production build, backend checks, and rendered browser checks at desktop and 390 x 844.

## Behaviour rules

- Authentication must remain contextual: browsing and analysis stay public; account prompts appear only when saving a watchlist or enabling alerts.
- A successful login returns the user to the originating route, including its query/hash and pending action.
- Failed account actions explain the problem and leave the user a safe retry or dismissal path.
- Logout clears only the test account’s local session and returns the terminal to a coherent signed-out state.
- Repairs preserve unrelated worktree files and do not deploy to production in this task.

## Acceptance criteria

- All scoped flows work without console/page errors or horizontal overflow at desktop and 390 x 844.
- Focus can reach and visibly identify all account controls; dialogs close with Escape and do not block keyboard use unexpectedly.
- Watchlist and notification continuation states either complete successfully or present a clear retryable error.
- Each repaired defect has a regression test that failed before its implementation and passes afterward.
- The complete relevant automated checks and rendered-flow verification pass before handoff.
