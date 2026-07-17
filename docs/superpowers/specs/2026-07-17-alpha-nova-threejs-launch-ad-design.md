# Alpha Nova Three.js Launch Ad Design

## Goal

Create a 20-second, vertical-first launch film for Alpha Nova at `alphanova48.in`. The ad should feel premium, restrained, and Apple-inspired without copying Apple assets or campaign language. Its retention hook is a satisfying transformation from chaotic market noise into one clear, risk-defined signal.

The primary delivery format is 9:16 for Instagram Reels and YouTube Shorts. The same page must remain presentable on landscape and desktop screens.

## Creative Direction

The film follows a single visual idea: **Noise becomes signal**.

| Time | Story beat | Visual treatment | On-screen copy |
| --- | --- | --- | --- |
| 0.0-3.0s | Hook | A dark field of luminous market particles rushes toward the viewer. A few red and green data fragments cut through the field. | `The market gives you noise.` |
| 3.0-7.0s | Transformation | The particles slow, orbit, and organize into a clean price curve and a glowing market-regime sphere. | `Alpha Nova finds the signal.` |
| 7.0-12.0s | Product system | A translucent terminal card forms in depth. Three stages appear in sequence. | `REGIME` -> `SIGNAL` -> `RISK` |
| 12.0-16.0s | Payoff | One clearly labelled example setup locks into focus with conviction, entry, stop, and target. A subtle pulse confirms the plan. | `ONE SETUP. A DEFINED PLAN.` |
| 16.0-20.0s | Brand and CTA | The interface dissolves into the Alpha Nova mark and wordmark. The particles begin returning to their opening positions to make replay feel continuous. | `See the market. Read the signal.` / `See today's signals` / `alphanova48.in` |

The setup must be visibly labelled `EXAMPLE` so the advertisement does not imply a live recommendation or guaranteed return. No profit claims, fabricated user counts, or urgency tricks will appear.

## Visual System

- Near-black background with soft graphite gradients.
- White typography, restrained electric blue, and small green/red market accents.
- Large amounts of negative space, shallow depth of field, glass-like surfaces, and smooth spring-free motion.
- Alpha Nova's existing logo asset is used as supplied. The app's current restrained terminal language informs the product card.
- Typography uses the native system stack so the page remains lightweight and visually consistent across Apple and non-Apple devices.
- Motion is cinematic and legible rather than dense: one focal action per beat.

## Technical Architecture

The deliverable is a standalone static page at:

`web/public/alpha-nova-launch-20s-ad.html`

It will be copied into the Vite production output without changing the React application or its routes.

The page contains four isolated layers:

1. **Three.js canvas** - particle field, regime sphere, price curve, depth, camera motion, and the final logo convergence.
2. **DOM story layer** - crisp typography, product card, example setup, CTA, progress indicator, and controls.
3. **Timeline controller** - one `requestAnimationFrame` clock that owns every beat, supports replay, and targets exactly 20 seconds.
4. **Optional audio layer** - a small synthesized cinematic sound bed created with Web Audio after user interaction. The film works fully without sound and starts muted.

Three.js will load as an ES module from a version-pinned CDN URL. If it fails or WebGL is unavailable, the DOM timeline and a lightweight CSS particle treatment continue so the message is never blank.

## Interaction and Playback

- The initial screen shows a clean `Play 20s film` control because browsers restrict audio and autoplay.
- Playback can be restarted at any time.
- A mute control is available after playback begins.
- The CTA links to `https://alphanova48.in/signals`.
- The page includes a discreet time/progress indicator useful for capture and review.
- Keyboard users can operate Play, Replay, Mute, and CTA controls.

## Responsive and Accessibility Behavior

- The composition is authored around a 9:16 safe area, with all critical copy kept inside the central 80% to avoid Reels UI overlays.
- On wide screens, the vertical stage remains centered and gains ambient side gradients rather than stretching the composition.
- On small phones, typography and the product card scale with `clamp()` while preserving the story hierarchy.
- `prefers-reduced-motion` replaces camera travel and particle rushes with short fades while keeping the same 20-second narrative order.
- Text contrast meets WCAG AA. Canvas visuals are decorative; the story remains available in semantic DOM text.

## Performance Boundaries

- Cap device pixel ratio at 2.
- Use one shared particle geometry and one material; avoid per-frame allocations.
- Lower particle count on mobile or low-core devices.
- Pause animation when the page is hidden and resume without jumping the timeline.
- Avoid external video, image sequences, fonts, and large audio downloads.

## Verification

Implementation is complete when:

- The film reaches its CTA at 20 seconds with no scene gaps.
- The 9:16 composition works at 360x640, 390x844, and 1080x1920.
- The responsive fallback works at 1440x900.
- Play, mute, replay, and CTA controls work with mouse and keyboard.
- The CSS fallback still communicates every story beat if Three.js is blocked.
- Reduced-motion mode remains readable and avoids high-velocity movement.
- `npm run lint` and `npm run build` pass in `web`.
- The built file exists in `web/dist` and references no missing local assets.

## Scope

This work adds the standalone launch-ad page only. It does not redesign the Alpha Nova product, add a new React route, deploy to production, or promise viral performance. The creative is engineered for short-form retention through a fast hook, transformation payoff, readable proof, and replay-friendly ending.
