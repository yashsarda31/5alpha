# Alpha Nova Alpha Core 20-Second Ad Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build and validate one self-contained 20-second 9:16 Alpha Nova “Alpha Core” HTML ad using embedded Three.js and GSAP.

**Architecture:** Work in an isolated `codex/alpha-nova-alpha-core-ad` worktree because the main checkout contains extensive unrelated changes. A source template owns semantic copy, CSS, the Three.js scene, and the GSAP master timeline; a Node builder injects pinned local library sources into one portable HTML output; a Node validator enforces the content, timing, portability, and accessibility contract.

**Tech Stack:** HTML5, CSS, JavaScript modules, Three.js 0.166.1, GSAP 3.12.5, Node.js built-in test/assert tooling, Vite 8.

## Global Constraints

- Output is one `web/public/alpha-nova-alpha-core-20s-ad.html` file with no runtime dependency except CTA navigation.
- Master composition is 9:16 and safe for 1080×1920 reels.
- Runtime duration is exactly 20.0 seconds and autoplay runs once with no playback controls.
- Exact benefit copy is `Highest-quality signals.`, `Real-time alerts. Free.`, and `World-class analytics.`
- End-card copy is `See what others miss.`, `ALPHA NOVA`, and `START FREE →`.
- CTA is `https://alphanova48.in/signals`.
- Final disclaimer is `Analytics and educational information only. Not investment advice.`
- No phone mockup, dashboard walkthrough, clock, trader, investor trail, or noise-to-signal transformation.
- No external font, image, stylesheet, script, audio, analytics, or API request.
- Preserve reduced-motion, WebGL fallback, deterministic `?frame=<seconds>`, and hidden-document pause behavior.
- Do not deploy or change the React application or API.

## File Structure

- Create `web/scripts/assets/alpha-nova-alpha-core-20s-ad.template.html`: source markup, styling, Three.js scene, fallback state, and GSAP timeline.
- Create `web/scripts/build-alpha-core-ad.mjs`: inject pinned GSAP and Three.js sources into the template and write the portable HTML.
- Create `web/scripts/validate-alpha-core-ad.mjs`: structural and runtime-source contract checks for copy, timing, libraries, portability, and controls.
- Create `web/public/alpha-nova-alpha-core-20s-ad.html`: generated deliverable; never hand-edit.
- Modify `web/package.json`: pinned build dependencies and focused scripts.
- Modify `web/package-lock.json`: lock the exact GSAP and Three.js versions.

---

### Task 1: Establish the portable build and validation contract

**Files:**
- Create: `web/scripts/build-alpha-core-ad.mjs`
- Create: `web/scripts/validate-alpha-core-ad.mjs`
- Modify: `web/package.json`
- Modify: `web/package-lock.json`
- Test: `web/scripts/validate-alpha-core-ad.mjs`

**Interfaces:**
- Consumes: `web/scripts/assets/alpha-nova-alpha-core-20s-ad.template.html`, `node_modules/gsap/dist/gsap.min.js`, and `node_modules/three/build/three.module.min.js`.
- Produces: `npm run build:alpha-core-ad`, `npm run test:alpha-core-ad`, and generated `web/public/alpha-nova-alpha-core-20s-ad.html`.

- [ ] **Step 1: Create the isolated execution worktree**

Run the `using-git-worktrees` skill, create branch `codex/alpha-nova-alpha-core-ad`, and verify the new worktree begins clean. Do not alter or clean the main checkout.

- [ ] **Step 2: Install exact build-only libraries**

Run from the isolated `web` directory:

```powershell
rtk npm install --save-dev --save-exact gsap@3.12.5 three@0.166.1
```

Expected: `package.json` contains exact versions `3.12.5` and `0.166.1`, and `package-lock.json` resolves both packages without audit errors at high severity.

- [ ] **Step 3: Write the validator before the output exists**

Create `web/scripts/validate-alpha-core-ad.mjs` with this contract:

```js
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import vm from 'node:vm';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const defaultAd = path.resolve(scriptDir, '../public/alpha-nova-alpha-core-20s-ad.html');
const target = process.argv[2] ? path.resolve(process.argv[2]) : defaultAd;
const html = await readFile(target, 'utf8');

assert.match(html, /<meta name="ad-duration" content="20">/);
assert.match(html, /--stage-ratio:\s*9\s*\/\s*16/);
for (const copy of [
  'The market never stops.',
  'Highest-quality signals.',
  'Real-time alerts. Free.',
  'World-class analytics.',
  'See what others miss.',
  'ALPHA NOVA',
  'START FREE →',
  'Analytics and educational information only. Not investment advice.',
]) assert.ok(html.includes(copy), `missing copy: ${copy}`);

assert.match(html, /href="https:\/\/alphanova48\.in\/signals"/);
assert.match(html, /const DURATION = 20;/);
assert.match(html, /gsap\.timeline\(\{ paused: true \}\)/);
assert.match(html, /await import\('data:text\/javascript;base64,/);
assert.match(html, /GSAP 3\.12\.5/);
assert.match(html, /prefers-reduced-motion: reduce/);
assert.match(html, /new URLSearchParams\(location\.search\)\.get\('frame'\)/);
assert.match(html, /document\.visibilityState === 'hidden'/);
assert.match(html, /showFallback/);
assert.doesNotMatch(html, /__[A-Z0-9_]+__/);
assert.doesNotMatch(html, /id="(?:controls|play|replay|mute|share|progress)"/i);
assert.doesNotMatch(html, /<audio\b|AudioContext|repeat:\s*-?1/);

const scripts = [...html.matchAll(/<script(?:\s+type="module")?>([\s\S]*?)<\/script>/g)];
assert.equal(scripts.length, 2);
new vm.Script(scripts[0][1], { filename: 'embedded-gsap.js' });
new vm.Script(scripts[1][1], { filename: 'alpha-core-runtime.js' });

const threeUri = html.match(/await import\('(data:text\/javascript;base64,[^']+)'\)/)?.[1];
assert.ok(threeUri, 'embedded Three.js module missing');
const threeSource = Buffer.from(threeUri.split(',')[1], 'base64').toString('utf8');
assert.doesNotMatch(threeSource, /\b(?:import|export)\s+(?:[^;]*?\sfrom\s*)?["']/);
const three = await import(threeUri);
assert.equal(three.REVISION, '166');

const runtimeUrls = [...html.matchAll(/(?:src|href)="(https?:\/\/[^\"]+)"/g)]
  .map((match) => match[1])
  .filter((url) => url !== 'https://alphanova48.in/signals');
assert.deepEqual(runtimeUrls, []);

const hash = createHash('sha256').update(html).digest('hex');
console.log(`ALPHA_CORE_AD_CHECK=PASS three=${three.REVISION} bytes=${Buffer.byteLength(html)} sha256=${hash}`);
```

- [ ] **Step 4: Run the validator and verify the red state**

```powershell
rtk node scripts/validate-alpha-core-ad.mjs
```

Expected: FAIL with `ENOENT` for `public/alpha-nova-alpha-core-20s-ad.html`.

- [ ] **Step 5: Create the builder**

Create `web/scripts/build-alpha-core-ad.mjs`:

```js
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const webDir = path.resolve(scriptDir, '..');
const templatePath = path.join(scriptDir, 'assets/alpha-nova-alpha-core-20s-ad.template.html');
const gsapPath = path.join(webDir, 'node_modules/gsap/dist/gsap.min.js');
const threePath = path.join(webDir, 'node_modules/three/build/three.module.min.js');
const outputPath = path.join(webDir, 'public/alpha-nova-alpha-core-20s-ad.html');

const [templateRaw, gsapSource, threeSource] = await Promise.all([
  readFile(templatePath, 'utf8'),
  readFile(gsapPath, 'utf8'),
  readFile(threePath, 'utf8'),
]);

assert.match(gsapSource, /GSAP 3\.12\.5/);
assert.doesNotMatch(threeSource, /\b(?:import|export)\s+(?:[^;]*?\sfrom\s*)?["']/);

const replacements = new Map([
  ['__GSAP_SOURCE__', gsapSource],
  ['__THREE_DATA_URI__', `data:text/javascript;base64,${Buffer.from(threeSource).toString('base64')}`],
]);

let output = templateRaw.replace(/\r\n/g, '\n');
for (const [token, value] of replacements) {
  assert.equal(output.split(token).length - 1, 1, `${token} must appear exactly once`);
  output = output.replace(token, value);
}
assert.doesNotMatch(output, /__[A-Z0-9_]+__/);
await writeFile(outputPath, output, 'utf8');
console.log(`BUILT ${path.relative(webDir, outputPath)} (${Buffer.byteLength(output)} bytes)`);
```

- [ ] **Step 6: Add focused package scripts**

Merge these entries into `web/package.json` without removing existing scripts:

```json
{
  "scripts": {
    "build:alpha-core-ad": "node scripts/build-alpha-core-ad.mjs",
    "test:alpha-core-ad": "npm run build:alpha-core-ad && node scripts/validate-alpha-core-ad.mjs"
  },
  "devDependencies": {
    "gsap": "3.12.5",
    "three": "0.166.1"
  }
}
```

- [ ] **Step 7: Commit the build contract**

```powershell
rtk git add web/package.json web/package-lock.json web/scripts/build-alpha-core-ad.mjs web/scripts/validate-alpha-core-ad.mjs
rtk git commit -m "build: add Alpha Core ad pipeline"
```

Expected: one commit containing only the package and pipeline files.

---

### Task 2: Build the Alpha Core film

**Files:**
- Create: `web/scripts/assets/alpha-nova-alpha-core-20s-ad.template.html`
- Create: `web/public/alpha-nova-alpha-core-20s-ad.html`
- Test: `web/scripts/validate-alpha-core-ad.mjs`

**Interfaces:**
- Consumes: global `gsap`, dynamically imported `THREE`, exact DOM IDs `hook`, `signals`, `alerts`, `analytics`, `endCard`, `fallback`, `cta`, and query parameter `frame`.
- Produces: `buildScene(THREE)`, `buildTimeline(sceneApi)`, `renderAt(seconds)`, `showFallback()`, and a generated portable ad.

- [ ] **Step 1: Create semantic 9:16 markup**

Create the template with `<meta name="ad-duration" content="20">`, a `.stage` using `--stage-ratio: 9 / 16`, a decorative `<canvas aria-hidden="true">`, and these five semantic beats:

```html
<main class="stage" id="stage">
  <canvas id="world" aria-hidden="true"></canvas>
  <div class="vignette" aria-hidden="true"></div>
  <section class="beat" id="hook"><p>The market never stops.</p></section>
  <section class="beat" id="signals"><p>Highest-quality signals.</p></section>
  <section class="beat" id="alerts"><p>Real-time alerts. <strong>Free.</strong></p></section>
  <section class="beat" id="analytics"><p>World-class analytics.</p></section>
  <section class="beat end-card" id="endCard">
    <p>See what others miss.</p>
    <h1>ALPHA NOVA</h1>
    <a id="cta" href="https://alphanova48.in/signals" aria-label="Start free with Alpha Nova Signals">START FREE →</a>
    <small>Analytics and educational information only. Not investment advice.</small>
  </section>
  <section class="fallback" id="fallback" hidden aria-label="Alpha Nova benefits">
    <p>Highest-quality signals. Real-time alerts. Free. World-class analytics.</p>
  </section>
</main>
```

Use CSS custom properties for black, graphite, silver, soft white, and cyan. Keep all copy inside `max-width: 82%`, place the disclaimer above the bottom 5% unsafe region, and include explicit `@media (prefers-reduced-motion: reduce)` rules that remove transforms and blur transitions.

- [ ] **Step 2: Implement the Three.js scene API**

After `const THREE = await import('__THREE_DATA_URI__');`, implement `buildScene(THREE)` returning this stable interface:

```js
return {
  renderer,
  scene,
  camera,
  core,
  shellMaterial,
  innerMaterial,
  orbitGroup,
  alertRing,
  latticeGroup,
  starField,
  resize,
  render,
  dispose,
};
```

The implementation must use `IcosahedronGeometry(1.38, 6)` for the refractive-looking outer core, a smaller emissive inner core, three `TorusGeometry` orbital paths, one cyan `RingGeometry` alert pulse, twelve thin lattice curves, two soft point lights, and a sparse deterministic star field. Seed particle positions with a local deterministic xorshift function so `?frame=` screenshots are reproducible. Set `renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75))`, use `ACESFilmicToneMapping`, and avoid post-processing dependencies.

- [ ] **Step 3: Implement the exact GSAP master timeline**

Embed GSAP in the first classic script using `__GSAP_SOURCE__`. In the module script, create `const DURATION = 20;` and `const master = gsap.timeline({ paused: true });` with these labels and ranges:

```js
master
  .addLabel('hook', 0)
  .fromTo('#hook', { autoAlpha: 0, y: 28 }, { autoAlpha: 1, y: 0, duration: .8 }, .35)
  .to('#hook', { autoAlpha: 0, y: -18, duration: .45 }, 2.35)
  .addLabel('signals', 3)
  .fromTo('#signals', { autoAlpha: 0, y: 26 }, { autoAlpha: 1, y: 0, duration: .7 }, 3.25)
  .to('#signals', { autoAlpha: 0, y: -16, duration: .4 }, 6.45)
  .addLabel('alerts', 7)
  .fromTo('#alerts', { autoAlpha: 0, y: 24 }, { autoAlpha: 1, y: 0, duration: .65 }, 7.25)
  .to('#alerts', { autoAlpha: 0, y: -16, duration: .4 }, 10.45)
  .addLabel('analytics', 11)
  .fromTo('#analytics', { autoAlpha: 0, y: 24 }, { autoAlpha: 1, y: 0, duration: .65 }, 11.25)
  .to('#analytics', { autoAlpha: 0, y: -16, duration: .4 }, 14.45)
  .addLabel('payoff', 15)
  .fromTo('#endCard', { autoAlpha: 0, scale: .985 }, { autoAlpha: 1, scale: 1, duration: .85 }, 15.2)
  .to({}, { duration: 3.95 });
```

Animate core scale, material opacity/emissive intensity, orbit rotation, alert ring scale/opacity, lattice scale/rotation, and camera z on the same timeline. Ensure `master.duration()` is exactly `20`; if GSAP reports otherwise, add a zero-effect tween ending at 20.

- [ ] **Step 4: Implement deterministic playback and fallbacks**

Use one animation loop that seeks GSAP and renders Three.js:

```js
const frozenParam = new URLSearchParams(location.search).get('frame');
const frozenTime = frozenParam === null ? null : Math.min(DURATION, Math.max(0, Number(frozenParam) || 0));
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
let startedAt = performance.now();
let pausedAt = 0;

function renderAt(seconds) {
  master.time(Math.min(DURATION, Math.max(0, seconds)), false);
  sceneApi.render(seconds);
}

function tick(now) {
  const seconds = frozenTime === null ? Math.min(DURATION, (now - startedAt) / 1000) : frozenTime;
  renderAt(seconds);
  if (frozenTime === null && seconds < DURATION) requestAnimationFrame(tick);
}

function showFallback() {
  document.body.classList.add('is-fallback');
  document.getElementById('fallback').hidden = false;
  document.getElementById('endCard').style.opacity = '1';
}
```

For reduced motion, seek the final state and reveal the benefits as a restrained static stack. On `visibilitychange`, record `pausedAt` when hidden and shift `startedAt` by the hidden interval when visible. Catch module/renderer initialization failures and call `showFallback()`.

- [ ] **Step 5: Build and run the contract test**

```powershell
rtk npm run test:alpha-core-ad
```

Expected: `ALPHA_CORE_AD_CHECK=PASS three=166` with a byte count and SHA-256 hash.

- [ ] **Step 6: Commit the working film**

```powershell
rtk git add web/scripts/assets/alpha-nova-alpha-core-20s-ad.template.html web/public/alpha-nova-alpha-core-20s-ad.html
rtk git commit -m "feat: build Alpha Core 20-second ad"
```

Expected: one commit containing only the source template and generated HTML.

---

### Task 3: Perform visual, timing, and packaging QA

**Files:**
- Modify if defects are found: `web/scripts/assets/alpha-nova-alpha-core-20s-ad.template.html`
- Regenerate: `web/public/alpha-nova-alpha-core-20s-ad.html`
- Verify: `web/dist/alpha-nova-alpha-core-20s-ad.html`

**Interfaces:**
- Consumes: `?frame=0.8`, `?frame=4.8`, `?frame=8.8`, `?frame=12.8`, `?frame=17.5`, and CSS fallback class `is-fallback`.
- Produces: verified source/dist byte equality and final QA evidence.

- [ ] **Step 1: Run focused checks before the full build**

```powershell
rtk npm run test:alpha-core-ad
rtk npm audit --audit-level=high
rtk git diff --check
```

Expected: the ad validator passes, audit reports zero high/critical vulnerabilities, and `git diff --check` prints nothing.

- [ ] **Step 2: Inspect deterministic reel frames**

Serve `web` locally and capture the 390×844 viewport at 0.8, 4.8, 8.8, 12.8, and 17.5 seconds. Confirm respectively: hook readability, complete core silhouette, alert pulse and copy, analytical lattice, and stable CTA/disclaimer. Repeat the end card at 1080×1920 to check true reel-safe margins.

- [ ] **Step 3: Verify runtime modes**

Open the generated file directly with `file://`, then verify normal WebGL, forced WebGL failure via the built-in fallback function, reduced-motion emulation, tab-hidden pause/resume, keyboard CTA focus, and final state at 20.0 seconds. Expected: no console errors, no skipped beat, no loop, and no clipped copy.

- [ ] **Step 4: Run the production Vite build**

```powershell
rtk npm run build:alpha-core-ad
rtk npm run build
rtk node scripts/validate-alpha-core-ad.mjs dist/alpha-nova-alpha-core-20s-ad.html
```

Expected: Vite succeeds and both validator calls print `ALPHA_CORE_AD_CHECK=PASS three=166`.

- [ ] **Step 5: Prove source and distribution outputs are identical**

```powershell
rtk proxy powershell -NoProfile -Command "(Get-FileHash -Algorithm SHA256 'public/alpha-nova-alpha-core-20s-ad.html').Hash; (Get-FileHash -Algorithm SHA256 'dist/alpha-nova-alpha-core-20s-ad.html').Hash"
```

Expected: the two SHA-256 values match exactly.

- [ ] **Step 6: Commit any QA fixes**

If visual QA required template changes, regenerate the output and commit only those two files:

```powershell
rtk git add web/scripts/assets/alpha-nova-alpha-core-20s-ad.template.html web/public/alpha-nova-alpha-core-20s-ad.html
rtk git commit -m "fix: polish Alpha Core ad playback"
```

If no QA fix was needed, do not create an empty commit. Do not deploy.
