# Alpha Nova “Pressure Test” 30-Second Ad Design

## Goal

Create a premium, story-led 30-second promotional ad for Alpha Nova that attracts active Indian traders on Instagram. The ad must make the platform feel calm, precise, and decision-oriented without promising returns or presenting analytics as investment advice.

The creative must be substantially different from earlier Alpha Nova ads. It will not reuse price ribbons, X-ray reveals, terminal treatments, notification-led chase stories, noise-to-signal transformations, phone mockups, or dashboard montages.

## Deliverable

- One local, standalone HTML file in `web/public`.
- Vertical 9:16 composition, designed at 1080×1920 and responsive down to 390×844.
- Exactly 30 seconds, non-looping.
- Three.js for the continuous 3D scene and GSAP for the master timeline.
- Embedded runtimes and styles, with no runtime CDN, font, image, video, or audio dependencies.
- Silent-first storytelling suitable for muted Instagram playback.
- CTA destination: `https://alphanova48.in`.
- No production deployment or route integration.

## Audience and Message

The audience is active Indian traders who recognize the tension of an apparently urgent setup but want a more disciplined way to evaluate it.

The ad’s central argument is:

> Urgency is not conviction.

Alpha Nova is positioned as the place to pressure-test a trade idea across structure, timing, and risk before acting.

## Creative Concept

An unstable red liquid sphere represents an anxious trade idea. It moves through one continuous optical clean-room environment and encounters three analysis forces:

1. **FLCL — Structure:** floor and ceiling planes reveal the setup’s structural context.
2. **Signals — Timing:** controlled pulses express entry, stop, and target planning.
3. **Minervini + Druck Analyzer — Risk:** titanium pressure rings represent trend alignment, conviction, and position sizing.

The same sphere remains on screen throughout the journey. Each force reduces its turbulence until it becomes a balanced, precision-cut dark-glass object. The transformation makes the three features feel like parts of one decision process rather than unrelated feature cards.

The final object represents a better-formed decision, not a guaranteed profitable trade.

## Thirty-Second Beat Sheet

### 0.0–4.0 seconds — The feeling

- Start on the correct opening frame: a trembling red sphere suspended in a soft white vacuum above a restrained `BUY?` prompt.
- Copy: `You know this feeling.`
- The motion is tense but controlled; there is no flashing market UI.

### 4.0–7.0 seconds — The pressure

- Fine concentric disturbances close around the sphere without becoming notification cards.
- Copy: `The trade feels urgent.`
- The camera begins a slow forward move into the analysis environment.

### 7.0–12.0 seconds — FLCL

- Two translucent precision planes establish floor and ceiling around the sphere.
- A clean vertical measurement passes through it and reduces its largest distortions.
- Labels: `FLCL` and `STRUCTURE`.
- Supporting copy: `See the regime.`

### 12.0–17.0 seconds — Signals

- Entry, stop, and target pulses travel along a narrow optical path through the sphere.
- The pulses align its motion into a stable trajectory.
- Labels: `SIGNALS` and `TIMING`.
- Supporting copy: `Plan the move.`

### 17.0–22.0 seconds — Minervini + Druck

- Three brushed-titanium rings rotate into alignment and apply a controlled pressure test.
- The sphere resolves into a balanced dark-glass object.
- Labels: `MINERVINI + DRUCK` and `RISK`.
- Supporting copy: `Test trend. Size risk.`

### 22.0–26.0 seconds — Resolution

- The completed object rests in a quiet optical field.
- Primary copy: `Urgency is not conviction.`
- Secondary copy: `A trade idea deserves a pressure test.`

### 26.0–30.0 seconds — Brand and CTA

- Alpha Nova wordmark and restrained feature line appear around the completed object.
- Primary copy: `Pressure-test the trade.`
- Feature line: `FLCL · Signals · Minervini + Druck`.
- CTA: `Explore Alpha Nova`.
- URL: `alphanova48.in`.
- The end card holds through exactly 30.0 seconds and does not loop.

## Visual Language

- Apple-inspired restraint without copying Apple assets, product silhouettes, or campaign layouts.
- Warm white environment, deep-black type, polished dark glass, brushed titanium, optical transparency, and one urgency-red accent.
- The red accent recedes as the sphere stabilizes; no neon green/red trading palette.
- Large system typography with high contrast and minimal copy.
- Soft studio lighting, realistic reflections, generous negative space, and seamless camera travel.
- No charts, candlesticks, dashboards, device frames, performance claims, profit figures, or testimonial language.

## Motion and Scene Structure

- A single Three.js scene contains the sphere, FLCL planes, Signals pulse path, pressure rings, environmental lighting, and camera.
- The sphere uses shader-driven surface turbulence where WebGL is available.
- GSAP controls a single 30-second master timeline for copy, camera, material parameters, and scene-object transforms.
- The master timeline starts paused at time zero and plays only after both the renderer and the page’s first visible state are ready.
- The opening hook remains statically correct before playback begins.
- Visibility changes pause and resume playback without skipping elapsed creative time.
- A deterministic `?frame=<seconds>` mode renders approved timestamps without autoplay for inspection.

## Fallbacks and Accessibility

- If WebGL or Three.js initialization fails, a CSS-rendered sphere and geometric feature treatments preserve the same story and copy.
- Reduced-motion mode uses restrained dissolves and discrete state changes while preserving the full narrative order.
- Text remains readable at 390×844 and within Instagram-safe vertical margins.
- Semantic text remains present in the document rather than existing only inside the canvas.
- The ad contains no audio, controls, autoplaying media elements, or looping behavior.

## Packaging

- Keep a readable HTML template under `web/scripts/assets`.
- Add a deterministic builder under `web/scripts` that embeds the pinned Three.js and GSAP runtimes into the final HTML.
- Add a structural validator under `web/scripts` that verifies duration, copy, CTA, 9:16 metadata, embedded runtimes, fallback, reduced motion, visibility guards, frame inspection, and absence of unresolved placeholders or external runtime assets.
- The generated file in `web/public` is the final user-facing artifact.

## Verification

Structural checks must verify:

- Exact 30-second duration and non-looping timeline.
- Required feature names and approved copy.
- CTA points only to `https://alphanova48.in`.
- Three.js and GSAP are embedded and pinned.
- No external runtime assets or unresolved template tokens remain.
- CSS fallback, reduced motion, visibility lifecycle, and deterministic frame mode are present.

Browser checks must verify:

- Fresh visible load starts at 0:00 on the hook frame.
- A hidden/background launch remains at 0:00 until first visible.
- Autoplay progresses naturally and reaches the end card at 30.0 seconds.
- The ad does not restart or loop after completion.
- Story states are correct at 0, 4, 7, 12, 17, 22, 26, and 30 seconds.
- WebGL and forced CSS fallback both preserve story order and readable copy.
- Desktop 9:16 and 390×844 layouts avoid clipping and unsafe margins.

## Non-Goals

- No production deployment.
- No changes to the Alpha Nova application UI or APIs.
- No audio track or licensed media.
- No claim that the platform predicts outcomes or guarantees profitable trades.
- No reuse or modification of earlier standalone ad artifacts.
