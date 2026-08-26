# Alpha Nova Market Domino Ad Design

## Goal

Create a premium 30-second Instagram Reel that attracts active Indian traders to Alpha Nova. The creative must feel Apple-inspired, clearly relate to stock-market decision-making, show real Alpha Nova screens, and use a visual metaphor not used by prior Alpha Nova ads.

The finished deliverable is a local-only, self-contained 9:16 HTML file. Production deployment is out of scope.

## Audience and promise

The primary audience is active Indian traders who recognize the emotional pull of a fast-moving candle. The ad does not promise returns or predictive certainty. Its promise is disciplined context before action: chart, signal, regime, then decision.

## Creative concept: Market Domino

A single leaning green candlestick triggers a chain reaction of red and green candlesticks. The collapse accelerates until time freezes just before impact. The camera then travels through the suspended market, where real Alpha Nova screens reveal the evidence an impulsive trader was missing. The candlesticks finally lift, align, and become a deliberate staircase.

The visual transformation carries the message: break the reaction and build the decision.

## Storyboard and copy

### Beat 1 — Trigger, 0–4 seconds

An oversized green candlestick stands in a graphite studio. It begins to lean toward the next candle as the camera slowly pushes in.

Copy: `One reaction…`

### Beat 2 — Chain reaction, 4–9 seconds

The first candle hits a long sequence of red and green candlesticks. The collapse accelerates toward the viewer with precise, weighty movement.

Copy: `…can trigger everything.`

### Beat 3 — Pause, 9–12 seconds

The chain freezes millimetres before a final collision. Dust, fragments, and motion streaks stop with it. The studio becomes quiet and spacious.

Copy: `Pause.`

### Beat 4 — Evidence, 12–22 seconds

The camera moves through the frozen candlesticks. Three borderless glass planes appear as part of the scene, each using a fresh Alpha Nova screenshot:

1. Chart Analyser, using a liquid Indian large-cap example such as `RELIANCE.NS`.
2. India Market Signals, emphasizing actionable setups and market context.
3. Sector Rotation, emphasizing regime and leadership.

The screenshots are cropped for vertical legibility and are not placed inside phone or browser mockups.

Copy sequence:

- `See the chart.`
- `Read the signal.`
- `Know the regime.`

### Beat 5 — Decision, 22–26 seconds

The frozen candles reverse smoothly, rise, and align into a disciplined ascending structure rather than a speculative price promise.

Copy: `Then decide.`

### Beat 6 — End card, 26–30 seconds

The structure resolves into a restrained Alpha Nova brand mark on a clean black-titanium field.

Headline: `Break the reaction. Build the decision.`

Brand: `Alpha Nova`

CTA: `Explore now` linking to `https://alphanova48.in/`

## Visual and motion language

- Instagram-first 9:16 composition, designed around a 1080 × 1920 safe frame.
- Black titanium and soft white studio lighting with restrained market red and green.
- Large, minimal typography with generous spacing and high contrast.
- Three.js candlestick geometry, studio lighting, depth, camera travel, and suspended debris.
- GSAP-controlled non-looping timeline for camera, objects, screenshots, and copy.
- Physical, deliberate motion rather than neon, glitch, particle-cloud, or dashboard montage effects.
- No fake profits, percentage claims, prediction claims, phone mockups, ribbons, X-ray motifs, or reused pressure-test imagery.

## Screenshot treatment

Capture the three platform screens fresh from the current Alpha Nova interface. Use only public, non-personal data. Embed the final screenshot images in the generated HTML so the deliverable has no sibling-file or network dependency during playback.

Each screen is introduced on a glass plane with a subtle perspective move, but its interface remains crisp and readable. The screenshot itself is the product proof; decorative 3D elements remain secondary.

## Implementation structure

Maintain four focused artifacts:

- A readable template in `web/scripts/assets`.
- A deterministic builder in `web/scripts` that embeds Three.js, GSAP, and screenshots.
- A focused build test and validator in `web/scripts`.
- The generated single-file ad in `web/public`.

The HTML exposes a browser diagnostic object with renderer state, playback readiness, current time, current beat, visible copy beats, and completion state. Query parameters support deterministic frame inspection and a forced CSS fallback.

## Playback and fallback behavior

- The hook is the static opening state before JavaScript playback begins.
- Playback starts at zero only after renderer readiness and the first visible browser state.
- The timeline runs once for exactly 30 seconds with no controls, audio, or loop.
- Page visibility lifecycle handling prevents hidden-tab startup from advancing to a later beat.
- Reduced-motion mode retains the full story with simplified transitions.
- A CSS fallback preserves the candlestick chain, screenshots, copy, and end card when WebGL is unavailable.
- Outgoing copy becomes unreadable before incoming copy is revealed; two readable beats must never overlap.

## Validation

Automated validation will check:

- Exact 30-second duration and required copy.
- 9:16 layout metadata and CTA destination.
- Embedded Three.js, GSAP, and screenshot assets.
- No unresolved runtime imports, CDNs, placeholders, controls, audio, or looping.
- Static opening hook and lifecycle safeguards.
- Reduced-motion, CSS fallback, and deterministic frame hooks.
- Template/build reproducibility and source-to-output consistency.

Browser validation will cover:

- Fresh no-query startup at the opening hook.
- Real progression through every scheduled beat to the end card.
- Hidden/background startup returning to the opening hook.
- Screenshot legibility and safe-area fit at 390 × 844 and 1080 × 1920 proportions.
- No copy overlap, clipping, unwanted scrollbars, console errors, or animation stalls.
- CSS fallback progression and final CTA usability.

## Scope boundaries

This task creates and verifies a local standalone HTML ad. It does not change Alpha Nova application routes, deploy production code, publish the Reel, add audio, or make financial-performance claims.
