# Alpha Nova “Pressure Test” Focused Repair Design

## Goal

Repair the visible copy collisions in the existing 30-second “Pressure Test” ad and polish its mobile presentation without changing the approved story, feature order, visual metaphor, duration, CTA, or local-only delivery model.

## Confirmed Defect

`showBeat()` reveals each incoming section 0.82 seconds before its named beat while leaving the outgoing section visible until 0.08 seconds before that beat. Both sections therefore remain fully visible for roughly 0.74 seconds. Because every section occupies the same lower copy zone, the text overlaps at each transition. During this overlap, `currentBeat` still reports the outgoing beat, so diagnostics disagree with the rendered state.

The structural validator passes because it checks required source markers and content, not computed browser visibility around timeline boundaries.

## Chosen Approach

Preserve the current creative and replace the overlapping transition behavior with an exclusive handoff:

1. Animate the outgoing section upward with a short fade and restrained blur.
2. Hide the outgoing section before revealing the incoming section.
3. Reveal and settle the incoming section within the transition window, with no frame containing two readable copy blocks.
4. Make diagnostic beat reporting use the same effective transition boundaries as the visible sections.

The copy remains readable throughout the story, and the exact 4, 7, 12, 17, 22, and 26-second milestones remain the authoritative beat boundaries.

## Presentation Polish

- Reduce the mobile scene’s tendency to crowd the copy zone while keeping the sphere visually dominant.
- Keep feature pills and supporting copy within the 390×844 safe area.
- Preserve the current warm-white, urgency-red, dark-glass, and titanium material language.
- Refine the end-card spacing so the transformed object, headline, feature line, CTA, URL, and progress line remain clearly separated.
- Retain the existing approved copy; no new claims or feature names will be introduced.

## Implementation Boundaries

- Edit the readable template first, then regenerate the standalone public HTML through the existing deterministic builder.
- Extend validation or browser checks to cover transition exclusivity and diagnostic agreement.
- Preserve the embedded Three.js revision 166 and GSAP 3.12.5 runtimes.
- Preserve WebGL, forced CSS fallback, reduced-motion behavior, deterministic `?frame=<seconds>` inspection, first-visible startup guards, pause/resume lifecycle, exact 30-second duration, and non-looping completion.
- Do not modify other Alpha Nova pages, APIs, ads, or production deployment configuration.

## Verification

Automated checks must prove:

- The builder tests pass and regeneration is deterministic.
- The structural validator passes with the required story, CTA, runtimes, lifecycle guards, and 30-second duration.
- At representative moments before, during, and after every transition, no more than one `.beat` is visible and readable.
- `currentBeat` matches the visible section.
- The timeline completes at 30 seconds and does not restart.

Browser checks must verify:

- Fresh visible playback starts on the hook and progresses naturally.
- A hidden/background launch remains at 0:00 until first visible.
- WebGL and forced CSS fallback render correct story order.
- Fixed-frame inspection covers the transition windows and canonical beats.
- The 390×844 mobile layout and desktop 9:16 layout have no clipping, unsafe margins, or copy collisions.

## Non-Goals

- No new story concept or full visual redesign.
- No changes to the approved copy, feature sequence, CTA destination, or 30-second runtime.
- No audio, external assets, analytics instrumentation, production integration, or deployment.
