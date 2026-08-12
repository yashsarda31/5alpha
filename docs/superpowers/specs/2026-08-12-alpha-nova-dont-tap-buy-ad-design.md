# Alpha Nova “Don’t Tap Buy Yet” 20-Second Ad Design

**Date:** 2026-08-12  
**Status:** Storyboard approved  
**Deliverable:** One self-contained 9:16 HTML promotional ad

## Objective

Create a premium, Apple-inspired 20-second Instagram vertical ad for active traders. The film must stop the scroll with **DON’T TAP BUY YET**, show three simple Alpha Nova capabilities, and end with a free-signup CTA.

The creative must feel materially different from earlier Alpha Nova ads. It will not use a phone, dashboard walkthrough, clock, candlestick wall, noise-to-signal transition, investor trail, or transforming intelligence core.

## Creative Direction

The film centers on a large liquid-glass **BUY** button suspended just above activation. It rushes toward contact, freezes, and becomes the center of a three-part pre-trade check. Three titanium rings lock into place around it: trend, setup, and risk.

The button is never pressed. Alpha Nova is presented as decision support that helps a trader prepare, not as a broker or trade-execution product.

## Storyboard and Copy

### 0.0–3.0 seconds — Hook

- Begin in near-black with generous negative space.
- A large ceramic-and-glass **BUY** button rushes toward a precision contact surface, stopping a hair above it.
- A narrow pressure halo and restrained camera recoil create tension.
- Headline: **DON’T TAP BUY YET.**

### 3.0–7.0 seconds — Trend

- The first titanium ring locks around the suspended button.
- Three restrained states pass through the ring: **UPTREND · SIDEWAYS · DOWNTREND**.
- The movement resolves on one illustrative state without implying a live recommendation.
- Headline: **READ THE TREND.**

### 7.0–12.0 seconds — Setup

- A second ring slides into alignment and reveals three spatial markers.
- Labels: **ENTRY · STOP · TARGET**.
- Headline: **FIND THE SETUP.**
- A small **EXAMPLE** label makes clear that displayed values are illustrative.

### 12.0–16.0 seconds — Risk

- A final outer ring calculates around the button, using a concise sequence: **CAPITAL → RISK → QUANTITY**.
- Headline: **SIZE THE RISK.**
- The final quantity is presented as an example, not a recommendation.

### 16.0–20.0 seconds — Payoff

- The three rings align with a precise mechanical snap.
- The BUY button remains visibly unpressed and dims into the background.
- Copy: **TRADE PREPARED.**
- Brand: **ALPHA NOVA**
- CTA: **START FREE · NO CARD →**
- CTA destination: `https://alphanova48.in/login?mode=signup`
- Disclaimer: **Analytics and educational information only. Not investment advice.**
- Hold the final frame through exactly 20.0 seconds.

## Visual System

- **Format:** 9:16 portrait, composed for 1080×1920 and responsive vertical screens.
- **Safe area:** Keep essential copy and CTA clear of common Reels interface overlays.
- **Palette:** near-black, ceramic white, titanium, and one restrained electric-blue accent.
- **Typography:** large system sans-serif type with tight hierarchy and no external font request.
- **Materials:** liquid glass, satin titanium, soft reflections, controlled fresnel highlights, and narrow light bands.
- **Motion:** precise GSAP easing, physical tension, short camera recoil, and seamless ring assembly. No rapid flashing or clutter.
- **Brand restraint:** evoke premium product-film discipline without copying Apple products, interfaces, logos, or trademarked assets.

## Technical Architecture

The final deliverable will be generated as one standalone file under `web/public/`.

1. **Semantic HTML layer:** all headlines, labels, brand copy, CTA, disclaimer, and accessible fallback text.
2. **CSS composition layer:** 9:16 stage, typography, safe zones, fallback object, and final frame.
3. **Three.js layer:** BUY button, contact surface, titanium rings, light bands, markers, camera, and lighting.
4. **GSAP master timeline:** the exact 20-second narrative, DOM transitions, camera motion, object states, and final hold.
5. **Packaging step:** embed Three.js and GSAP into the generated HTML so no CDN, font, image, stylesheet, script, API, analytics, or audio request is needed. The CTA is the only external navigation.

## Playback and Fallbacks

- Autoplay once when ready; do not loop.
- No playback, replay, mute, share, or progress controls.
- Pause the timeline while the document is hidden so tab throttling cannot skip beats.
- Support deterministic frame inspection with a query such as `?frame=7.5`.
- Under `prefers-reduced-motion`, preserve the complete 20-second story with short crossfades and restrained object changes.
- If WebGL or Three.js initialization fails, run the full DOM/CSS story.
- If GSAP fails, show a readable final frame rather than a blank stage.

## Accessibility and Claims

- Keep all essential messages in semantic HTML rather than WebGL.
- Maintain readable mobile type, high contrast, and keyboard focus for the CTA.
- Do not use profit promises, win rates, urgency, or guaranteed-outcome language.
- Label sample trade and sizing values as examples.
- Never imply Alpha Nova executes trades.

## Validation

- Structural validation checks exact copy, CTA, duration, Three.js and GSAP presence, no controls, and no external runtime assets.
- Parse every embedded script and verify the embedded Three.js module has no unresolved imports.
- Inspect deterministic frames for the hook, trend, setup, risk, and CTA beats at 1080×1920.
- Test normal WebGL, forced CSS fallback, reduced motion, and direct `file://` opening.
- Confirm no console errors, clipped copy, off-screen CTA, timeline drift, or unintended loop.
- Run focused ad validation, the Vite production build, and `git diff --check`.
- Confirm the source ad and Vite-copied distribution artifact are byte-identical.

## Scope

Included:

- One new standalone HTML ad and its focused build/validation support.
- Embedded Three.js and GSAP.
- Local visual and timing QA.

Excluded:

- Deployment, site integration, React routes, APIs, authentication changes, analytics, tracking pixels, audio production, and video rendering.
- Changes to or deletion of previous Alpha Nova ads.

## Acceptance Criteria

- The hook is readable within the first second.
- The three features are unmistakable: **READ THE TREND**, **FIND THE SETUP**, and **SIZE THE RISK**.
- The BUY button remains unpressed throughout.
- The free-signup CTA is prominent and remains stable on the final frame.
- The ad is visibly distinct from prior Alpha Nova creatives.
- The single HTML file works offline except for deliberate CTA navigation.
- Normal, reduced-motion, and WebGL-fallback modes preserve the complete message.
- Playback is exactly 20.0 seconds in a stable 9:16 composition.
