# Alpha Nova Alpha Core 20-Second Ad Design

**Date:** 2026-08-10  
**Status:** Approved creative direction  
**Deliverable:** One self-contained HTML file for a 9:16 social-media reel

## Objective

Create a premium, Apple-inspired 20-second promotional film for Alpha Nova. The ad must communicate three product benefits clearly: highest-quality signals, free real-time alerts, and world-class analytics tools. It must feel new and avoid the concepts used in earlier Alpha Nova ads, including noise becoming signal, daily time compression, workflow walkthroughs, two-sided markets, and investor-trail imagery.

The film should earn attention through a distinctive visual object rather than a conventional dashboard demonstration. It must be polished enough to record or share as an Instagram Reel or YouTube Short.

## Creative Direction: Alpha Core

The film centers on a single levitating intelligence object: the **Alpha Core**. It begins as a pinprick of light, grows into a liquid-glass and polished-metal form, unfolds into feature-specific structures, and finally resolves into the Alpha Nova brand.

The core is not a literal product device. It is a visual metaphor for a market-intelligence engine. Its transformation gives the film one continuous visual idea and a satisfying final reveal.

## Storyboard and Copy

### 0.0-3.0 seconds: The Hook

- Begin in near-total black with generous negative space.
- A single white point pulses and subtly bends a sparse field around it.
- On-screen copy: **The market never stops.**
- Motion remains restrained until a rapid energy draw begins near the end of the beat.

### 3.0-7.0 seconds: Signals

- The point expands into the Alpha Core: a levitating liquid-glass sphere with a silver internal structure.
- Fine orbital paths and ordered data marks assemble around it.
- On-screen copy: **Highest-quality signals.**
- The motion conveys selection and refinement without using noise-to-signal imagery.

### 7.0-11.0 seconds: Alerts

- A controlled cyan energy ring travels outward from the core.
- The ring triggers one pristine spatial notification object, accompanied by a subtle visual pulse.
- On-screen copy: **Real-time alerts. Free.**
- No phone frame, messaging interface, or dashboard screenshot is shown.

### 11.0-15.0 seconds: Analytics

- The core opens into an elegant three-dimensional analytical lattice.
- Abstract probability arcs, chart contours, and market layers orbit in coordinated depth.
- On-screen copy: **World-class analytics.**
- The lattice remains legible and architectural rather than becoming a dense data wall.

### 15.0-20.0 seconds: Brand Payoff

- The analytical structures collapse smoothly back into one flawless core.
- The core settles behind or above the brand lockup.
- Closing copy: **See what others miss.**
- Brand: **ALPHA NOVA**
- CTA: **START FREE →**
- The CTA targets `https://alphanova48.in/signals` and remains visible through the final frame.

## Visual System

- **Format:** 9:16 portrait, designed around a 1080×1920 safe composition.
- **Palette:** near-black, graphite, polished silver, soft white, and one restrained cyan accent.
- **Typography:** system sans-serif stack with Apple-like restraint, large scale, tight tracking, and strong hierarchy. No external font request.
- **Materials:** physically inspired glass, chrome, fresnel highlights, controlled bloom-like glows, and soft reflections.
- **Composition:** one focal action per beat with ample negative space and text kept inside reel-safe margins.
- **Motion:** cinematic camera movement, precise GSAP easing, seamless morph-like transitions, and no hard scene-card cuts.
- **Brand restraint:** do not reproduce Apple products, logos, interfaces, or trademarked visual assets.

## Technical Architecture

The deliverable will be a single HTML file placed under `web/public/`.

1. **Semantic DOM layer** renders all marketing copy, brand text, CTA, fallback visuals, and accessibility content.
2. **Three.js layer** renders the core, orbital paths, alert pulse, analytical lattice, lighting, camera, and particles.
3. **GSAP master timeline** owns the complete 20-second sequence, including DOM copy, camera movement, Three.js object properties, and final-frame hold.
4. **Responsive composition controller** scales the visual stage for portrait screens while preserving safe margins on wider or shorter viewports.
5. **Fallback controller** keeps the complete message readable if WebGL or motion is unavailable.

Three.js and GSAP must be embedded in the generated HTML. The final file must not require a CDN, server, sibling image, font, stylesheet, script, audio, analytics request, or API call. CTA navigation is the only permitted runtime network action.

## Playback Behavior

- Autoplay once when the page is ready.
- No playback, replay, mute, share, or progress controls.
- Total sequence length is exactly 20.0 seconds.
- Hold the end card through the final frame without restarting automatically.
- Pause timing while the document is hidden so background-tab throttling does not skip scenes.
- Support a deterministic frame query for QA, such as `?frame=7.5`.
- Respect `prefers-reduced-motion` and provide an equivalent static or lightly transitioned presentation.
- Provide a CSS/DOM fallback that presents all three benefits and the CTA if WebGL initialization fails.

## Accessibility and Claims

- Keep essential copy in semantic HTML rather than drawing it into WebGL.
- Maintain high contrast and readable type at mobile sizes.
- The CTA must be keyboard focusable and have a descriptive accessible label.
- Avoid guaranteed-return, accuracy-percentage, profit, or urgency claims.
- Include a discreet final-frame line: **Analytics and educational information only. Not investment advice.**

## Scope Boundaries

Included:

- One new standalone HTML ad.
- Embedded Three.js and GSAP runtimes.
- Responsive 9:16 presentation.
- Reduced-motion and WebGL fallbacks.
- Local validation and visual QA.

Excluded:

- Production deployment.
- Changes to the React application, APIs, authentication, analytics, or Signals product behavior.
- Video rendering, audio production, paid-media setup, tracking pixels, and campaign configuration.
- Reworking or deleting earlier ad files.

## Validation

- Run a structural validation script that checks the exact copy, CTA, total duration, Three.js and GSAP presence, lack of external assets, and lack of controls.
- Open the file directly with `file://` and through the local Vite build.
- Inspect deterministic frames covering the hook, signals, alerts, analytics, and end card at a representative 9:16 viewport.
- Verify normal WebGL, forced fallback, and reduced-motion behavior.
- Verify no console errors, uncaught promise rejections, layout clipping, or off-screen text.
- Confirm the timeline stops at 20.0 seconds and the final CTA remains stable.
- Run the focused validation, production Vite build, and `git diff --check` before completion.

## Acceptance Criteria

- The creative is visibly distinct from previous Alpha Nova ad concepts.
- All three requested benefits receive a separate, readable product moment.
- The first meaningful visual and hook copy appear within two seconds.
- The final artifact is one portable HTML file using Three.js and GSAP.
- The film is exactly 20 seconds, stable in 9:16, and has no playback controls.
- The final CTA points to the Alpha Nova Signals page.
- Normal, reduced-motion, and WebGL-fallback modes retain the full marketing message.
- No production deployment or unrelated repository change occurs.
