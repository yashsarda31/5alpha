# Alpha Nova “Pressure Test” 30-Second Ad Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build and verify a new, standalone 30-second 9:16 Alpha Nova ad that tells the “Pressure Test” story with Three.js and GSAP.

**Architecture:** A readable HTML template owns the semantic story, CSS fallback, Three.js scene, GSAP timeline, and lifecycle gates. A deterministic Node builder embeds pinned Three.js and GSAP runtimes into a single final HTML file, while Node tests and a structural validator enforce packaging, copy, timing, fallback, and startup requirements. Browser verification then proves the visible opening frame, hidden-tab gate, fixed-frame states, responsive layout, CSS fallback, and non-looping finish.

**Tech Stack:** HTML5, CSS, JavaScript, Three.js 0.166.1, GSAP 3.12.5, Node.js test runner, Vite production build, browser-based visual verification.

## Global Constraints

- Final artifact: `web/public/alpha-nova-pressure-test-30s-ad.html`.
- Vertical 9:16, designed at 1080×1920 and readable at 390×844.
- Exact duration: 30.0 seconds; the GSAP master timeline must not loop.
- CTA destination: `https://alphanova48.in` only.
- Runtime dependencies must be embedded; no CDN, remote fonts, images, video, audio, or sibling runtime assets.
- Story order: hook → pressure → FLCL → Signals → Minervini + Druck → resolution → CTA.
- Approved line: `Urgency is not conviction.`
- Required features: `FLCL`, `Signals`, and `Minervini + Druck`.
- No charts, candlesticks, dashboards, device frames, profit claims, testimonials, or prediction claims.
- Keep a semantic CSS fallback and reduced-motion path.
- Keep `?frame=<seconds>` deterministic inspection.
- Start at 0:00 only after runtime readiness and the first visible state.
- No production deployment or application-route integration.
- Preserve unrelated working-tree changes.

---

## File Map

- Create `web/scripts/assets/alpha-nova-pressure-test-30s-ad.template.html`: readable source for layout, copy, CSS fallback, WebGL scene, GSAP timeline, lifecycle, and frame inspection.
- Create `web/scripts/build-pressure-test-ad.mjs`: pure embedding helpers plus the deterministic template-to-artifact build command.
- Create `web/scripts/build-pressure-test-ad.test.mjs`: Node unit tests for embedding, whitespace normalization, and generated artifact identity.
- Create `web/scripts/validate-pressure-test-ad.mjs`: structural checks for the built one-file ad.
- Create `web/public/alpha-nova-pressure-test-30s-ad.html`: generated final deliverable.
- Modify `web/package.json`: pin build-only runtime packages and add ad build/check scripts.
- Modify `web/package-lock.json`: record exact `three@0.166.1` and `gsap@3.12.5` dependencies.

---

### Task 1: Deterministic Single-File Builder

**Files:**
- Create: `web/scripts/build-pressure-test-ad.mjs`
- Create: `web/scripts/build-pressure-test-ad.test.mjs`
- Modify: `web/package.json`
- Modify: `web/package-lock.json`

**Interfaces:**
- Produces: `stripTrailingWhitespace(value: string): string`.
- Produces: `embedRuntime(template: string, marker: string, source: string): string`.
- Produces: `buildPressureTestAd(options?: { templatePath?: string, outputPath?: string, threePath?: string, gsapPath?: string }): Promise<{ bytes: number, sha256: string }>`.
- Consumes later: the template markers `/*__GSAP_RUNTIME__*/` and `__THREE_MODULE_DATA_URI__`.

- [ ] **Step 1: Install exact build-only dependencies**

Run from `web`:

```powershell
npm install --save-dev --save-exact three@0.166.1 gsap@3.12.5
```

Expected: `web/package.json` and `web/package-lock.json` record exact versions `0.166.1` and `3.12.5`.

- [ ] **Step 2: Add the failing builder tests**

Create tests using `node:test` that import the three public functions and assert:

```js
assert.equal(stripTrailingWhitespace('a  \n b\t\n'), 'a\n b\n');
assert.equal(embedRuntime('before TOKEN after', 'TOKEN', 'runtime'), 'before runtime after');
assert.throws(() => embedRuntime('no marker', 'TOKEN', 'runtime'), /Missing marker: TOKEN/);

const result = await buildPressureTestAd({
  templatePath,
  outputPath,
  threePath,
  gsapPath,
});
assert.ok(result.bytes > 100);
assert.match(result.sha256, /^[a-f0-9]{64}$/);
assert.doesNotMatch(await readFile(outputPath, 'utf8'), /__THREE_MODULE_DATA_URI__|__GSAP_RUNTIME__/);
```

- [ ] **Step 3: Run the builder tests and verify failure**

Run:

```powershell
node --test scripts/build-pressure-test-ad.test.mjs
```

Expected: FAIL because `build-pressure-test-ad.mjs` does not exist.

- [ ] **Step 4: Implement the builder**

Implement the public functions and direct-run entry point with these exact rules:

```js
export const stripTrailingWhitespace = (value) =>
  value.split(/\r?\n/).map((line) => line.replace(/[ \t]+$/u, '')).join('\n');

export const embedRuntime = (template, marker, source) => {
  if (!template.includes(marker)) throw new Error(`Missing marker: ${marker}`);
  return template.replace(marker, source);
};
```

`buildPressureTestAd()` must read the template, GSAP UMD build, and Three.js module; strip trailing whitespace from both runtimes; base64-encode the Three.js module as `data:text/javascript;base64,...`; replace both markers; normalize the generated file to LF with a final newline; write it; and return byte length plus SHA-256. The direct-run path must print:

```text
PRESSURE_TEST_AD_BUILD=PASS bytes=<integer> sha256=<64 hex chars>
```

- [ ] **Step 5: Add package scripts**

Add:

```json
"ad:pressure-test:build": "node scripts/build-pressure-test-ad.mjs",
"ad:pressure-test:test": "node --test scripts/build-pressure-test-ad.test.mjs",
"ad:pressure-test:check": "node scripts/validate-pressure-test-ad.mjs"
```

- [ ] **Step 6: Run the builder tests**

Run:

```powershell
npm run ad:pressure-test:test
```

Expected: all builder tests PASS.

- [ ] **Step 7: Commit the builder**

```powershell
git add package.json package-lock.json scripts/build-pressure-test-ad.mjs scripts/build-pressure-test-ad.test.mjs
git commit -m "build: add pressure test ad packager"
```

---

### Task 2: Semantic Story and CSS Fallback

**Files:**
- Create: `web/scripts/assets/alpha-nova-pressure-test-30s-ad.template.html`
- Create: `web/scripts/validate-pressure-test-ad.mjs`

**Interfaces:**
- Produces DOM scenes: `hook`, `pressure`, `flcl`, `signals`, `risk`, `resolution`, `endcard`.
- Produces runtime markers consumed by Task 1.
- Produces `window.__PRESSURE_TEST_AD__` diagnostic object.

- [ ] **Step 1: Write the failing structural validator**

The validator must read `web/public/alpha-nova-pressure-test-30s-ad.html`, collect failures, and exit non-zero unless all assertions pass. Include exact assertions for:

```js
required('data-aspect="9:16"');
required('const AD_DURATION = 30;');
required('repeat: 0');
required('You know this feeling.');
required('The trade feels urgent.');
required('FLCL');
required('See the regime.');
required('SIGNALS');
required('Plan the move.');
required('MINERVINI + DRUCK');
required('Test trend. Size risk.');
required('Urgency is not conviction.');
required('Pressure-test the trade.');
required('https://alphanova48.in');
forbidden(/https?:\/\/(?!alphanova48\.in)/u);
forbidden(/__THREE_MODULE_DATA_URI__|__GSAP_RUNTIME__/u);
forbidden(/<audio|<video|loop\s*[:=]\s*true/iu);
```

Success output must be:

```text
PRESSURE_TEST_AD_CHECK=PASS three=166 duration=30 bytes=<integer> sha256=<64 hex chars>
```

- [ ] **Step 2: Run the validator and verify failure**

Run:

```powershell
node scripts/validate-pressure-test-ad.mjs
```

Expected: FAIL because the generated HTML does not exist.

- [ ] **Step 3: Create semantic HTML and CSS fallback**

Create the complete document with:

- `html[data-aspect="9:16"]` and viewport metadata.
- A full-viewport `.stage` with safe-area padding.
- `canvas#webgl` plus `.fallback-sphere`, `.fallback-planes`, `.fallback-pulses`, and `.fallback-rings`.
- Seven semantic `.beat` elements with the approved copy and `aria-live="off"`.
- A final `<a href="https://alphanova48.in">Explore Alpha Nova</a>`.
- System typography only.
- Warm white `#f4f1ea`, ink `#0a0a0b`, titanium `#b7bbc2`, optical white, and urgency red `#ef3f37`.
- CSS custom properties `--story-time`, `--sphere-turbulence`, and `--motion-scale`.
- Mobile rules for 390×844 and a reduced-motion media query.
- Runtime markers inside scripts without any external `<script src>` or stylesheet.

The hook must be the only visible beat before JavaScript executes. The end card must default to hidden.

- [ ] **Step 4: Add the diagnostic contract**

Expose:

```js
window.__PRESSURE_TEST_AD__ = {
  version: '1.0.0',
  duration: AD_DURATION,
  renderer: 'pending',
  playbackReady: false,
  waitingForFirstVisible: true,
  completed: false,
  currentBeat: 'hook',
  get time() { return masterTimeline?.time() ?? 0; },
};
```

- [ ] **Step 5: Build and validate the semantic artifact**

Run:

```powershell
npm run ad:pressure-test:build
npm run ad:pressure-test:check
```

Expected: build and structural validator PASS, with `renderer` allowed to remain CSS until Task 3.

- [ ] **Step 6: Commit the semantic ad**

```powershell
git add scripts/assets/alpha-nova-pressure-test-30s-ad.template.html scripts/validate-pressure-test-ad.mjs public/alpha-nova-pressure-test-30s-ad.html
git commit -m "feat: add pressure test ad story"
```

---

### Task 3: Three.js Pressure-Test Scene

**Files:**
- Modify: `web/scripts/assets/alpha-nova-pressure-test-30s-ad.template.html`
- Modify: `web/scripts/validate-pressure-test-ad.mjs`
- Regenerate: `web/public/alpha-nova-pressure-test-30s-ad.html`

**Interfaces:**
- Produces: `createPressureScene(THREE): { scene, camera, renderer, sphere, planes, pulses, rings, render, resize, dispose }`.
- Produces: mutable animation state `{ turbulence, pressure, pulsePhase, planeSpread, ringSpread, calm }`.

- [ ] **Step 1: Extend validation for the WebGL scene**

Require exact identifiers `createPressureScene`, `SphereGeometry`, `ShaderMaterial`, `PlaneGeometry`, `TorusGeometry`, `ACESFilmicToneMapping`, and `THREE.REVISION`. Require diagnostic assignment `renderer = 'webgl'`. Run the validator and expect failure before implementation.

- [ ] **Step 2: Implement `createPressureScene(THREE)`**

Create:

- Perspective camera at `(0, 0, 7.5)` with a responsive field of view.
- Transparent WebGL renderer with DPR capped at `2` and ACES Filmic tone mapping.
- Shader sphere with three-octave procedural displacement controlled by `uTime`, `uTurbulence`, `uPressure`, and `uCalm`.
- Two transparent optical planes for FLCL.
- Three emissive pulse beads plus a thin curve for Signals.
- Three brushed-metal torus rings for Minervini + Druck.
- Hemisphere, key, rim, and red accent lighting.
- Resize, render, and dispose methods.

The render loop must update only while the page is visible and must take animation values from a shared state object controlled by GSAP.

- [ ] **Step 3: Implement graceful failure**

Load the embedded Three.js data URI with `await import(THREE_MODULE_URI)`. If import, context creation, or shader compilation fails, add `is-css-fallback` to the document, set diagnostics to `renderer: 'css'`, and continue the same GSAP story without revealing the end card early.

- [ ] **Step 4: Build and validate**

Run:

```powershell
npm run ad:pressure-test:build
npm run ad:pressure-test:check
```

Expected: PASS with `three=166`.

- [ ] **Step 5: Commit the scene**

```powershell
git add scripts/assets/alpha-nova-pressure-test-30s-ad.template.html scripts/validate-pressure-test-ad.mjs public/alpha-nova-pressure-test-30s-ad.html
git commit -m "feat: render pressure test ad in three js"
```

---

### Task 4: GSAP Story Timeline and Startup Lifecycle

**Files:**
- Modify: `web/scripts/assets/alpha-nova-pressure-test-30s-ad.template.html`
- Modify: `web/scripts/validate-pressure-test-ad.mjs`
- Regenerate: `web/public/alpha-nova-pressure-test-30s-ad.html`

**Interfaces:**
- Produces: `createMasterTimeline(gsap, sceneApi): GSAPTimeline`.
- Produces: `seekToFrame(seconds: number): void`.
- Produces: `installPlaybackLifecycle(): void`.

- [ ] **Step 1: Extend lifecycle validation and verify failure**

Require `visibilitychange`, `pagehide`, `pageshow`, `requestAnimationFrame`, `waitingForFirstVisible`, `playbackReady`, `seekToFrame`, `new URLSearchParams`, and timeline labels at exact times `0`, `4`, `7`, `12`, `17`, `22`, `26`, and `30`. Run the validator and expect failure.

- [ ] **Step 2: Build the exact 30-second master timeline**

Create `gsap.timeline({ paused: true, repeat: 0 })` with labels:

```js
const BEATS = Object.freeze({
  hook: 0,
  pressure: 4,
  flcl: 7,
  signals: 12,
  risk: 17,
  resolution: 22,
  endcard: 26,
  complete: 30,
});
```

Use `.set()` at zero to lock the hook state, `.to()` transitions contained within each beat interval, and a final inert tween ending at exactly `30`. On completion, set `completed = true` and hold the final state. Never call `restart()` or configure repeat.

- [ ] **Step 3: Implement deterministic frame mode**

Read `frame` from `URLSearchParams`. Clamp it to `0..30`, pause the timeline, seek to that value with events suppressed, render once, update diagnostics, and never autoplay. Support `fallback=1` to force the CSS path.

- [ ] **Step 4: Install lifecycle guards before async renderer startup**

Register `visibilitychange`, `pagehide`, and `pageshow` immediately. Keep the timeline paused at zero until both conditions are true:

```js
const canStart = () => playbackReady && !document.hidden && waitingForFirstVisible;
```

On first start, set `waitingForFirstVisible = false` and call `requestAnimationFrame(() => masterTimeline.play(0))`. Pause on hidden/pagehide. Resume from the paused timeline time on visible/pageshow. Do not advance using wall-clock time while hidden.

- [ ] **Step 5: Build, test, and validate**

Run:

```powershell
npm run ad:pressure-test:test
npm run ad:pressure-test:build
npm run ad:pressure-test:check
```

Expected: all checks PASS and generated duration equals `30`.

- [ ] **Step 6: Commit the complete timeline**

```powershell
git add scripts/assets/alpha-nova-pressure-test-30s-ad.template.html scripts/validate-pressure-test-ad.mjs public/alpha-nova-pressure-test-30s-ad.html
git commit -m "feat: animate pressure test ad story"
```

---

### Task 5: Browser QA, Regression Checks, and Final Packaging

**Files:**
- Modify only if a defect is found: `web/scripts/assets/alpha-nova-pressure-test-30s-ad.template.html`
- Modify only if a defect is found: `web/scripts/validate-pressure-test-ad.mjs`
- Regenerate after any fix: `web/public/alpha-nova-pressure-test-30s-ad.html`

**Interfaces:**
- Consumes: `window.__PRESSURE_TEST_AD__` and `?frame=`/`?fallback=1` diagnostics.
- Produces: browser-proven final artifact and matching Vite copy.

- [ ] **Step 1: Run focused ad checks**

Run from `web`:

```powershell
npm run ad:pressure-test:test
npm run ad:pressure-test:build
npm run ad:pressure-test:check
```

Expected: builder tests, build, and validator all PASS.

- [ ] **Step 2: Run application regressions**

Run:

```powershell
npm test
npm run lint
npm run build
```

If `npm test` is not defined, run the repository’s existing frontend Node test command discovered from `web/src/**/*.test.js` and state the exact boundary. Expected: no new failures attributable to the ad; Vite build succeeds.

- [ ] **Step 3: Verify fixed story frames in a browser**

Serve `web/public` locally and inspect both desktop 9:16 and 390×844 at:

```text
alpha-nova-pressure-test-30s-ad.html?frame=0
alpha-nova-pressure-test-30s-ad.html?frame=4
alpha-nova-pressure-test-30s-ad.html?frame=7
alpha-nova-pressure-test-30s-ad.html?frame=12
alpha-nova-pressure-test-30s-ad.html?frame=17
alpha-nova-pressure-test-30s-ad.html?frame=22
alpha-nova-pressure-test-30s-ad.html?frame=26
alpha-nova-pressure-test-30s-ad.html?frame=30
```

Expected beat names: hook, pressure, FLCL, Signals, Minervini + Druck, resolution, end card, held end card. Verify no clipped type and sufficient contrast.

- [ ] **Step 4: Verify fresh and hidden-tab autoplay**

Open a fresh URL with no query string. Immediately inspect diagnostics: `time` must begin near `0`, `currentBeat` must be `hook`, and the end card must be hidden. Confirm natural progression after at least five seconds. Repeat by loading in a background tab: `waitingForFirstVisible` must stay true and `time` must remain `0` until the tab first becomes visible.

- [ ] **Step 5: Verify fallback and finish behavior**

Open `?fallback=1&frame=0`, `?fallback=1&frame=17`, and `?fallback=1&frame=30`; confirm semantic copy and CSS geometry match the beat. Let one normal playback finish; diagnostics must show `completed: true`, time `30`, and no restart after an additional two seconds.

- [ ] **Step 6: Verify packaged output identity**

After `npm run build`, compare SHA-256 for:

```text
web/public/alpha-nova-pressure-test-30s-ad.html
web/dist/alpha-nova-pressure-test-30s-ad.html
```

Expected: identical hashes.

- [ ] **Step 7: Check the scoped diff**

Run:

```powershell
git diff --check HEAD~4..HEAD
git status --short
```

Expected: no whitespace errors; unrelated pre-existing changes remain untouched.

- [ ] **Step 8: Commit any QA fixes**

If browser QA required source changes:

```powershell
git add scripts/assets/alpha-nova-pressure-test-30s-ad.template.html scripts/validate-pressure-test-ad.mjs public/alpha-nova-pressure-test-30s-ad.html
git commit -m "fix: harden pressure test ad playback"
```

If no source changes were required, do not create an empty commit.
