# Alpha Nova “X-Ray the Trade” 30-Second Ad Design

## Objective

Create a polished, Apple-inspired 30-second Instagram vertical advertisement for Alpha Nova. The ad targets active Indian traders and converts interest into free account creation without making performance, prediction, or guaranteed-return claims.

The creative must feel materially different from earlier Alpha Nova campaigns built around noise becoming signal, compressed research time, a central intelligence orb, a daily workflow, or the “Don’t Tap Buy Yet” warning format.

## Creative Direction

The approved concept is **X-Ray the Trade**.

A flawless glass monolith initially reveals only a stock price. A precise scanning beam passes through it and exposes three decision layers that most traders miss: the chart setup, the planned levels, and the public outcome history. The layers align into the Alpha Nova mark for the final conversion frame.

The core proposition is:

> Most traders see a price. Alpha Nova helps them see the whole trade.

## Audience and Conversion Goal

- Primary audience: active Indian traders
- Placement: Instagram Reels and Stories
- Primary action: create a free Alpha Nova account
- CTA label: **START FREE →**
- CTA destination: `https://alphanova48.in/login?mode=signup`
- Domain lockup: `alphanova48.in`

## Feature Selection

The film presents three simple, impressive features:

1. **Chart Analyser** — shows the setup and trend structure.
2. **Market Signals** — shows defined entry, stop, and target levels.
3. **Signal Track Record** — shows wins, losses, and open outcomes rather than hiding misses.

Any displayed symbol, price, level, or result is a designed demonstration and must be labelled **Illustrative**. The creative must not imply live market data or investment advice.

## Storyboard and Copy

| Time | Beat | Visual | Copy |
| --- | --- | --- | --- |
| 0.0–4.0s | Hook | A single RELIANCE price floats inside a pristine glass monolith in an infinite white studio. The camera makes a slow macro approach. | **Most traders see a price.** |
| 4.0–9.0s | X-ray reveal | A thin blue scanning plane moves through the monolith. Hidden internal layers become visible without cutting away. | **There’s more underneath.** |
| 9.0–14.0s | Chart Analyser | Candlesticks, a restrained trend curve, and a clean setup zone assemble within the glass. | **See the setup.** |
| 14.0–19.0s | Market Signals | Entry, stop, and target planes lock into position with measured mechanical precision. | **Know the levels.** |
| 19.0–24.0s | Signal Track Record | The monolith rotates to reveal a transparent outcome ledger containing wins, losses, and open positions. | **Check the proof.** |
| 24.0–30.0s | Payoff and CTA | Every internal layer aligns into an Alpha Nova “A” mark. The object settles while the final CTA remains stable. | **See the whole trade.** / **START FREE →** / `alphanova48.in` |

The master timeline ends at exactly 30.0 seconds and holds the final frame. It does not loop automatically.

## Visual System

- Primary composition: native 9:16 at 1080 × 1920.
- Environment: bright infinite studio with a soft horizon and editorial negative space.
- Palette: warm white, precision black, frosted optical glass, restrained electric blue, and minimal cool-grey supporting text.
- Typography: system-based sans serif with large editorial headlines, tight display tracking, and generous spacing. No external font dependency.
- Safe area: essential copy and CTA remain clear of common Reels overlays, with extra protection at the top, bottom, and right edge.
- Motion: continuous camera and object choreography rather than slideshow cuts or generic feature cards.
- Restraint: no excessive particles, neon trading clichés, emojis, fake phone mockups, profit counters, or exaggerated interface chrome.

The style is inspired by Apple’s product-film restraint and material precision without copying Apple assets, layouts, trademarks, or product imagery.

## Three.js Scene

Three.js owns the cinematic world:

- physically shaded central glass monolith;
- frosted shell plus distinct internal feature layers;
- animated scan plane and soft volumetric-light illusion;
- candlestick geometry, trend path, and setup volume;
- entry, stop, and target planes;
- compact outcome-ledger geometry;
- soft contact shadow, studio reflections, and controlled camera movement;
- final geometric alignment into the Alpha Nova mark.

The scene should suggest refraction and optical depth while remaining performant on a modern phone. Expensive effects such as true real-time ray tracing, large post-processing chains, or uncontrolled particle systems are out of scope.

## DOM and GSAP Architecture

The deliverable is a single standalone HTML file with four bounded layers:

1. **Semantic story layer** — every headline, label, CTA, domain, illustrative marker, and disclaimer.
2. **Three.js canvas layer** — cinematic object and depth effects only.
3. **GSAP master timeline** — all scene timing, camera choreography, DOM transitions, and the 30-second completion state.
4. **Fallback layer** — a polished static final frame if WebGL or animation initialization fails.

Three.js and GSAP are embedded into the final file so it runs directly through `file://` with no CDN, sibling asset, font, image, or local-server dependency. The CTA is the only deliberate network navigation.

## Interaction and Accessibility

- The film autoplays once after initialization.
- There are no playback, mute, progress, or replay controls in the social composition.
- The CTA is keyboard focusable and has a descriptive accessible label.
- Important text remains semantic and readable when the canvas is unavailable.
- Reduced-motion mode uses restrained transitions while preserving all six beats and the 30-second final hold.
- Body copy and CTA maintain strong contrast and mobile-readable sizing.

## Failure Handling

- If WebGL is unavailable, show the static branded payoff frame.
- If Three.js or GSAP initialization throws, remove the loading state and reveal the same usable fallback.
- If the viewport changes, recompute canvas size, pixel ratio, camera framing, and safe-area typography without restarting the narrative.
- Clamp device pixel ratio to protect mobile performance.
- The fallback must never expose raw loading text, blank canvas space, or overlapping scene copy.

## Verification

### Structural validation

- Confirm exact headline and CTA copy.
- Confirm the CTA destination.
- Confirm an explicit 30.0-second master duration and non-looping final hold.
- Confirm 9:16 composition metadata and responsive portrait framing.
- Confirm embedded Three.js and GSAP payloads with no unresolved imports.
- Confirm there are no runtime URLs except the CTA.
- Confirm the **Illustrative** label and concise educational disclaimer are present.

### Browser validation

- Open the final artifact directly through `file://`.
- Inspect deterministic frames at the hook, scan, chart, levels, track-record, and CTA beats.
- Check 1080 × 1920 and a smaller phone viewport.
- Confirm no clipped copy, hidden CTA, right-side Reels collision, horizontal overflow, timeline gaps, or console errors.
- Verify normal WebGL, forced CSS fallback, initialization-failure fallback, and reduced-motion behavior.
- Confirm the final frame stays stable after 30 seconds.

### Repository checks

- Run the focused ad validator.
- Run focused script parsing or lint checks for new source files.
- Run the frontend production build to confirm Vite copies the public artifact unchanged.
- Compare source and built artifact hashes.
- Restore unrelated generated `web/dist` churn after verification.
- Run `git diff --check` on the scoped changes.

## Delivery Boundary

- Deliver one standalone HTML ad locally.
- Keep builder, readable template, and validator files scoped to this creative if deterministic packaging requires them.
- Do not change application routes, production pages, or unrelated user work.
- Do not deploy or publish the ad unless the user explicitly asks.

## Acceptance Criteria

- The film feels polished, professional, and materially different from earlier Alpha Nova ads.
- The three features are understandable without narration.
- The hook lands within four seconds and the CTA remains readable through the final six seconds.
- The 30-second timeline is continuous, controlled, and free from generic slideshow behavior.
- The final standalone HTML works offline except for intentional CTA navigation.
- The artifact passes structural, browser, fallback, reduced-motion, and mobile safe-area verification.
