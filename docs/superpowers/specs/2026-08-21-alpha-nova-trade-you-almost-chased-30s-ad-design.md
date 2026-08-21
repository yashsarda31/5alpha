# Alpha Nova “The Trade You Almost Chased” 30-Second Ad Design

**Date:** 2026-08-21  
**Status:** Approved for implementation  
**Delivery:** Local standalone HTML only; no production deployment

## Objective

Create a new 30-second, Apple-inspired promotional film for Alpha Nova that attracts active traders through a relatable story about nearly chasing a fast-moving trade. The ad must feel restrained, premium, and emotionally legible while avoiding every established Alpha Nova ad treatment: no glass monolith, floating core, titanium rings, BUY button, particle-to-signal transformation, market-open countdown, terminal montage, or black-ultraviolet portfolio object.

The primary deliverable is a native 9:16 HTML film authored for 1080 × 1920 Instagram Reels composition. It must use Three.js and GSAP, run directly as a local file, and remain separate from the production application.

## Audience and Message

The audience is active traders who recognize the emotional pressure of a rapidly moving price. The story does not shame the viewer or promise better returns. It replaces urgency with a simple research sequence:

1. understand the market;
2. inspect a defined setup;
3. verify the chart structure.

The final message is **Trade the plan. Not the panic.**

## Feature Selection

The film presents three current Alpha Nova capabilities in plain language:

1. **Today** — market direction and priority setups at a glance;
2. **Signals** — setup score plus defined entry, stop, and target levels;
3. **Analyse** — technical chart structure for inspecting the move.

All symbols, prices, scores, and levels shown in the creative are designed demonstrations and must carry a visible **Illustrative** label. The ad must not imply live data, investment advice, guaranteed outcomes, or a recommendation to trade.

## Storyboard and Exact Copy

| Time | Beat | Visual action | On-screen copy |
| --- | --- | --- | --- |
| 0.0–4.0s | Temptation | A single satin price ribbon glides through a seamless bright studio, then suddenly rockets upward. The camera reacts a fraction late. | **It’s moving.** |
| 4.0–8.0s | Chase | The camera accelerates after the ribbon. Perspective stretches, red energy travels along the surface, and the composition becomes increasingly unstable without becoming illegible. | **Don’t miss it.** |
| 8.0–10.0s | Interruption | One instant before the camera reaches the price, motion freezes. A restrained temporal ripple travels backward through the ribbon. | **Wait.** |
| 10.0–14.0s | Today | Time rewinds. The camera pulls back to reveal market direction, breadth, and three priority setups arranged along the ribbon. | **See the market first.** |
| 14.0–19.0s | Signals | One setup becomes a precise spatial plan. Entry, stop, target, and score settle into place with calm mechanical alignment. | **Know the setup.** |
| 19.0–24.0s | Analyse | The same ribbon unfolds into a clean technical chart. Trend structure, price path, and the setup zone become visible without cutting to a separate product card. | **Check the move.** |
| 24.0–27.0s | Resolution | The original opportunity passes through the scene again. This time the camera remains composed and the plan stays readable. | **Trade the plan.** / **Not the panic.** |
| 27.0–30.0s | Brand and CTA | The ribbon draws the Alpha Nova mark, then settles beneath the brand lockup and CTA. The final frame holds through 30.0 seconds. | **Alpha Nova** / **Start free →** / `alphanova48.in` |

The master timeline is exactly 30.0 seconds and does not loop automatically.

## Visual System

- **Composition:** Native 9:16 at 1080 × 1920, with essential copy protected from common Reels overlays at the top, bottom, and right edge.
- **Environment:** Bright seamless studio with soft shadows, editorial negative space, and no literal trading room or device mockup.
- **Hero object:** One continuous satin price ribbon. Its form changes throughout the story, ensuring the film reads as one journey rather than a feature slideshow.
- **Palette:** Warm white, near-black typography, cool blue for clarity, and restrained red only during the chase.
- **Typography:** System sans serif with large editorial headlines, tight display tracking, and generous spacing. No external font request is required.
- **Motion:** The first eight seconds use accelerating camera pressure and elastic perspective. The rewind resets the visual rhythm. Product beats use measured GSAP easing and stable framing.
- **Brand restraint:** The work may evoke Apple’s material precision, pacing, and negative space, but it must not reproduce Apple products, interfaces, logos, copy, or campaign layouts.

## Technical Architecture

The ad is delivered as a generated single-file HTML artifact with a readable source template and deterministic build/validation scripts.

1. **Semantic DOM layer** contains all marketing copy, labels, CTA, disclaimer, and accessible fallback content.
2. **Three.js layer** renders the price ribbon, chart geometry, spatial levels, studio lighting, shadows, and camera choreography.
3. **GSAP master timeline** owns the complete 30-second sequence, including DOM transitions and Three.js property animation.
4. **Render loop** updates only the scene and progress state; GSAP remains the source of narrative time.
5. **Packaging step** embeds self-contained Three.js revision 166 and GSAP 3.12.5 runtimes so the final HTML has no runtime CDN, stylesheet, font, image, or sibling-file dependency.

The generated artifact will live in `web/public/`. The readable template and deterministic builder/validator will live under `web/scripts/`. The CTA is the only deliberate external navigation and points to `https://alphanova48.in/login?mode=signup`.

## Playback and Fallback Behavior

- Playback begins automatically from 0.0 seconds after initialization and stops at 30.0 seconds.
- The timeline pauses while the document is hidden and resumes without skipping forward.
- A deterministic `?frame=<seconds>` query freezes the film at any requested time for visual inspection.
- Reduced-motion mode preserves every narrative beat with restrained dissolves and minimal camera movement.
- If WebGL or Three.js fails, the semantic DOM/CSS story remains complete and timed.
- If GSAP initialization fails, the opening state must remain readable and a recovery path must reveal the CTA; the page must never open on an accidental closing frame.
- The ad contains no audio, mute control, replay control, or automatic loop.

## Validation

Structural validation must confirm:

- exact 30.0-second duration and non-looping behavior;
- required copy, feature labels, illustrative label, disclaimer, CTA, and destination;
- native 9:16 metadata and mobile-safe layout rules;
- embedded Three.js and GSAP payloads with no unresolved imports;
- no runtime asset dependencies or unresolved build placeholders;
- source/template and generated-artifact consistency;
- reduced-motion, visibility-pause, WebGL fallback, and `?frame=` support.

Browser validation must confirm:

- the normal opening frame begins at the temptation beat rather than the CTA;
- autoplay visibly progresses through the chase, rewind, three features, resolution, and CTA;
- representative frames at 0, 5, 9, 12, 17, 22, 25, and 29 seconds match the storyboard;
- direct `file://` playback works;
- a 1080 × 1920 viewport and a smaller mobile viewport show no clipped essential copy, horizontal overflow, or unreadable labels;
- CSS fallback and reduced-motion playback still communicate the full story.

## Scope Boundaries

- Do not modify application routes, React components, backend code, or production configuration.
- Do not deploy or publish the creative.
- Do not add sound, user controls, analytics, or alternate aspect ratios.
- Do not make performance, return, accuracy, or prediction claims.
