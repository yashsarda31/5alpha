# Alpha Nova “X-Ray the Trade” 30-Second Ad Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build and validate one polished, self-contained 30-second 9:16 Alpha Nova HTML ad that converts active Indian traders to free account creation.

**Architecture:** Keep the creative in a readable HTML template, then use a deterministic Node packager to embed exact local GSAP and Three.js runtimes into one portable public HTML file. A focused validator owns the copy, duration, dependency, fallback, accessibility, and offline contracts; deterministic frame controls make browser QA repeatable.

**Tech Stack:** HTML5, CSS, JavaScript ES modules, Three.js 0.166.1, GSAP 3.12.5, Node.js built-ins, Vite 8, browser automation.

## Global Constraints

- Deliver exactly one 30.0-second, autoplay-once, non-looping 9:16 ad.
- Target active Indian traders with the approved **X-Ray the Trade** concept.
- Use the exact sequence **Most traders see a price.**, **There’s more underneath.**, **See the setup.**, **Know the levels.**, **Check the proof.**, and **See the whole trade.**
- Present exactly three features: **Chart Analyser**, **Market Signals**, and **Signal Track Record**.
- Use CTA **START FREE →** linking to `https://alphanova48.in/login?mode=signup`.
- Label all demonstration data **Illustrative**.
- Include `alphanova48.in` and a concise educational-information disclaimer.
- Embed all CSS, GSAP, Three.js, and runtime code; the CTA is the only allowed runtime network destination.
- Use no audio, playback controls, external fonts, images, analytics, tracking, React routes, or API calls.
- Preserve the complete message in normal WebGL, reduced-motion, and CSS fallback modes.
- Keep essential copy clear of Instagram Reels overlays at 1080 × 1920 and smaller portrait viewports.
- Do not modify `web/package.json` or `web/package-lock.json`; both already contain unrelated work.
- Keep this work local; do not deploy or alter the Alpha Nova application.

---

## File Structure

- Create `web/scripts/validate-xray-trade-ad.mjs` — executable generated-ad contract.
- Create `web/scripts/build-xray-trade-ad.mjs` — deterministic packager for pinned local runtimes.
- Create `web/scripts/assets/alpha-nova-xray-trade-30s-ad.template.html` — readable semantic, visual, and timeline source.
- Create `web/public/alpha-nova-xray-trade-30s-ad.html` — generated standalone deliverable.
- Generate `web/dist/alpha-nova-xray-trade-30s-ad.html` — Vite copy used only for equality verification.

### Task 1: Define the Generated-Ad Contract

**Files:**
- Create: `web/scripts/validate-xray-trade-ad.mjs`

**Interfaces:**
- Consumes: optional `process.argv[2]`; defaults to `web/public/alpha-nova-xray-trade-30s-ad.html`.
- Produces: exit code `0` and `XRAY_TRADE_AD_CHECK=PASS`; otherwise throws a focused assertion.

- [ ] **Step 1: Write the failing validator**

Create the validator with these exact contracts:

```js
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import vm from 'node:vm';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const defaultAd = path.resolve(scriptDir, '../public/alpha-nova-xray-trade-30s-ad.html');
const target = process.argv[2] ? path.resolve(process.argv[2]) : defaultAd;
const html = await readFile(target, 'utf8');

assert.match(html, /<meta name="ad-duration" content="30">/);
assert.match(html, /--stage-ratio:\s*9\s*\/\s*16/);
for (const copy of [
  'Most traders see a price.', 'There’s more underneath.', 'Chart Analyser',
  'See the setup.', 'Market Signals', 'Know the levels.', 'ENTRY', 'STOP', 'TARGET',
  'Signal Track Record', 'Check the proof.', 'WINS', 'LOSSES', 'OPEN',
  'See the whole trade.', 'START FREE →', 'alphanova48.in', 'Illustrative',
  'Analytics and educational information only. Not investment advice.',
]) assert.ok(html.includes(copy), `missing copy: ${copy}`);

assert.match(html, /href="https:\/\/alphanova48\.in\/login\?mode=signup"/);
assert.match(html, /const DURATION = 30;/);
assert.match(html, /gsap\.timeline\(\{ paused: true \}\)/);
assert.match(html, /await import\('data:text\/javascript;base64,/);
assert.match(html, /GSAP 3\.12\.5/);
assert.match(html, /prefers-reduced-motion: reduce/);
assert.match(html, /get\('frame'\)/);
assert.match(html, /get\('renderer'\)/);
assert.match(html, /rendererParam === 'css'/);
assert.match(html, /showFallback/);
assert.match(html, /aria-label="Create your free Alpha Nova account"/);
assert.doesNotMatch(html, /__[A-Z0-9_]+__/);
assert.doesNotMatch(html, /id="(?:controls|play|replay|mute|share|progress)"/i);
assert.doesNotMatch(html, /<audio\b|AudioContext|repeat:\s*-1\b/);

const scripts = [...html.matchAll(/<script(?:\s+type="module")?>([\s\S]*?)<\/script>/g)];
assert.equal(scripts.length, 2);
new vm.Script(scripts[0][1], { filename: 'embedded-gsap.js' });
new vm.Script(scripts[1][1], { filename: 'xray-trade-runtime.js' });

const threeUri = html.match(/await import\('(data:text\/javascript;base64,[^']+)'\)/)?.[1];
assert.ok(threeUri, 'embedded Three.js module missing');
const threeSource = Buffer.from(threeUri.split(',')[1], 'base64').toString('utf8');
assert.doesNotMatch(threeSource, /\b(?:import|export)\s+(?:[^;]*?\sfrom\s*)?["']/);
const three = await import(threeUri);
assert.equal(three.REVISION, '166');

const runtimeUrls = [...html.matchAll(/(?:src|href)="(https?:\/\/[^\"]+)"/g)]
  .map((match) => match[1])
  .filter((url) => url !== 'https://alphanova48.in/login?mode=signup');
assert.deepEqual(runtimeUrls, []);

const hash = createHash('sha256').update(html).digest('hex');
console.log(`XRAY_TRADE_AD_CHECK=PASS three=${three.REVISION} bytes=${Buffer.byteLength(html)} sha256=${hash}`);
```

- [ ] **Step 2: Run the validator and confirm the contract starts red**

Run from `web/`:

```powershell
rtk node scripts/validate-xray-trade-ad.mjs
```

Expected: FAIL with `ENOENT` for `public/alpha-nova-xray-trade-30s-ad.html`.

- [ ] **Step 3: Commit the red contract**

```powershell
rtk git add web/scripts/validate-xray-trade-ad.mjs
rtk git commit -m "test: define xray trade ad contract"
```

### Task 2: Add the Deterministic Packaging Pipeline

**Files:**
- Create: `web/scripts/build-xray-trade-ad.mjs`

**Interfaces:**
- Consumes: template tokens `__GSAP_SOURCE__` and `__THREE_DATA_URI__`, plus exact no-save packages in `web/node_modules`.
- Produces: `web/public/alpha-nova-xray-trade-30s-ad.html`.

- [ ] **Step 1: Install pinned build inputs without changing package files**

Run from `web/`:

```powershell
rtk npm install --no-save --package-lock=false gsap@3.12.5 three@0.166.1
rtk npm ls gsap three --depth=0
```

Expected: `gsap@3.12.5` and `three@0.166.1`; `git diff -- package.json package-lock.json` remains identical to its pre-task state.

- [ ] **Step 2: Create the packager**

```js
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const webDir = path.resolve(scriptDir, '..');
const templatePath = path.join(scriptDir, 'assets/alpha-nova-xray-trade-30s-ad.template.html');
const outputPath = path.join(webDir, 'public/alpha-nova-xray-trade-30s-ad.html');
const [template, gsapSource, threeSource] = await Promise.all([
  readFile(templatePath, 'utf8'),
  readFile(path.join(webDir, 'node_modules/gsap/dist/gsap.min.js'), 'utf8'),
  readFile(path.join(webDir, 'node_modules/three/build/three.module.min.js'), 'utf8'),
]);

assert.match(gsapSource, /GSAP 3\.12\.5/);
assert.doesNotMatch(threeSource, /\b(?:import|export)\s+(?:[^;]*?\sfrom\s*)?["']/);
const values = new Map([
  ['__GSAP_SOURCE__', gsapSource],
  ['__THREE_DATA_URI__', `data:text/javascript;base64,${Buffer.from(threeSource).toString('base64')}`],
]);
let output = template.replace(/\r\n/g, '\n');
for (const [token, value] of values) {
  assert.equal(output.split(token).length - 1, 1, `${token} must appear exactly once`);
  output = output.replace(token, value);
}
assert.doesNotMatch(output, /__[A-Z0-9_]+__/);
await mkdir(path.dirname(outputPath), { recursive: true });
await writeFile(outputPath, output, 'utf8');
console.log(`BUILT ${path.relative(webDir, outputPath)} (${Buffer.byteLength(output)} bytes)`);
```

- [ ] **Step 3: Prove the packager parses but cannot build before the template exists**

```powershell
rtk node --check scripts/build-xray-trade-ad.mjs
rtk node scripts/build-xray-trade-ad.mjs
```

Expected: parse succeeds; build fails with `ENOENT` for the template.

- [ ] **Step 4: Commit the packaging foundation**

```powershell
rtk git add web/scripts/build-xray-trade-ad.mjs
rtk git commit -m "build: add xray trade ad packager"
```

### Task 3: Build the 30-Second Film

**Files:**
- Create: `web/scripts/assets/alpha-nova-xray-trade-30s-ad.template.html`
- Create: `web/public/alpha-nova-xray-trade-30s-ad.html`

**Interfaces:**
- Consumes: global `gsap`, dynamically imported `THREE`, and query parameters `frame`, `renderer`, and `motion`.
- Produces: beat IDs `hook`, `reveal`, `chart`, `signals`, `record`, `payoff`; functions `createStudio(THREE)`, `startFilm(world)`, `buildTimeline(world)`, `seekFrame(seconds)`, and `showFallback(reason)`.

- [ ] **Step 1: Create the semantic Reel-safe shell**

Use this beat structure inside `<main id="stage">`:

```html
<canvas id="world" aria-hidden="true"></canvas>
<div id="css-monolith" aria-hidden="true"><span>RELIANCE</span><strong>₹1,428.60</strong></div>
<section class="beat" id="hook"><h1>Most traders<br>see a price.</h1></section>
<section class="beat" id="reveal"><h2>There’s more<br>underneath.</h2></section>
<section class="beat feature" id="chart"><p>01 · Chart Analyser</p><h2>See the setup.</h2></section>
<section class="beat feature" id="signals"><p>02 · Market Signals</p><h2>Know the levels.</h2><div class="levels"><span>ENTRY</span><span>STOP</span><span>TARGET</span></div></section>
<section class="beat feature" id="record"><p>03 · Signal Track Record</p><h2>Check the proof.</h2><div class="outcomes"><span>WINS</span><span>LOSSES</span><span>OPEN</span></div></section>
<section class="beat" id="payoff"><p>ALPHA NOVA</p><h2>See the whole trade.</h2><a href="https://alphanova48.in/login?mode=signup" aria-label="Create your free Alpha Nova account">START FREE →</a><strong>alphanova48.in</strong></section>
<aside id="legal"><span>Illustrative</span> · Analytics and educational information only. Not investment advice.</aside>
```

Add `<meta name="ad-duration" content="30">`, define `--stage-ratio: 9 / 16`, and use `min-height: 100svh`. Keep copy inside `left/right: 8.5%`, the final CTA above the bottom 15%, and the legal line above the bottom 6%.

- [ ] **Step 2: Implement the visual system and CSS fallback**

- Use a warm-white studio background, graphite typography, frosted glass, cool grey, and one restrained electric-blue accent.
- Define `.beat` as hidden by default and `.beat.is-static` for failure fallback.
- Build `#css-monolith` as a layered translucent rounded rectangle with inset highlights and a soft elliptical shadow.
- Add responsive type with `clamp()` and an `@media (max-aspect-ratio: 9/19)` adjustment for short portrait screens.
- Under `prefers-reduced-motion: reduce`, disable decorative CSS drift while leaving GSAP beat timing active.
- Add `.static-final` rules that show only `#payoff`, `#legal`, and the static monolith if GSAP cannot initialize.

- [ ] **Step 3: Build the Three.js studio and monolith**

`createStudio(THREE)` returns this exact world contract:

```js
{
  renderer, scene, camera, root, monolith, shell, priceLayer, chartLayer,
  signalLayer, recordLayer, scanPlane, alphaMark, contactShadow,
  resize(), render(), dispose()
}
```

Implementation requirements:

- Use `WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' })` and clamp pixel ratio to `Math.min(devicePixelRatio, 2)`.
- Build the monolith from a rounded-box approximation using layered `BoxGeometry` meshes: a transparent physical shell and four shallow internal planes.
- Use `MeshPhysicalMaterial` with restrained transparency, roughness, clearcoat, and transmission; do not add postprocessing.
- Render the RELIANCE price through a `CanvasTexture` on `priceLayer`.
- Build six simple candlesticks and a blue line path inside `chartLayer`.
- Build entry, stop, and target planes inside `signalLayer` using blue, graphite, and pale-red materials.
- Build a three-column ledger inside `recordLayer`, with win, loss, and open bars visible together.
- Build the final Alpha Nova mark from two slim metallic meshes and one crossbar; keep it hidden until the payoff.
- Use one hemisphere light, two directional studio lights, and one rim light.
- Keep camera framing portrait-safe using `camera.position.z = aspect < 0.52 ? 9.2 : 8.4`.

- [ ] **Step 4: Implement the deterministic GSAP master timeline**

Use one paused timeline and these boundaries:

```js
const DURATION = 30;
const BEATS = Object.freeze({ hook: 0, reveal: 4, chart: 9, signals: 14, record: 19, payoff: 24, end: 30 });
const timeline = gsap.timeline({ paused: true });
```

The sequence must:

- show `#hook` from `0.25–3.65` while the camera approaches the opaque price layer;
- move `scanPlane` through the monolith from `4.0–8.6` and reveal internal layers progressively;
- show `#chart` from `9.0–13.6`, move `chartLayer` forward, and draw the trend path;
- show `#signals` from `14.0–18.6`, lock entry, stop, and target planes into place;
- show `#record` from `19.0–23.6`, rotate the monolith to expose the outcome ledger;
- show `#payoff` from `24.0–30.0`, align all layers, fade them into the Alpha Nova mark, and hold the CTA;
- pause at `DURATION` on completion and never set `repeat`.

Use `?frame=<seconds>` to seek without autoplay, `?motion=full` to override reduced motion for deterministic QA, and pause/resume on `visibilitychange` only when the timeline had been playing.

- [ ] **Step 5: Implement reduced motion and failure behavior**

- Reduced motion retains all beat boundaries but caps camera/object transitions at `0.16` seconds and removes rotations greater than 12 degrees.
- `renderer=css` calls `showFallback('forced')` before importing Three.js and runs the DOM-only 30-second timeline.
- Any Three.js setup error calls `showFallback('webgl')` and runs the DOM-only timeline.
- If GSAP is unavailable, add `static-final` immediately so the CTA is never hidden.
- Resizing recomputes renderer size, pixel ratio, camera aspect, camera distance, and DOM safe-area variables without restarting the timeline.

- [ ] **Step 6: Embed runtimes, build, and turn the validator green**

Use one classic GSAP script and one module runtime:

```html
<script>__GSAP_SOURCE__</script>
<script type="module">
const rendererParam = new URLSearchParams(location.search).get('renderer');
async function boot() {
  if (!globalThis.gsap) return document.documentElement.classList.add('static-final');
  if (rendererParam === 'css') return showFallback('forced');
  const THREE = await import('__THREE_DATA_URI__');
  startFilm(createStudio(THREE));
}
boot().catch(() => showFallback('webgl'));
</script>
```

Run from `web/`:

```powershell
rtk node scripts/build-xray-trade-ad.mjs
rtk node scripts/validate-xray-trade-ad.mjs
```

Expected: `XRAY_TRADE_AD_CHECK=PASS three=166` with bytes and SHA-256.

- [ ] **Step 7: Commit the complete film**

```powershell
rtk git add web/scripts/assets/alpha-nova-xray-trade-30s-ad.template.html web/public/alpha-nova-xray-trade-30s-ad.html
rtk git commit -m "feat: add xray the trade ad"
```

### Task 4: Perform Visual, Timing, and Fallback QA

**Files:**
- Modify on QA failure: `web/scripts/assets/alpha-nova-xray-trade-30s-ad.template.html`
- Regenerate after fixes: `web/public/alpha-nova-xray-trade-30s-ad.html`

**Interfaces:**
- Consumes: deterministic `frame`, `renderer`, and `motion` parameters.
- Produces: verified frames at `1.0`, `6.5`, `11.5`, `16.5`, `21.5`, and `27.0` seconds.

- [ ] **Step 1: Build and start a local preview**

```powershell
rtk npm run build
rtk npm run preview -- --host 127.0.0.1 --port 4173
```

Expected: `/alpha-nova-xray-trade-30s-ad.html` returns `200`.

- [ ] **Step 2: Inspect all six deterministic frames at 1080 × 1920**

Open `http://127.0.0.1:4173/alpha-nova-xray-trade-30s-ad.html?frame=<time>&motion=full` for every listed time.

Expected: one dominant headline per beat; the monolith remains fully framed; feature geometry matches its label; the final CTA and legal line remain clear of Reels overlays.

- [ ] **Step 3: Repeat at 390 × 844**

Expected: no clipped headline, horizontal overflow, hidden CTA, illegible legal copy, or right-edge collision.

- [ ] **Step 4: Inspect CSS fallback and reduced motion**

Repeat the frames with `renderer=css`, then emulate reduced motion without `motion=full`.

Expected: all six messages appear at the same boundaries; no blank stage, premature payoff, layout jump, or console error.

- [ ] **Step 5: Verify direct-file playback**

Open `web/public/alpha-nova-xray-trade-30s-ad.html` through `file://` and watch from `0.0–30.0`.

Expected: autoplay starts without user input, reaches the stable CTA at 30 seconds, and never loops.

- [ ] **Step 6: Rebuild and commit only if QA requires a correction**

```powershell
rtk node scripts/build-xray-trade-ad.mjs
rtk node scripts/validate-xray-trade-ad.mjs
rtk git add web/scripts/assets/alpha-nova-xray-trade-30s-ad.template.html web/public/alpha-nova-xray-trade-30s-ad.html
rtk git commit -m "fix: polish xray trade ad playback"
```

### Task 5: Run the Final Repository Gate

**Files:**
- Generate: `web/dist/alpha-nova-xray-trade-30s-ad.html`

**Interfaces:**
- Consumes: validated public artifact and existing Vite application.
- Produces: clean focused validation, clean targeted parsing, successful Vite build, and source/dist equality.

- [ ] **Step 1: Run focused validation and parsing**

```powershell
rtk node --check scripts/build-xray-trade-ad.mjs
rtk node --check scripts/validate-xray-trade-ad.mjs
rtk node scripts/build-xray-trade-ad.mjs
rtk node scripts/validate-xray-trade-ad.mjs
```

Expected: both scripts parse and the focused validator passes.

- [ ] **Step 2: Run the frontend build**

```powershell
rtk npm run build
```

Expected: Vite exits `0` and copies the public HTML into `web/dist`.

- [ ] **Step 3: Prove source/dist equality**

```powershell
$sourceHash = (Get-FileHash -Algorithm SHA256 -LiteralPath 'public\alpha-nova-xray-trade-30s-ad.html').Hash
$distHash = (Get-FileHash -Algorithm SHA256 -LiteralPath 'dist\alpha-nova-xray-trade-30s-ad.html').Hash
if ($sourceHash -ne $distHash) { throw 'source/dist hash mismatch' }
$sourceHash
```

Expected: one SHA-256 value prints without an exception.

- [ ] **Step 4: Run scope and whitespace checks**

From the repository root:

```powershell
rtk git diff --check -- web/scripts/build-xray-trade-ad.mjs web/scripts/validate-xray-trade-ad.mjs web/scripts/assets/alpha-nova-xray-trade-30s-ad.template.html web/public/alpha-nova-xray-trade-30s-ad.html
rtk git status --short
```

Expected: no scoped whitespace errors; all unrelated modified and untracked work remains untouched.

- [ ] **Step 5: Restore generated distribution churn**

Restore only tracked `web/dist` changes created by the build, preserving the validated source artifact. Do not stage or commit unrelated distribution files.

- [ ] **Step 6: Report the local deliverable**

Report absolute paths to the final HTML, readable template, builder, and validator. Include structural validation, browser-frame QA, CSS fallback, reduced motion, direct-file playback, Vite build, and source/dist hash results. State explicitly that nothing was deployed.
