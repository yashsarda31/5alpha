# Alpha Nova Market Domino Ad Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build and verify a polished, self-contained 30-second 9:16 Alpha Nova Market Domino promotional ad that always begins at 0:00.

**Architecture:** A readable HTML template owns the semantic copy, CSS fallback, Three.js scene, GSAP timeline, lifecycle gate, and browser diagnostics. A deterministic Node builder embeds Three.js, GSAP, and three fresh platform screenshots into one output file; focused tests and a structural validator enforce packaging, timing, and startup contracts before browser QA.

**Tech Stack:** HTML, CSS, JavaScript modules, Three.js 0.166.1, GSAP 3.12.5, Node.js test runner, Vite, browser automation.

## Global Constraints

- The primary composition is 9:16 and safe at 390 × 844 and 1080 × 1920 proportions.
- The GSAP timeline is exactly 30 seconds, runs once, and has no audio, controls, or loop.
- The opening candlestick hook is visible before JavaScript and remains at time zero until both renderer readiness and the first visible browser state.
- Use fresh public Alpha Nova screenshots for Chart Analyser, India Market Signals, and Sector Rotation; embed all three in the HTML.
- The CTA is `https://alphanova48.in/` and the ad makes no return, accuracy, or prediction claims.
- Include WebGL, CSS fallback, reduced-motion behavior, `?frame=<seconds>`, and `?fallback=1`.
- Expose `window.__MARKET_DOMINO_AD__` with renderer, Three.js revision, playback readiness, hidden-start state, time, beat, visible beats, and completion.
- The deliverable is local-only; do not deploy or alter application routes.

## File Structure

- `web/scripts/assets/market-domino-chart.png`: Fresh public Chart Analyser capture.
- `web/scripts/assets/market-domino-signals.png`: Fresh India Signals capture.
- `web/scripts/assets/market-domino-sectors.png`: Fresh Sector Rotation capture.
- `web/scripts/assets/alpha-nova-market-domino-30s-ad.template.html`: Readable creative, scene, timeline, fallback, and diagnostics.
- `web/scripts/build-market-domino-ad.mjs`: Deterministic runtime and image embedder.
- `web/scripts/build-market-domino-ad.test.mjs`: Unit tests for image/runtime embedding and output normalization.
- `web/scripts/validate-market-domino-ad.mjs`: Exact structural and packaging contract.
- `web/public/alpha-nova-market-domino-30s-ad.html`: Generated one-file deliverable.
- `web/package.json`: Focused build, test, and validation commands.

---

### Task 1: Capture the three product-proof screens

**Files:**
- Create: `web/scripts/assets/market-domino-chart.png`
- Create: `web/scripts/assets/market-domino-signals.png`
- Create: `web/scripts/assets/market-domino-sectors.png`

**Interfaces:**
- Consumes: Public Alpha Nova routes `/chart?symbol=RELIANCE.NS`, `/signals`, and `/sectors`.
- Produces: Three readable PNG files consumed by `buildMarketDominoAd()`.

- [ ] **Step 1: Open the current public platform**

Confirm each route loads without personal account data. Use `https://alphanova48.in` unless a current local API is already running.

- [ ] **Step 2: Capture Chart Analyser**

Capture the chart-first region for `RELIANCE.NS`. Crop browser chrome, navigation clutter, and empty lower page space while preserving the ticker and candlestick chart.

- [ ] **Step 3: Capture India Market Signals**

Capture the page header, first actionable setup, and visible context. Do not capture loading skeletons, personal watchlists, or account identifiers.

- [ ] **Step 4: Capture Sector Rotation**

Capture the primary rotation chart plus leading-sector cards. Preserve the visible freshness label if present.

- [ ] **Step 5: Verify source assets**

Run:

```powershell
Get-Item web/scripts/assets/market-domino-*.png | Select-Object Name,Length
```

Expected: exactly three PNG files, each larger than 25 KB and visually readable at original size.

- [ ] **Step 6: Commit**

```powershell
git add web/scripts/assets/market-domino-chart.png web/scripts/assets/market-domino-signals.png web/scripts/assets/market-domino-sectors.png
git commit -m "assets: capture market domino product screens"
```

### Task 2: Build the deterministic single-file packager

**Files:**
- Create: `web/scripts/build-market-domino-ad.test.mjs`
- Create: `web/scripts/build-market-domino-ad.mjs`

**Interfaces:**
- Consumes: `/*__GSAP_RUNTIME__*/`, `__THREE_MODULE_DATA_URI__`, `__CHART_SCREEN_DATA_URI__`, `__SIGNALS_SCREEN_DATA_URI__`, and `__SECTORS_SCREEN_DATA_URI__`.
- Produces: `buildMarketDominoAd(options)`, `embedRequired(template, marker, value)`, `pngDataUri(buffer)`, and `stripTrailingWhitespace(value)`.

- [ ] **Step 1: Write failing packager tests**

Use temporary fixtures and assert:

```js
assert.equal(stripTrailingWhitespace('a  \r\n b\t\n'), 'a\n b\n');
assert.equal(embedRequired('before TOKEN after', 'TOKEN', 'value'), 'before value after');
assert.throws(() => embedRequired('missing', 'TOKEN', 'value'), /Missing marker: TOKEN/);
assert.equal(pngDataUri(Buffer.from([1, 2, 3])), 'data:image/png;base64,AQID');
assert.match(output, /data:text\/javascript;base64,/u);
assert.equal((output.match(/data:image\/png;base64,/gu) ?? []).length, 3);
assert.doesNotMatch(output, /__(THREE|CHART|SIGNALS|SECTORS)|__GSAP_RUNTIME__/u);
assert.equal(output.endsWith('\n'), true);
assert.doesNotMatch(output, /[ \t]+\n/u);
```

- [ ] **Step 2: Run the test to verify it fails**

Run `node --test scripts/build-market-domino-ad.test.mjs` from `web`.

Expected: FAIL because `build-market-domino-ad.mjs` does not exist.

- [ ] **Step 3: Implement the builder**

Read the template, runtimes, and three PNGs concurrently. Convert Three.js to a base64 JavaScript module URI and every screenshot to a PNG data URI. Replace each marker once, normalize trailing whitespace, write one final newline, and return byte count plus SHA-256. Direct execution prints:

```text
MARKET_DOMINO_AD_BUILD=PASS bytes=<number> sha256=<64 lowercase hex characters>
```

- [ ] **Step 4: Run the packager tests**

Run `node --test scripts/build-market-domino-ad.test.mjs`.

Expected: all tests PASS.

- [ ] **Step 5: Commit**

```powershell
git add web/scripts/build-market-domino-ad.mjs web/scripts/build-market-domino-ad.test.mjs
git commit -m "test: add market domino ad packager"
```

### Task 3: Implement the opening-safe creative and timeline

**Files:**
- Create: `web/scripts/assets/alpha-nova-market-domino-30s-ad.template.html`

**Interfaces:**
- Consumes: The five packager markers from Task 2.
- Produces: `createDominoScene(THREE)`, `createMasterTimeline()`, `seekToFrame(seconds)`, `readableBeatIds()`, and `window.__MARKET_DOMINO_AD__`.

- [ ] **Step 1: Create the semantic opening state and CSS fallback**

The initial HTML contains only the hook as readable beat copy:

```html
<section class="beat is-opening" id="hook" aria-label="One reaction…">
  <h1>One reaction…</h1>
</section>
```

All later `.beat` sections start hidden. Build the 9:16 safe-area layout, graphite studio, CSS candlestick chain, embedded screenshot planes, and end card. Reduced-motion and CSS fallback must never expose the end card at startup.

- [ ] **Step 2: Implement the Three.js scene**

Create reusable candlestick groups from body and wick meshes. Arrange a perspective chain, floor, suspended fragments, soft studio lights, ACES filmic tone mapping, and responsive camera. Expose scene setters for the trigger lean, chain collapse, frozen travel, and orderly rebuild.

- [ ] **Step 3: Implement the exact beat map**

```js
const AD_DURATION = 30;
const BEATS = Object.freeze({
  hook: 0,
  chain: 4,
  pause: 9,
  chart: 12,
  signals: 15.4,
  sectors: 18.8,
  decision: 22,
  endcard: 26,
  complete: 30,
});
```

`showBeat(name, at)` fades the previous copy before `at`, hides it at `at`, and reveals the next copy at `at`. Two readable copy beats must never overlap.

- [ ] **Step 4: Implement startup and lifecycle gates**

Install `visibilitychange`, `pagehide`, and `pageshow` listeners before asynchronous Three.js loading. Keep the timeline paused at zero until renderer readiness and the first visible animation frame. `startFromZero()` calls `timeline.pause(0)`, resets the hook, and plays once from zero. A never-visible page reports `time: 0`, `currentBeat: 'hook'`, and `waitingForFirstVisible: true`.

- [ ] **Step 5: Add inspection and diagnostics**

`?frame=<seconds>` pauses and seeks. `?fallback=1` forces CSS. Expose getters for `renderer`, `threeRevision`, `playbackReady`, `waitingForFirstVisible`, `completed`, `currentBeat`, `time`, and `visibleBeats`.

- [ ] **Step 6: Verify all markers appear once**

Run `rg -n "__THREE_MODULE_DATA_URI__|__CHART_SCREEN_DATA_URI__|__SIGNALS_SCREEN_DATA_URI__|__SECTORS_SCREEN_DATA_URI__|/__GSAP_RUNTIME__/" scripts/assets/alpha-nova-market-domino-30s-ad.template.html`.

Expected: five marker matches.

- [ ] **Step 7: Commit**

```powershell
git add web/scripts/assets/alpha-nova-market-domino-30s-ad.template.html
git commit -m "feat: create market domino ad story"
```

### Task 4: Validate and generate the artifact

**Files:**
- Create: `web/scripts/validate-market-domino-ad.mjs`
- Create: `web/public/alpha-nova-market-domino-30s-ad.html`
- Modify: `web/package.json`

**Interfaces:**
- Consumes: Generated HTML.
- Produces: `MARKET_DOMINO_AD_CHECK=PASS three=166 duration=30 bytes=<number> sha256=<hash>` or an itemized failure.

- [ ] **Step 1: Write the validator first**

Require the exact beat map, approved copy, CTA, screenshot labels, three image data URIs, runtime signatures, lifecycle listeners, startup flags, diagnostics, reduced-motion CSS, and fallback/frame queries. Forbid unresolved markers, external scripts/styles/images, audio/video, loop attributes, unexpected external navigation, and early incoming-copy visibility.

- [ ] **Step 2: Add package commands**

```json
"ad:market-domino:build": "node scripts/build-market-domino-ad.mjs",
"ad:market-domino:test": "node --test scripts/build-market-domino-ad.test.mjs",
"ad:market-domino:check": "node scripts/validate-market-domino-ad.mjs"
```

- [ ] **Step 3: Verify validation fails before generation**

Run `npm run ad:market-domino:check`.

Expected: FAIL because the generated artifact is absent.

- [ ] **Step 4: Build and validate**

Run:

```powershell
npm run ad:market-domino:build
npm run ad:market-domino:test
npm run ad:market-domino:check
```

Expected: three PASS results with Three.js revision 166 and duration 30.

- [ ] **Step 5: Run focused lint and production build**

Run:

```powershell
npx eslint scripts/build-market-domino-ad.mjs scripts/build-market-domino-ad.test.mjs scripts/validate-market-domino-ad.mjs
npm run build
```

Expected: focused ESLint PASS and Vite build PASS. Restore unrelated `web/dist` churn after inspection.

- [ ] **Step 6: Commit**

```powershell
git add web/package.json web/scripts/validate-market-domino-ad.mjs web/public/alpha-nova-market-domino-30s-ad.html
git commit -m "build: package market domino ad"
```

### Task 5: Prove start-at-zero and polish every frame

**Files:**
- Modify if needed: `web/scripts/assets/alpha-nova-market-domino-30s-ad.template.html`
- Modify if needed: `web/scripts/validate-market-domino-ad.mjs`
- Regenerate: `web/public/alpha-nova-market-domino-30s-ad.html`

**Interfaces:**
- Consumes: `window.__MARKET_DOMINO_AD__` and deterministic query parameters.
- Produces: Browser-proven normal, hidden-start, fallback, and mobile playback.

- [ ] **Step 1: Inspect deterministic frames**

Open `?frame=0`, `4`, `9`, `12`, `15.4`, `18.8`, `22`, `26`, and `30`. At every boundary assert the expected `currentBeat`, one readable `visibleBeats` entry, the correct visual state, and no console error.

- [ ] **Step 2: Verify a fresh normal start**

Open a fresh no-query URL. Within the first frame assert:

```js
window.__MARKET_DOMINO_AD__.time < 0.25
window.__MARKET_DOMINO_AD__.currentBeat === 'hook'
window.__MARKET_DOMINO_AD__.visibleBeats.join(',') === 'hook'
```

Observe real progression to the 30-second end card without seeking or reloading.

- [ ] **Step 3: Verify hidden/background startup**

Create the page while hidden, wait at least five seconds, and assert before activation:

```js
window.__MARKET_DOMINO_AD__.time === 0
window.__MARKET_DOMINO_AD__.currentBeat === 'hook'
window.__MARKET_DOMINO_AD__.waitingForFirstVisible === true
```

After activation, confirm the hook appears first and time advances from zero.

- [ ] **Step 4: Verify fallback, reduced motion, and vertical polish**

Test `?fallback=1`, reduced-motion emulation, 390 × 844, and 1080 × 1920 proportions. Confirm screenshots are readable, the CTA stays inside the safe area, no scrollbars appear, no copy overlaps, and the final card holds through second 30.

- [ ] **Step 5: Regenerate and rerun focused checks**

```powershell
npm run ad:market-domino:build
npm run ad:market-domino:test
npm run ad:market-domino:check
npx eslint scripts/build-market-domino-ad.mjs scripts/build-market-domino-ad.test.mjs scripts/validate-market-domino-ad.mjs
git diff --check
```

Expected: every ad command PASS, focused ESLint PASS, and no whitespace errors.

- [ ] **Step 6: Record the final hash and commit polish**

```powershell
Get-FileHash web/public/alpha-nova-market-domino-30s-ad.html -Algorithm SHA256
git add web/scripts/assets/alpha-nova-market-domino-30s-ad.template.html web/scripts/validate-market-domino-ad.mjs web/public/alpha-nova-market-domino-30s-ad.html
git commit -m "fix: polish market domino ad playback"
```

Expected: the final SHA-256 value matches the builder and validator output.
