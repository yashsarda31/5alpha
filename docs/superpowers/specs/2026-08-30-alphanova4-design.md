# AlphaNova4 Design Specification

Date: 2026-08-30  
Status: Approved design; implementation planning pending written-spec review

## 1. Objective

Build AlphaNova4 as a separate, mobile-first frontend for Alpha Nova. It will reimagine the core research journey as a continuous Three.js market universe with GSAP-directed transitions. The finished frontend is intended to replace the current production frontend only after preview approval, complete regression testing, and live validation.

AlphaNova4 must look cinematic without weakening financial clarity, data-integrity gates, authentication continuity, accessibility, or mobile reliability.

## 2. Initial scope

The first release covers the four-route core journey:

1. Today
2. Signals
3. Analyse
4. Watchlist

The existing `web` frontend remains untouched and operational while AlphaNova4 is developed in a new top-level `alphanova4` package. Specialist tools remain outside the initial release. They can be migrated through later design and implementation cycles after the core experience is approved.

The initial release reuses the current Alpha Nova backend, authentication, watchlist, alerts, market-data, signal-freshness, provider-limitation, and compliance contracts. It does not add new trading models, broker execution, order placement, subscriptions, or financial claims.

## 3. Visual direction

The interface is a continuous cinematic spatial terminal.

- Base environment: deep midnight and navy.
- Primary light: electric blue.
- Typography and primary data: crisp white.
- Materials: restrained glass, luminous lines, fine atmospheric particles, and controlled bloom.
- Market gain/loss colors appear only where they carry established semantic meaning. Labels, arrows, and text always reinforce the meaning so color is never the only cue.
- Heavy 3D models, decorative video, gold accents, and unrelated visual effects are excluded.

The scene must feel expansive but the selected financial information must remain sharp, stable, readable, and interactive.

## 4. Spatial experience

AlphaNova4 uses one persistent Three.js renderer and camera system. Routes are spatial zones inside the same universe rather than unrelated page loads.

### Today

Today is the central command sphere. Market regime, index movement, breadth, freshness, the user's watchlist, and recommended research actions occupy layered rings and planes. Selecting a module moves it into focus without destroying the surrounding context.

### Signals

Signals form a navigable opportunity field. Spatial properties encode only defensible metadata:

- Distance represents relevance to the current research context.
- Pulse represents freshness.
- Size represents evidence strength.

Spatial properties must not imply predicted return or certainty. Selecting a signal opens a readable dossier containing setup, evidence, freshness, invalidation, risk context, methodology, and alert controls. Missing or insufficient evidence produces an explicit unavailable or hold state.

### Analyse

Analyse moves the selected symbol into a focused chart chamber. Price action, indicators, AI insight, methodology, and supporting evidence occupy separate depth planes. A Focus control freezes decorative motion and expands the analytical surface into a distraction-free mode.

### Watchlist

Watchlist is a constellation grouped by sector or user-defined list. Movement reflects current market state without exaggerating magnitude. Alerts, provider limitations, stale observations, and unavailable values remain explicit.

## 5. Navigation and input

The four primary destinations remain available in a persistent thumb-reach dock.

- Tap selects objects and controls.
- Horizontal swipes rotate or advance within the current destination.
- Vertical movement scrolls readable content.
- Background dragging moves the camera only when no interactive control owns the gesture.
- Keyboard and switch-device users receive equivalent selection and navigation controls.
- Browser back/forward navigation maps correctly to spatial route changes.
- Orientation changes preserve route, selection, data state, and camera context.
- Interactive targets are at least 44 by 44 CSS pixels.

Route changes use GSAP timelines to coordinate camera travel, object emphasis, content entry, and focus restoration. Users can interrupt transitions; interruption must settle into a valid route state rather than leave the camera or controls between states.

## 6. Technical architecture

### 6.1 Package boundary

`alphanova4` is an isolated React/Vite package in the existing repository. It has its own application entry point, dependencies, tests, build output, and deployment configuration. It does not overwrite `web` during development.

### 6.2 Responsibilities

- React owns route state, normalized application state, API access, authentication, semantic controls, and error boundaries.
- Three.js owns the renderer, cameras, lighting, particles, spatial panels, visual charts, and zone objects.
- GSAP owns transition timelines and coordinates route state with camera and object motion.
- A scene director maps validated route state into camera and zone transitions.
- A quality manager selects and changes rendering tiers based on capability, measured frame stability, visibility, reduced-motion preference, and WebGL availability.
- Each route is an independent scene module with a narrow interface to the shared scene director.

The scene does not fetch, authenticate, or interpret raw provider payloads.

### 6.3 Data flow

The data path is:

`Existing Alpha Nova API -> validation and normalization -> route view model -> React application state -> Three.js scene projection and semantic interface`

View models contain explicit loading, ready, stale, provider-limited, unavailable, and error states. Scene modules render only normalized view models. Invalid numerical values must never become geometry, coordinates, labels, prices, targets, or risk levels.

### 6.4 Semantic interface

The full 3D universe is the primary visual experience. Essential content and controls also exist in a synchronized semantic HTML layer for screen readers, keyboard access, search indexing, screenshots, test automation, and WebGL fallback. This layer must not expose contradictory data or a separate guest-only product.

## 7. Adaptive mobile rendering

AlphaNova4 uses three rendering tiers selected automatically and adjustable in Settings.

### Full tier

For capable devices: full particles, restrained post-processing, richer lighting, smooth camera travel, and the highest safe resolution.

### Balanced tier

For typical mobile devices: reduced particles, simplified materials, limited post-processing, clamped pixel ratio, and shorter transitions.

### Essential tier

For low-power devices, reduced-motion users, WebGL instability, or persistent frame drops: static or minimally animated spatial composition, simplified lighting, no bloom, and immediate focus transitions.

The quality manager may downgrade during a session when measured performance remains below budget. It must not repeatedly oscillate between tiers. Hidden tabs pause render work, inactive zones suspend updates, and offscreen analytical modules do not animate.

## 8. Performance budgets

- Use procedural geometry and lightweight generated textures instead of large models or video.
- Route modules and heavy analytical code are loaded on demand.
- The semantic shell becomes usable before the full Three.js scene finishes initializing.
- Cap device pixel ratio per quality tier.
- Target 55 to 60 frames per second on capable phones.
- Maintain at least a stable 30 frames per second after automatic reduction on supported low-power devices.
- Long animation frames, accumulating render loops, duplicate canvases, and uncollected Three.js resources are release blockers.
- Initial production budgets for JavaScript, time-to-interactive, and memory will be established from a representative implementation prototype and recorded in the implementation plan before feature expansion.

## 9. Failure and integrity behavior

- WebGL initialization failure loads the Essential semantic/spatial experience.
- WebGL context loss pauses interaction, attempts one controlled restoration, and falls back if restoration fails.
- Scene or animation errors cannot block route navigation, authentication, alerts, or financial controls.
- Missing, stale, invalid, or provider-limited data is labelled and never replaced by invented geometry or values.
- Animation timelines are killed or settled on unmount, route interruption, visibility change, and quality-tier change.
- Existing compliance wording and dismissal/reopen behavior remain intact.
- Existing contextual sign-in continuity for durable watchlist and alert actions remains intact.

## 10. Accessibility and motion

- All primary actions are operable by keyboard and assistive technology.
- Focus follows the selected spatial object and returns predictably after dialogs or route changes.
- Text and controls meet WCAG 2.1 AA contrast requirements.
- Information does not depend only on color, depth, movement, or spatial position.
- `prefers-reduced-motion` selects the Essential tier by default and removes camera travel, pulsing, parallax, and particle motion.
- Zoom, large text, and 320-pixel-wide layouts retain access to all primary actions.
- A visible Focus control removes decorative motion and prioritizes a stable analytical panel.

## 11. Testing strategy

### Unit and contract tests

- API normalization and finite-value validation
- Route view-model states
- Scene-director state transitions
- Quality-tier selection and downgrade hysteresis
- GSAP timeline interruption and cleanup
- Current authentication, watchlist, alert, freshness, compliance, and provider-limited contracts

### Browser and interaction tests

- Today -> Signals -> Analyse -> Watchlist journey
- Browser back/forward behavior
- Touch gesture ownership and scroll behavior
- Keyboard navigation and focus restoration
- Reduced-motion and quality settings
- Orientation changes and viewport resizing
- WebGL unavailable and context-loss paths
- Loading, empty, stale, provider-limited, and error states

### Visual and performance tests

- Approved desktop and mobile reference screenshots
- Responsive checks at 320, 390, 768, 1024, and 1440 CSS pixels
- Real-device testing on representative iOS and Android phones
- Frame pacing, memory, startup, route transition, and hidden-tab behavior
- No animation or renderer leaks after repeated route changes

Frontend linting, unit tests, production build, accessibility checks, API tests, and repository diff checks must pass before a preview deployment is considered ready for review.

## 12. Release and replacement

1. Develop and verify AlphaNova4 locally without changing the existing frontend.
2. Publish an isolated preview only when explicitly requested.
3. Complete responsive browser and real-device validation against the preview.
4. Obtain explicit user approval for production replacement.
5. Run the complete frontend, backend, accessibility, performance, and live-smoke gates.
6. Replace the production frontend through a controlled deployment while retaining the current frontend as the immediate rollback target.
7. Verify the production alias, core routes, authentication, API responses, compliance UI, and mobile experience.

Deployment is not part of the initial implementation authorization. It requires a later explicit request after the preview is approved.

## 13. Acceptance criteria

AlphaNova4 is ready for preview review when:

- It is a separate runnable frontend and has not modified the current `web` application.
- The four core destinations operate as one continuous 3D universe.
- The midnight, electric-blue, and white visual system is consistent across all states.
- Core financial data remains legible and semantically available.
- Existing API, authentication, watchlist, alert, integrity, and compliance contracts pass.
- Adaptive rendering, reduced motion, WebGL fallback, and transition interruption work.
- Mobile navigation and primary controls work at 320 pixels and above.
- Automated tests, linting, production build, accessibility checks, visual review, and performance checks pass.
- No fabricated signal, price, confidence, freshness, or risk information appears in any scene state.

Production replacement additionally requires explicit approval, full deployment gates, live validation, and a verified rollback path.
