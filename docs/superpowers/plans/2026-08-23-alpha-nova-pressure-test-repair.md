# Alpha Nova “Pressure Test” Focused Repair Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove every copy collision from the 30-second “Pressure Test” ad, align diagnostics with rendered beats, and polish the 390×844 composition without changing the approved story.

**Architecture:** Keep the readable template as the source of truth and regenerate the single-file artifact with the existing builder. Replace early overlapping reveals with exact-boundary, one-section-at-a-time handoffs, expose readable beat state through diagnostics, and use the existing validator plus real-browser checks as the regression gate.

**Tech Stack:** HTML5, CSS, JavaScript, GSAP 3.12.5, Three.js 0.166.1, Node.js tests, agent-browser/Chromium verification.

## Global Constraints

- Preserve the 30.0-second non-looping timeline and beat boundaries at 0, 4, 7, 12, 17, 22, 26, and 30 seconds.
- Preserve all approved copy, feature order, `https://alphanova48.in` CTA, and local-only delivery.
- Preserve embedded Three.js revision 166 and GSAP 3.12.5 with no runtime network dependency.
- Preserve WebGL, CSS fallback, reduced motion, `?frame=<seconds>`, and first-visible playback lifecycle.
- Do not modify other ads, product pages, APIs, or deployment configuration.
- Edit the template before regenerating `web/public/alpha-nova-pressure-test-30s-ad.html`.

---

### Task 1: Add a transition regression gate

**Files:**
- Modify: `web/scripts/validate-pressure-test-ad.mjs`
- Test: `web/scripts/validate-pressure-test-ad.mjs`

**Interfaces:**
- Consumes: the generated standalone HTML string loaded as `html`.
- Produces: a failing validation result until exact-boundary handoff and visible-beat diagnostics are present.

- [ ] **Step 1: Add required transition markers and forbid the known overlap pattern**

Add these entries to the validator’s required-text list:

```js
'get visibleBeats()',
'readableBeatIds',
'timeline.set(`#${previous}`, { autoAlpha: 0 }, at);',
'timeline.set(`#${name}`, { autoAlpha: 1 }, at);',
```

Add this regression rule after the existing `forbid()` checks:

```js
forbid(
  /const entrance = Math\.max\(0, at - 0\.82\)/u,
  'copy beats are revealed early and can overlap',
);
```

- [ ] **Step 2: Run validation and confirm the regression gate fails**

Run: `cd web && node scripts/validate-pressure-test-ad.mjs`

Expected: `PRESSURE_TEST_AD_CHECK=FAIL` with missing exact-boundary/diagnostic markers or the overlap-pattern failure.

- [ ] **Step 3: Commit the failing regression gate together with the later fix**

Do not commit a deliberately failing tree. Keep this change uncommitted until Task 2 is green.

---

### Task 2: Implement exclusive beat handoffs and mobile polish

**Files:**
- Modify: `web/scripts/assets/alpha-nova-pressure-test-30s-ad.template.html`
- Regenerate: `web/public/alpha-nova-pressure-test-30s-ad.html`
- Test: `web/scripts/validate-pressure-test-ad.mjs`

**Interfaces:**
- Consumes: `showBeat(timeline, name, previous, at)`, `.beat` sections, `BEATS`, and the existing `diagnostics` object.
- Produces: `readableBeatIds(): string[]`, `diagnostics.visibleBeats`, exact-boundary handoffs, and a regenerated standalone artifact.

- [ ] **Step 1: Add readable-beat diagnostics**

After the `.beat` elements are available, add:

```js
const beatSections = [...document.querySelectorAll('.beat')];

const readableBeatIds = () => beatSections
  .filter((section) => {
    const sectionStyle = getComputedStyle(section);
    if (sectionStyle.visibility === 'hidden' || Number(sectionStyle.opacity) <= 0.01) return false;
    return [...section.children].some((child) => Number(getComputedStyle(child).opacity) > 0.05);
  })
  .map((section) => section.id);
```

Expose it in `diagnostics`:

```js
get visibleBeats() { return readableBeatIds(); },
```

- [ ] **Step 2: Replace the overlapping reveal with an exact-boundary handoff**

Replace `showBeat()` with:

```js
const showBeat = (timeline, name, previous, at) => {
  const exitStart = Math.max(0, at - 0.24);
  if (previous) {
    timeline.to(
      `#${previous} > *`,
      {
        y: -10 * motionScale,
        opacity: 0,
        filter: `blur(${4 * motionScale}px)`,
        duration: 0.2,
        stagger: 0.015,
        ease: 'power2.in',
      },
      exitStart,
    );
    timeline.set(`#${previous}`, { autoAlpha: 0 }, at);
  }
  timeline.set(`#${name}`, { autoAlpha: 1 }, at);
  timeline.fromTo(
    `#${name} > *`,
    { y: 14 * motionScale, filter: `blur(${6 * motionScale}px)` },
    { y: 0, filter: 'blur(0px)', duration: 0.52, stagger: 0.035, ease: 'power3.out' },
    at,
  );
  timeline.call(() => { currentBeat = name; }, null, at);
};
```

This keeps the outgoing beat alone during its exit, hides it at the canonical boundary, and then reveals only the incoming beat.

- [ ] **Step 3: Reduce mobile crowding and compact end-card spacing**

In the 430px media query, use:

```css
.fallback-sphere { width: 40%; }
#endcard { bottom: max(8.1%, calc(env(safe-area-inset-bottom) + 3%)); }
#endcard .end-brand { margin-bottom: 1.05rem; }
#endcard .feature-line { margin: .85rem 0 1.15rem; }
```

In the WebGL `resize()` function, use a 42-degree mobile field of view:

```js
camera.fov = clientWidth < 500 ? 42 : 38;
```

Reduce the pressure beat’s maximum `sphereScale` from `1.14` to `1.09` so turbulence does not clip the sphere against narrow screens.

- [ ] **Step 4: Regenerate the standalone artifact**

Run: `cd web && node scripts/build-pressure-test-ad.mjs`

Expected: `PRESSURE_TEST_AD_BUILD=PASS` and a new SHA-256 hash.

- [ ] **Step 5: Run focused automated checks**

Run:

```powershell
cd web
node --test scripts/build-pressure-test-ad.test.mjs
node scripts/validate-pressure-test-ad.mjs
```

Expected: 3/3 builder tests pass and `PRESSURE_TEST_AD_CHECK=PASS`.

- [ ] **Step 6: Commit the focused code repair**

```powershell
git add web/scripts/validate-pressure-test-ad.mjs web/scripts/assets/alpha-nova-pressure-test-30s-ad.template.html web/public/alpha-nova-pressure-test-30s-ad.html
git commit -m "fix: repair pressure test ad transitions"
```

---

### Task 3: Verify real playback and layouts

**Files:**
- Verify: `web/public/alpha-nova-pressure-test-30s-ad.html`

**Interfaces:**
- Consumes: `window.__PRESSURE_TEST_AD__`, `window.seekToFrame(seconds)`, `?fallback=1`, and the generated artifact.
- Produces: fresh evidence for startup, transition exclusivity, completion, fallback, and responsive layout.

- [ ] **Step 1: Check every transition window at 390×844**

Open fixed frames at `3.5`, `3.9`, `4`, `6.5`, `6.9`, `7`, `11.5`, `11.9`, `12`, `16.5`, `16.9`, `17`, `21.5`, `21.9`, `22`, `25.5`, `25.9`, and `26` seconds.

At each frame evaluate:

```js
JSON.stringify(window.__PRESSURE_TEST_AD__)
```

Expected: `visibleBeats` contains at most one ID and, at canonical boundaries, it matches `currentBeat`.

- [ ] **Step 2: Check fresh autoplay and completion**

Open the artifact without `?frame`, confirm the hook is the first rendered state, and verify timeline time advances approximately with wall time. At completion, confirm `time === 30`, `completed === true`, `currentBeat === 'endcard'`, and that the timeline remains at 30 seconds after an additional wait.

- [ ] **Step 3: Check fallback and responsive presentation**

Repeat representative frames `0`, `7`, `12`, `17`, `22`, `26`, and `30` with `?fallback=1`. Capture 390×844 and desktop 9:16 screenshots. Confirm all copy, feature pills, CTA, URL, and progress line remain separated and unclipped.

- [ ] **Step 4: Run final repository checks**

Run:

```powershell
cd web
node --test scripts/build-pressure-test-ad.test.mjs
node scripts/validate-pressure-test-ad.mjs
git diff --check HEAD^ -- web/scripts/validate-pressure-test-ad.mjs web/scripts/assets/alpha-nova-pressure-test-30s-ad.template.html web/public/alpha-nova-pressure-test-30s-ad.html
```

Expected: all focused tests pass and `git diff --check` produces no output.

