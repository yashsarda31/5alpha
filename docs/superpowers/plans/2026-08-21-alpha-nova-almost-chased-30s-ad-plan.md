# Alpha Nova “The Trade You Almost Chased” 30-Second Ad Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build and validate one new, self-contained 30-second 9:16 Alpha Nova HTML ad that converts active traders through the “Trade the plan. Not the panic.” story.

**Architecture:** Keep the creative in a readable HTML template, then use a deterministic Node packager to embed pinned local GSAP and Three.js runtimes into one portable public HTML file. A focused validator owns copy, timing, dependency, fallback, and offline contracts; deterministic frame controls make browser QA repeatable.

**Tech Stack:** HTML5, CSS, JavaScript ES modules, Three.js 0.166.1, GSAP 3.12.5, Node.js built-ins, Vite, browser automation.

## Global Constraints

- Deliver exactly one 30.0-second, autoplay-once, non-looping 9:16 ad.
- Target active traders with the approved **The Trade You Almost Chased** narrative.
- Present exactly three features: **Today**, **Signals**, and **Analyse**.
- Use the sequence **It’s moving.**, **Don’t miss it.**, **Wait.**, **See the market first.**, **Know the setup.**, **Check the move.**, and **Trade the plan. Not the panic.**
- Use CTA **Start free →** linking to `https://alphanova48.in/login?mode=signup`.
- Label all demonstration data **Illustrative** and include an educational-information disclaimer.
- Embed CSS, GSAP, Three.js, and runtime code; the CTA is the only allowed runtime network destination.
- Use no audio, playback controls, external fonts, images, analytics, tracking, React routes, or API calls.
- Preserve the complete message in normal WebGL, reduced-motion, and CSS fallback modes.
- Keep essential copy clear of Instagram Reels overlays at 1080 × 1920 and smaller portrait viewports.
- Do not modify `web/package.json` or `web/package-lock.json`; both contain unrelated work.
- Keep this work local; do not deploy or alter the Alpha Nova application.

---

## File Structure

- Create `web/scripts/validate-almost-chased-ad.mjs` — executable generated-ad contract.
- Create `web/scripts/build-almost-chased-ad.mjs` — deterministic packager for pinned local runtimes.
- Create `web/scripts/build-almost-chased-ad.test.mjs` — packager determinism and source-contract test.
- Create `web/scripts/assets/alpha-nova-almost-chased-30s-ad.template.html` — readable semantic, visual, and timeline source.
- Create `web/public/alpha-nova-almost-chased-30s-ad.html` — generated standalone deliverable.

### Task 1: Define the Generated-Ad Contract

**Files:**
- Create: `web/scripts/validate-almost-chased-ad.mjs`

**Interfaces:**
- Consumes: optional `process.argv[2]`; defaults to `web/public/alpha-nova-almost-chased-30s-ad.html`.
- Produces: exit code `0` and `ALMOST_CHASED_AD_CHECK=PASS`; otherwise throws a focused assertion.

- [ ] **Step 1: Write the failing validator**

```js
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import vm from 'node:vm';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const defaultAd = path.resolve(scriptDir, '../public/alpha-nova-almost-chased-30s-ad.html');
const target = process.argv[2] ? path.resolve(process.argv[2]) : defaultAd;
const html = await readFile(target, 'utf8');

assert.match(html, /<meta name="ad-duration" content="30">/);
assert.match(html, /<meta name="ad-aspect" content="9:16">/);
assert.match(html, /--stage-ratio:\s*9\s*\/\s*16/);
for (const copy of [
  'It’s moving.', 'Don’t miss it.', 'Wait.',
  'Today', 'See the market first.', 'Signals', 'Know the setup.',
  'ENTRY', 'STOP', 'TARGET', 'Analyse', 'Check the move.',
  'Trade the plan.', 'Not the panic.', 'Alpha Nova', 'Start free →',
  'alphanova48.in', 'Illustrative',
  'Analytics and educational information only. Not investment advice.',
]) assert.ok(html.includes(copy), `missing copy: ${copy}`);

assert.match(html, /href="https:\/\/alphanova48\.in\/login\?mode=signup"/);
assert.match(html, /const DURATION = 30;/);
assert.match(html, /gsap\.timeline\(\{ paused: true/);
assert.match(html, /await import\('data:text\/javascript;base64,/);
assert.match(html, /GSAP 3\.12\.5/);
assert.match(html, /prefers-reduced-motion:\s*reduce/);
assert.match(html, /searchParams\.get\('frame'\)/);
assert.match(html, /searchParams\.get\('renderer'\)/);
assert.match(html, /rendererParam === 'css'/);
assert.match(html, /visibilitychange/);
assert.match(html, /showFallback/);
assert.match(html, /aria-label="Create your free Alpha Nova account"/);
assert.doesNotMatch(html, /__[A-Z0-9_]+__/);
assert.doesNotMatch(html, /id="(?:controls|play|replay|mute|share|progress)"/i);
assert.doesNotMatch(html, /<audio\b|AudioContext|repeat:\s*-1\b/);

const scripts = [...html.matchAll(/<script(?:\s+type="module")?>([\s\S]*?)<\/script>/g)];
assert.equal(scripts.length, 2);
new vm.Script(scripts[0][1], { filename: 'embedded-gsap.js' });
new vm.Script(scripts[1][1], { filename: 'almost-chased-runtime.js' });

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
console.log(`ALMOST_CHASED_AD_CHECK=PASS three=${three.REVISION} bytes=${Buffer.byteLength(html)} sha256=${hash}`);
```

- [ ] **Step 2: Run the validator and confirm the contract starts red**

Run from `web/`:

```powershell
rtk node scripts/validate-almost-chased-ad.mjs
```

Expected: FAIL with `ENOENT` for `public/alpha-nova-almost-chased-30s-ad.html`.

- [ ] **Step 3: Commit the red contract**

```powershell
rtk git add web/scripts/validate-almost-chased-ad.mjs
rtk git commit -m "test: define almost chased ad contract"
```

### Task 2: Add the Deterministic Packaging Pipeline

**Files:**
- Create: `web/scripts/build-almost-chased-ad.mjs`
- Create: `web/scripts/build-almost-chased-ad.test.mjs`

**Interfaces:**
- Consumes: template tokens `__GSAP_SOURCE__` and `__THREE_DATA_URI__`, plus pinned no-save packages in `web/node_modules`.
- Produces: `web/public/alpha-nova-almost-chased-30s-ad.html` and deterministic SHA-256 output.

- [ ] **Step 1: Install pinned build inputs without changing package files**

Run from `web/`:

```powershell
rtk npm install --no-save --package-lock=false gsap@3.12.5 three@0.166.1
rtk npm ls gsap three --depth=0
```

Expected: `gsap@3.12.5` and `three@0.166.1`; `git diff -- package.json package-lock.json` is unchanged from its pre-task state.

- [ ] **Step 2: Create the packager**

```js
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const webDir = path.resolve(scriptDir, '..');
const templatePath = path.join(scriptDir, 'assets/alpha-nova-almost-chased-30s-ad.template.html');
const outputPath = path.join(webDir, 'public/alpha-nova-almost-chased-30s-ad.html');
const [template, gsapSource, threeSource] = await Promise.all([
  readFile(templatePath, 'utf8'),
  readFile(path.join(webDir, 'node_modules/gsap/dist/gsap.min.js'), 'utf8'),
  readFile(path.join(webDir, 'node_modules/three/build/three.module.min.js'), 'utf8'),
]);

assert.match(gsapSource, /GSAP 3\.12\.5/);
assert.doesNotMatch(threeSource, /\b(?:import|export)\s+(?:[^;]*?\sfrom\s*)?["']/);
const replacements = new Map([
  ['__GSAP_SOURCE__', gsapSource],
  ['__THREE_DATA_URI__', `data:text/javascript;base64,${Buffer.from(threeSource).toString('base64')}`],
]);
let output = template.replace(/\r\n/g, '\n');
for (const [token, value] of replacements) {
  assert.equal(output.split(token).length - 1, 1, `${token} must appear exactly once`);
  output = output.replace(token, value);
}
assert.doesNotMatch(output, /__[A-Z0-9_]+__/);
await mkdir(path.dirname(outputPath), { recursive: true });
await writeFile(outputPath, output, 'utf8');
console.log(`BUILT ${path.relative(webDir, outputPath)} (${Buffer.byteLength(output)} bytes)`);
```

- [ ] **Step 3: Add the deterministic builder test**

```js
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const webDir = path.resolve(scriptDir, '..');
const outputPath = path.join(webDir, 'public/alpha-nova-almost-chased-30s-ad.html');
const run = () => {
  const result = spawnSync(process.execPath, [path.join(scriptDir, 'build-almost-chased-ad.mjs')], {
    cwd: webDir, encoding: 'utf8',
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return readFile(outputPath, 'utf8');
};
const first = await run();
const second = await run();
assert.equal(createHash('sha256').update(first).digest('hex'), createHash('sha256').update(second).digest('hex'));
assert.equal((first.match(/__GSAP_SOURCE__|__THREE_DATA_URI__/g) || []).length, 0);
console.log('ALMOST_CHASED_BUILD_TEST=PASS');
```

- [ ] **Step 4: Run the test and confirm it fails before the template exists**

```powershell
rtk node scripts/build-almost-chased-ad.test.mjs
```

Expected: FAIL with `ENOENT` for the template.

- [ ] **Step 5: Commit the pipeline**

```powershell
rtk git add web/scripts/build-almost-chased-ad.mjs web/scripts/build-almost-chased-ad.test.mjs
rtk git commit -m "build: add almost chased ad packager"
```

### Task 3: Build the Semantic Film and Three.js Ribbon

**Files:**
- Create: `web/scripts/assets/alpha-nova-almost-chased-30s-ad.template.html`
- Generate: `web/public/alpha-nova-almost-chased-30s-ad.html`

**Interfaces:**
- Consumes: embedded `window.gsap`, imported Three.js module, `?frame=<0..30>`, and `?renderer=css`.
- Produces: `window.ALPHA_NOVA_AD` with `{ duration, timeline, state, ready, fallback }` for deterministic QA.

- [ ] **Step 1: Author the complete semantic stage**

The template must contain these exact stage elements so CSS fallback and accessibility do not depend on WebGL:

```html
<main id="stage" aria-label="Alpha Nova — The Trade You Almost Chased">
  <canvas id="world" aria-hidden="true"></canvas>
  <div id="fallback-ribbon" aria-hidden="true"></div>
  <div class="grain" aria-hidden="true"></div>
  <header class="brand"><span class="mark">A</span><span>Alpha Nova</span></header>
  <section class="beat" id="temptation"><p>It’s moving.</p></section>
  <section class="beat" id="chase"><p>Don’t miss it.</p></section>
  <section class="beat" id="wait"><p>Wait.</p></section>
  <section class="beat feature" id="today"><span>01 · Today</span><h1>See the market first.</h1><div class="market-summary">Market direction · Priority setups</div></section>
  <section class="beat feature" id="signals"><span>02 · Signals</span><h1>Know the setup.</h1><div class="levels"><b>ENTRY</b><b>STOP</b><b>TARGET</b></div></section>
  <section class="beat feature" id="analyse"><span>03 · Analyse</span><h1>Check the move.</h1><div class="chart-key">Trend · Structure · Setup zone</div></section>
  <section class="beat" id="payoff"><h1>Trade the plan.</h1><h1>Not the panic.</h1></section>
  <section class="beat" id="end-card"><div class="end-mark">A</div><h1>Alpha Nova</h1><a href="https://alphanova48.in/login?mode=signup" aria-label="Create your free Alpha Nova account">Start free →</a><p>alphanova48.in</p></section>
  <span id="illustrative">Illustrative</span>
  <footer>Analytics and educational information only. Not investment advice.</footer>
</main>
```

Use inline CSS with `--stage-ratio: 9 / 16`, `100svh`, portrait-safe padding `max(6.5vh, 48px) max(8vw, 42px) max(10vh, 72px)`, a warm-white studio background, near-black type, cool-blue clarity accents, chase-only red, and `@media (prefers-reduced-motion: reduce)`. Each `.beat` starts hidden; `body.ready` reveals only the active beat. `body.fallback` reveals `#fallback-ribbon` and hides the canvas.

- [ ] **Step 2: Implement the reusable ribbon geometry**

Create a subdivided strip with two vertices per segment and mutate the same buffers each frame:

```js
function createRibbon(THREE, segments = 180) {
  const positions = new Float32Array((segments + 1) * 2 * 3);
  const colors = new Float32Array((segments + 1) * 2 * 3);
  const indices = [];
  for (let i = 0; i < segments; i += 1) {
    const a = i * 2;
    indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  const material = new THREE.MeshPhysicalMaterial({
    color: 0xffffff, vertexColors: true, roughness: 0.28, metalness: 0.05,
    clearcoat: 0.7, clearcoatRoughness: 0.18, side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = true;
  return { mesh, geometry, positions, colors, segments };
}

function updateRibbon(ribbon, state, THREE) {
  const { positions, colors, segments, geometry } = ribbon;
  const calm = new THREE.Color('#dce8f8');
  const hot = new THREE.Color('#ff3b30');
  for (let i = 0; i <= segments; i += 1) {
    const u = i / segments;
    const x = (u - 0.5) * 12;
    const base = Math.sin(u * 8.4) * 0.32 + Math.sin(u * 21) * 0.08;
    const surge = Math.pow(Math.max(0, u - 0.58) / 0.42, 2.4) * 4.2 * state.chase;
    const instability = Math.sin(u * 38 + state.phase) * 0.22 * state.pressure;
    const y = base + surge + instability;
    const width = 0.36 + state.pressure * 0.18;
    const color = calm.clone().lerp(hot, state.heat * Math.max(0, (u - 0.35) / 0.65));
    for (let side = 0; side < 2; side += 1) {
      const offset = (i * 2 + side) * 3;
      positions[offset] = x;
      positions[offset + 1] = y + (side ? width : -width);
      positions[offset + 2] = Math.sin(u * Math.PI) * 0.35 * state.depth;
      colors[offset] = color.r; colors[offset + 1] = color.g; colors[offset + 2] = color.b;
    }
  }
  geometry.attributes.position.needsUpdate = true;
  geometry.attributes.color.needsUpdate = true;
  geometry.computeVertexNormals();
}
```

Add a soft shadow plane, hemisphere light, two large area-like point lights, a perspective camera, three spatial level lines for ENTRY/STOP/TARGET, and a chart line that becomes visible only during Analyse. Keep the renderer pixel ratio capped at `Math.min(devicePixelRatio, 2)`.

- [ ] **Step 3: Implement the exact GSAP story clock**

```js
const DURATION = 30;
const state = { chase: 0, pressure: 0, heat: 0, depth: 0.25, phase: 0, levels: 0, chart: 0 };
const beats = ['temptation', 'chase', 'wait', 'today', 'signals', 'analyse', 'payoff', 'end-card'];
const showBeat = (id) => beats.forEach((name) => gsap.set(`#${name}`, { autoAlpha: name === id ? 1 : 0, y: name === id ? 0 : 24 }));
const timeline = gsap.timeline({ paused: true, defaults: { ease: 'power3.inOut' } });
timeline
  .call(() => showBeat('temptation'), [], 0)
  .to(state, { chase: 0.2, phase: 2, duration: 4, ease: 'power1.in' }, 0)
  .call(() => showBeat('chase'), [], 4)
  .to(state, { chase: 1, pressure: 1, heat: 1, depth: 1, phase: 15, duration: 4, ease: 'expo.in' }, 4)
  .to(camera.position, { z: 4.6, y: 1.2, duration: 4, ease: 'expo.in' }, 4)
  .call(() => showBeat('wait'), [], 8)
  .to({}, { duration: 2 }, 8)
  .call(() => showBeat('today'), [], 10)
  .to(state, { chase: 0.15, pressure: 0, heat: 0, depth: 0.35, phase: 0, duration: 4 }, 10)
  .to(camera.position, { z: 8.8, y: 0, duration: 4 }, 10)
  .call(() => showBeat('signals'), [], 14)
  .to(state, { levels: 1, duration: 5 }, 14)
  .call(() => showBeat('analyse'), [], 19)
  .to(state, { levels: 0.25, chart: 1, duration: 5 }, 19)
  .call(() => showBeat('payoff'), [], 24)
  .to(state, { chart: 0, chase: 0.3, duration: 3 }, 24)
  .call(() => showBeat('end-card'), [], 27)
  .to(state, { chase: 0, depth: 0, duration: 3 }, 27)
  .to({}, { duration: 0.001 }, DURATION - 0.001);
```

Add per-beat headline entrance/exit tweens without shifting the listed beat boundaries. `timeline.duration()` must equal `30`.

- [ ] **Step 4: Implement startup, deterministic frames, and recovery**

```js
function showFallback(reason) {
  document.body.classList.add('ready', 'fallback');
  window.ALPHA_NOVA_AD = { duration: DURATION, timeline, state, ready: true, fallback: true, reason };
  timeline.play(0);
}

const searchParams = new URL(location.href).searchParams;
const frame = Number(searchParams.get('frame'));
const rendererParam = searchParams.get('renderer');
if (rendererParam === 'css') showFallback('forced-css');
else {
  document.body.classList.add('ready');
  window.ALPHA_NOVA_AD = { duration: DURATION, timeline, state, ready: true, fallback: false };
  if (Number.isFinite(frame)) timeline.pause(Math.min(DURATION, Math.max(0, frame)));
  else timeline.play(0);
}
document.addEventListener('visibilitychange', () => {
  if (document.hidden) timeline.pause();
  else if (!Number.isFinite(frame) && timeline.time() < DURATION) timeline.resume();
});
```

Wrap Three.js import and initialization in `try/catch`; call `showFallback(error.message)` on failure. Add a five-second watchdog that removes any loading state and starts CSS fallback if `window.ALPHA_NOVA_AD?.ready` is not true.

- [ ] **Step 5: Build and run the red contracts green**

```powershell
rtk node scripts/build-almost-chased-ad.mjs
rtk node scripts/build-almost-chased-ad.test.mjs
rtk node scripts/validate-almost-chased-ad.mjs
```

Expected: `BUILT`, `ALMOST_CHASED_BUILD_TEST=PASS`, and `ALMOST_CHASED_AD_CHECK=PASS three=166`.

- [ ] **Step 6: Commit the film and generated artifact**

```powershell
rtk git add web/scripts/assets/alpha-nova-almost-chased-30s-ad.template.html web/public/alpha-nova-almost-chased-30s-ad.html
rtk git commit -m "feat: build almost chased Alpha Nova ad"
```

### Task 4: Browser QA and Final Verification

**Files:**
- Verify: `web/public/alpha-nova-almost-chased-30s-ad.html`
- Verify: `web/scripts/assets/alpha-nova-almost-chased-30s-ad.template.html`

**Interfaces:**
- Consumes: direct `file://` URL and deterministic frame URLs.
- Produces: evidence that opening state, timing, mobile safety, fallback, and offline packaging meet the spec.

- [ ] **Step 1: Run all structural checks from a clean invocation**

```powershell
rtk node scripts/build-almost-chased-ad.test.mjs
rtk node scripts/validate-almost-chased-ad.mjs
rtk git diff --check
```

Expected: both PASS markers and no whitespace errors in the new files.

- [ ] **Step 2: Inspect deterministic WebGL frames**

Open the generated file at `?frame=0`, `5`, `9`, `12`, `17`, `22`, `25`, and `29`. At each frame, assert the visible beat respectively matches temptation, chase, wait, Today, Signals, Analyse, payoff, and CTA. Capture 1080 × 1920 screenshots for frame 0, 9, 17, 25, and 29.

- [ ] **Step 3: Verify real autoplay and visibility behavior**

Open without `?frame`, confirm the initial copy is **It’s moving.**, wait through at least 12 seconds to confirm progression into **See the market first.**, then background and restore the page to verify the timeline resumes without jumping. Confirm it stops on the CTA at 30 seconds and does not restart.

- [ ] **Step 4: Verify CSS fallback and reduced motion**

Open `?renderer=css&frame=0`, `?renderer=css&frame=17`, and `?renderer=css&frame=29`. Emulate `prefers-reduced-motion: reduce` and repeat frames 0, 12, and 29. Confirm every story beat remains readable and no final-frame flash appears during startup.

- [ ] **Step 5: Verify portrait safety and direct-file portability**

Check 1080 × 1920 and 390 × 844 viewports for clipped text, right-side Reels overlay conflicts, horizontal overflow, and CTA legibility. Disable network access and reopen the direct `file://` artifact; confirm WebGL playback still initializes and the CTA remains the only external navigation.

- [ ] **Step 6: Review only the intended change set**

```powershell
rtk git status --short
rtk git diff --stat HEAD~3..HEAD -- docs/superpowers/specs/2026-08-21-alpha-nova-trade-you-almost-chased-30s-ad-design.md docs/superpowers/plans/2026-08-21-alpha-nova-almost-chased-30s-ad-plan.md web/scripts web/public/alpha-nova-almost-chased-30s-ad.html
```

Expected: the ad spec, plan, validator, builder, builder test, template, and generated HTML only. Do not stage or modify unrelated dirty files.
