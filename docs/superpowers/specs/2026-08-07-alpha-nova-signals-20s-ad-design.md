# Alpha Nova Signals 20-Second Ad Design

## Objective

Create a premium, highly shareable 20-second vertical HTML ad for Alpha Nova. The ad should make one memorable promise: investors can replace hours of daily stock research with a focused five-minute workflow, quality-first signals, and real-time stock alerts.

The conversion destination is `https://alphanova48.in/signals`.

## Deliverable

- Add a new standalone file at `web/public/alpha-nova-signals-20s-ad.html`.
- Preserve all existing ad files and application routes.
- Package the logo, CSS, Three.js, GSAP, and runtime code inside the HTML so it can be shared as one file.
- Design for a 1080 x 1920, 9:16 Instagram Reel composition with safe margins for Instagram interface overlays.
- Do not deploy or change production configuration.

## Creative Direction

The approved direction is **Time Collapse**: the visual pressure of endless market research compresses into a calm five-minute decision workflow.

The treatment uses minimalist product-film language: graphite and white space, precise typography, restrained blue-violet accents, glass and metal materials, controlled camera movement, and decisive transitions. It avoids trading-floor imagery, exaggerated profit claims, flashing candlesticks, and visual clutter.

## Storyboard and Copy

### 0.0-4.0 seconds: The problem

- A dark field fills with clock fragments, faint chart traces, and noisy market particles.
- Headline: **Still spending hours on stocks?**
- Motion feels busy but remains legible within the vertical safe area.

### 4.0-8.0 seconds: The compression

- GSAP accelerates the fragments toward the center.
- Three.js particles collapse into a precise luminous timer.
- Hero copy: **05:00 / DAY**
- Supporting line: **Your market workflow, compressed.**

### 8.0-13.0 seconds: The signal

- The timer resolves into clean, risk-defined signal cards with stock symbols, direction, entry, stop, and target cues.
- Headline: **Quality-first signals.**
- Supporting line: **Clear setups. Defined risk. Less noise.**

### 13.0-16.0 seconds: The alert

- Compact alert cards arrive with subtle spatial pulses around the phone-like focal plane.
- Headline: **Real-time stock alerts.**
- Supporting line: **Know when a new setup is ready.**

### 16.0-20.0 seconds: The payoff

- The scene transitions from graphite to warm white.
- Brand lockup: **Alpha Nova**
- Closing line: **Five minutes. Then live your life.**
- CTA: **See today's signals ->**
- Destination: `https://alphanova48.in/signals`
- A concise educational-risk disclaimer remains visible without competing with the CTA.
- At 20 seconds, the frame remains on the CTA rather than looping.

## Runtime Architecture

The ad is a single document with four isolated layers:

1. **Semantic HTML layer** contains every important message and the final CTA, ensuring the story remains available if animation fails.
2. **CSS composition layer** establishes the 9:16 stage, typography, safe zones, fallback backgrounds, signal cards, and end frame.
3. **Three.js visual layer** renders clock fragments, particles, depth, material highlights, and alert pulses on one WebGL canvas.
4. **GSAP timeline layer** controls all DOM, camera, material, and scene transitions on one deterministic 20-second master timeline.

The visual begins automatically after document readiness. It has no playback, replay, mute, or progress controls. It runs once and holds on the final CTA.

## Asset and Dependency Packaging

- Embed the Alpha Nova logo as a data URI or inline SVG.
- Embed self-contained browser builds of Three.js and GSAP in the HTML.
- Do not load fonts, scripts, images, audio, analytics, or styles from external origins.
- Use a system font stack that approximates premium product typography without a network request.
- Keep the CTA as the only external navigation action.

## Fallbacks and Accessibility

- If WebGL or Three.js initialization fails, retain the CSS background and execute the complete GSAP DOM story.
- If GSAP initialization fails, show the final brand and CTA state instead of a blank stage.
- Honor `prefers-reduced-motion` by using short crossfades and static visual states while preserving the 20-second narrative order.
- Keep body copy and CTA contrast at WCAG AA levels.
- Provide readable semantic text behind the animated presentation.
- The creative is soundless so browser autoplay restrictions cannot interrupt playback.

## Verification

Before handoff:

- Parse every embedded classic script and JavaScript module.
- Confirm the embedded Three.js build has no unresolved static imports.
- Confirm GSAP and Three.js initialize from the final single file.
- Verify there are no external dependencies other than the CTA URL.
- Verify the master timeline ends at 20 seconds and holds the end card.
- Verify the CTA resolves to `https://alphanova48.in/signals`.
- Inspect mobile screenshots at the opening, timer, signals, alerts, and end-card moments.
- Check safe-zone placement at 1080 x 1920 and a representative mobile viewport.
- Verify the WebGL failure and reduced-motion fallbacks.
- Run frontend lint and the Vite production build.
- Confirm the source file and copied `web/dist` artifact match byte-for-byte.
- Run `git diff --check` on the new work.

## Success Criteria

- The five-minute promise is understood within the first eight seconds.
- Signals and real-time alerts each receive a distinct, readable product moment.
- The final frame clearly identifies Alpha Nova and directs viewers to Signals.
- The file can be sent to another person and opened without a local server or sibling assets.
- The animation is exactly 20 seconds, visually stable in 9:16, and free of console errors.

## Non-Goals

- No changes to the Alpha Nova application UI or API.
- No new React route.
- No analytics integration or account flow changes.
- No autoplay audio, controls, looping, export pipeline, or video renderer.
- No deployment.
