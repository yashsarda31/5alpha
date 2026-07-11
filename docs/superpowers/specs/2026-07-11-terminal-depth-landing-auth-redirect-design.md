# Terminal Depth Landing Page and Authenticated Root Redirect

**Date:** 2026-07-11  
**Status:** Approved

## Objectives

1. Prevent authenticated users from seeing guest marketing content when reopening Alpha Nova.
2. Upgrade the guest landing page from a flat marketing layout to a premium, product-specific 3D experience that matches the terminal.

## Authenticated Root Behavior

- The `/` route remains the public SEO landing page for guests.
- When `AuthContext` has a cached or validated `currentUser`, the landing route immediately returns a React Router redirect to `/dashboard` with `replace` enabled.
- Because `AuthProvider` already restores cached users synchronously and suppresses children when a token exists without a cached user, no guest landing markup is painted while an existing session is being resolved.
- Explicitly logged-out users and users without a valid token continue seeing the public landing page.

## Visual Direction: Terminal Depth

The landing page keeps Alpha Nova’s black, electric-cyan, and light-gold system while adding restrained three-dimensional depth.

### Hero

- Use a responsive two-column hero: product positioning and calls to action on the left, layered terminal preview on the right.
- The terminal preview contains realistic, static product UI: market regime, NIFTY context, scored live setups, conviction bars, and entry/stop/target values.
- Layer the preview using CSS perspective, translucent glass, edge highlights, contact shadows, cyan/gold ambient glows, and small floating data chips.
- Cursor movement may create a maximum three-degree tilt on precision-pointer devices. Touch devices use a fixed composition.

### Supporting Sections

- Add a compact market-intelligence strip below the hero.
- Upgrade feature cards with depth layers, subtle gradient borders, raised icon wells, and gentle hover elevation.
- Keep the existing product copy, SEO headings, descriptive links, calls to action, and risk disclaimer.
- Preserve strong mobile hierarchy and ensure the terminal preview fits without horizontal scrolling.

## Motion and Accessibility

- Motion remains subtle: slow ambient float, small hover lifts, and restrained cursor tilt.
- `prefers-reduced-motion: reduce` disables float, tilt transitions, and decorative movement.
- Decorative layers are hidden from assistive technology.
- Text contrast, keyboard focus, semantic headings, and descriptive links remain intact.

## Implementation Boundaries

- Use React and CSS already in the project; add no 3D or animation dependency.
- Use CSS shapes, existing icons, and product-style interface components rather than generated imagery or inline SVG artwork.
- Keep the marketing page isolated in `Landing.jsx` and `Landing.css`.
- Add a small reusable pointer-tilt hook only if needed; do not add global state.

## Testing

- Verify an authenticated cached user opening `/` is redirected before guest content renders.
- Verify a token without cached user waits for session validation before routing.
- Verify guests still receive the landing page and login/signup actions.
- Verify pointer tilt is bounded and disabled for touch/reduced-motion contexts.
- Run targeted linting, authentication regression tests, production build, and live route smoke tests.

## Out of Scope

- Changes to authentication APIs or session duration.
- WebGL, Three.js, video backgrounds, or generated hero imagery.
- Redesigning authenticated terminal pages.
