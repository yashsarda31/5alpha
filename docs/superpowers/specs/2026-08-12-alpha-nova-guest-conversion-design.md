# Alpha Nova Guest Conversion Design

## Goal

Increase the percentage of signed-out visitors who create an account after seeing credible product value. Repair the desktop guest-page layout, keep the working mobile visual language, and make the journey from public proof to signup to the requested tool feel continuous.

The primary conversion path is:

`Landing page -> guest proof for the requested tool -> signup -> requested tool`

## Approved Direction

Combine both approved approaches:

1. Repair the desktop width, centering, and responsive behavior of the guest gate.
2. Improve the connected guest-to-signup funnel without opening the full terminal to anonymous visitors.

The account gate remains in place. Entry, stop, and target levels remain protected until signup.

## Confirmed Problems

### Desktop gate width

At a 1440-by-900 viewport, the guest gate computes to 1080 pixels wide and begins at the left edge. The root `#root` element is a flex container, while the top-level `.gate` flex item has no rule requiring it to fill the available width. Its intrinsic width therefore leaves a large unused area on the right.

The gate must fill the root width, while `.gate-inner` remains a centered, readable content container.

### Mobile CTA position

At 390-by-844, the primary signup CTA begins roughly 647 pixels from the top. It is visible on that device but falls below the initial viewport on shorter phones such as 375-by-667. A visitor should see the promise, one piece of real proof, and the signup action without needing to discover the CTA by scrolling.

### Journey discontinuity

The gate names the requested tool, but the signup screen falls back to generic account copy. The user is not explicitly told that signup will return them to the tool they requested, even though the routing state already preserves that destination.

### Weak trust continuation

The gate says that wins and losses remain visible but does not link that claim to the public Signal Track Record. The proof claim should have a direct verification path.

### Incorrect empty/error message

When both signal requests fail, the gate currently shows `No qualifying setups yet`. That message describes a successful empty scan, not a data failure. The UI must distinguish unavailable data from a genuine no-qualifying-trade result.

### Landing CTA expectation

`View today's locked setups` sounds like the next screen will open those setups. The next screen is intentionally a preview with protected levels. The CTA should set that expectation before navigation.

## Guest Journey

### Landing page

- Keep the existing visual design, terminal sample, trust section, and secondary `Create free account` action.
- Change the primary Signals action to `Preview today's setups`.
- Continue routing the action to `/signals`.
- Keep the landing preview explicitly labelled as sample data.

### Signals guest gate

The content order is:

1. Alpha Nova brand and existing-user login
2. Tool-specific promise
3. Live or recently published setup proof
4. Primary signup action
5. Trust statement with a public track-record link
6. Account benefits, legal links, and research disclaimer

For `/signals`, the promise should explain the exchange clearly: visitors can inspect the symbol, side, score, publication state, and outcome record before signup; a free account reveals entry, stop, and target levels.

The primary CTA is `Create free account to unlock levels`. Supporting copy remains `Free - no card - 20 seconds` and adds `Continue to Market Signals after signup`.

For non-Signals deep links, retain the existing route-specific preview and destination name. The CTA and signup screen must name the requested destination rather than switching to generic copy.

### Signup page

- Read the preserved `location.state.from` route.
- Use `Unlock Market Signals` for a Signals-origin signup and the corresponding destination label for other gated routes.
- State that the visitor will continue to the requested destination after signup.
- Preserve Google sign-in, email signup, email login, validation, attribution, and pending user intents.
- Do not add new required fields or another onboarding step.

### Post-signup continuation

The existing return-path behavior remains authoritative. A completed signup returns to the full location path, including query string and hash. Watchlist and alert intents continue to be passed through unchanged.

## Responsive Layout

### Desktop and tablet

- `.gate` fills the available root width and cannot shrink to its content width.
- `.gate-inner` remains centered with a constrained reading width.
- Retain the focused two-column composition: proof on the left, conversion card on the right.
- The conversion card remains visible without scrolling at common laptop sizes.
- Large viewports may retain intentional outer margins, but they must be balanced; the current asymmetric empty strip on the right is a failure.

### Mobile

- Use one column with no horizontal overflow.
- Show the promise, at least one proof row or an honest proof state, and the primary CTA within the initial 667-pixel viewport when content is available.
- Place the conversion action before the longer trust and benefits content.
- Respect safe-area insets and retain at least 44-by-44-pixel interactive targets.
- Do not use a persistent overlay that obscures proof, legal text, or browser controls.

## Proof and Error States

The guest proof area has five explicit states:

1. **Loading** - show bounded setup skeletons while neither request has settled.
2. **Live** - show current qualifying setups and label them `Live now`.
3. **Recent** - when the live scan is empty, show the latest published setups with an exact publication date.
4. **Quiet market** - when both successful responses contain no setups, say that no setup currently clears the published quality threshold and offer alerts after signup.
5. **Unavailable** - when both requests fail and no cached proof exists, say that setup data is temporarily unavailable and link to the public track record. Do not call this `No qualifying setups`.

If either source supplies usable proof, render it rather than exposing the other request's failure. Live and recent calls must not be blended without labels.

## Trust and Conversion Copy

- Retain the educational, non-guaranteed tone.
- Add `See the public track record` to the trust panel.
- Keep the distinction between sample landing data and real gate data.
- Do not use guaranteed-return, sure-shot, profit, or wealth promises.
- Present account creation as the way to save research, reveal active levels, and receive alerts—not as payment or a premium tier.

## Analytics

Retain existing signup events and add enough context to diagnose the funnel:

- `Guest Gate Viewed`: path, proof state, and desktop/mobile viewport class
- `Signup CTA Clicked`: path, proof state, viewport class, and CTA location
- Existing `Signup Viewed`, `Signup Submitted`, `Signup Completed`, and `Signup Failed`

Do not send symbols, email addresses, credentials, or other personal data in analytics properties.

## Implementation Boundaries

- Keep changes focused on `Landing`, `GuestGate`, `Login`, access-gate helpers, their styles, and focused tests.
- Reuse the existing router state, destination labels, signal preview endpoints, analytics integration, and design tokens.
- Preserve the guest-gate default and all public-route definitions.
- Preserve unrelated dirty-worktree changes.
- Do not manually edit generated `web/dist` assets; the normal build may regenerate them during verification.
- Do not deploy without a separate explicit request.

## Testing

### Automated contracts

- Prove the gate fills the root flex container and the inner content remains centered.
- Prove the mobile content order places conversion before long-form trust/benefit content.
- Cover loading, live, recent, quiet-market, partial-failure, and unavailable proof states.
- Verify the landing CTA copy and route.
- Verify route-specific signup heading and continuation copy.
- Verify complete return paths and existing watchlist/alert intents remain intact.
- Verify analytics context contains no personal or symbol data.

### Browser verification

Test at:

- 1440 by 900
- 1280 by 800
- 390 by 844
- 375 by 667
- 360 by 800

For each relevant viewport, verify layout centering, CTA visibility, no horizontal overflow, keyboard navigation, 44-pixel targets, correct proof state, and signup return behavior. Check the landing page, Signals gate, one non-Signals deep-link gate, signup page, and public track record.

### Regression verification

- Run the complete frontend Node test suite.
- Run frontend lint.
- Run the production build.
- Run `git diff --check` on the working tree.

## Out of Scope

- Removing the guest gate or granting anonymous terminal access
- Signal scoring, model portfolio, or track-record calculation changes
- New payment or subscription functionality
- Broker integration or trade execution
- Signed-in dashboard, Simple Mode, or Advanced Mode redesign
- Production deployment
