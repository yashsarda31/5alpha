# Alpha Nova “Don’t Tap Buy Yet” Ad Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build and validate one self-contained 20-second 9:16 Alpha Nova HTML ad that converts active traders to a free signup.

**Architecture:** Keep the creative source in one readable HTML template, then use a deterministic Node packager to embed pinned GSAP and Three.js runtimes into one portable public HTML file. A focused Node validator owns the copy, timing, dependency, fallback, accessibility, and offline contracts; Vite must copy the final file byte-for-byte into `web/dist`.

**Tech Stack:** HTML5, CSS, JavaScript ES modules, Three.js 0.166.1, GSAP 3.12.5, Node.js built-ins, Vite 8.

## Global Constraints

- Deliver exactly one 20.0-second, autoplay-once, non-looping 9:16 ad.
- Use the exact feature headlines **READ THE TREND.**, **FIND THE SETUP.**, and **SIZE THE RISK.**
- Use the exact hook **DON’T TAP BUY YET.** and payoff **TRADE PREPARED.**
- Use CTA **START FREE · NO CARD →** linking to `https://alphanova48.in/login?mode=signup`.
- Keep the BUY button visibly unpressed throughout; never imply Alpha Nova executes trades.
- Label sample trade and sizing data as **EXAMPLE**.
- Embed all CSS, GSAP, Three.js, and runtime code; the CTA is the only allowed runtime network destination.
- Use no audio, playback controls, external fonts, images, analytics, tracking, React routes, or API calls.
- Preserve the complete message in normal WebGL, reduced-motion, and CSS fallback modes.
- Keep this work local; do not deploy or integrate it into the application.
- Do not alter or remove earlier Alpha Nova ad artifacts.

---

## File Structure

- Create `web/scripts/validate-dont-tap-buy-ad.mjs` — executable contract test for the generated ad.
- Create `web/scripts/build-dont-tap-buy-ad.mjs` — deterministic packager that embeds pinned runtimes.
- Create `web/scripts/assets/alpha-nova-dont-tap-buy-20s-ad.template.html` — readable creative source and full timeline.
- Create `web/public/alpha-nova-dont-tap-buy-20s-ad.html` — generated single-file deliverable.
- Generate `web/dist/alpha-nova-dont-tap-buy-20s-ad.html` — Vite copy used for byte-equality verification.
- Modify `web/package.json` — add exact ad commands and pinned dev dependencies.
- Modify `web/package-lock.json` — lock GSAP 3.12.5 and Three.js 0.166.1.

### Task 1: Define the Generated-Ad Contract

**Files:**
- Create: `web/scripts/validate-dont-tap-buy-ad.mjs`

**Interfaces:**
- Consumes: optional `process.argv[2]` path; defaults to `web/public/alpha-nova-dont-tap-buy-20s-ad.html`.
- Produces: exit code `0` and `DONT_TAP_BUY_AD_CHECK=PASS`; otherwise throws a focused assertion.

- [ ] **Step 1: Write the failing validator**

Create `web/scripts/validate-dont-tap-buy-ad.mjs` with this contract:

```js
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import vm from 'node:vm';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const defaultAd = path.resolve(scriptDir, '../public/alpha-nova-dont-tap-buy-20s-ad.html');
const target = process.argv[2] ? path.resolve(process.argv[2]) : defaultAd;
const html = await readFile(target, 'utf8');

assert.match(html, /<meta name="ad-duration" content="20">/);
assert.match(html, /--stage-ratio:\s*9\s*\/\s*16/);

for (const copy of [
  'DON’T TAP BUY YET.',
  'READ THE TREND.',
  'UPTREND',
  'SIDEWAYS',
  'DOWNTREND',
  'FIND THE SETUP.',
  'ENTRY',
  'STOP',
  'TARGET',
  'SIZE THE RISK.',
  'CAPITAL',
  'RISK',
  'QUANTITY',
  '₹5,00,000',
  '1%',
  '250 SHARES',
  'EXAMPLE',
  'TRADE PREPARED.',
  'ALPHA NOVA',
  'START FREE · NO CARD →',
  'Analytics and educational information only. Not investment advice.',
]) assert.ok(html.includes(copy), `missing copy: ${copy}`);

assert.match(html, /href="https:\/\/alphanova48\.in\/login\?mode=signup"/);
assert.match(html, /const DURATION = 20;/);
assert.match(html, /gsap\.timeline\(\{ paused: true \}\)/);
assert.match(html, /await import\('data:text\/javascript;base64,/);
assert.match(html, /GSAP 3\.12\.5/);
assert.match(html, /prefers-reduced-motion: reduce/);
assert.match(html, /new URLSearchParams\(location\.search\)\.get\('frame'\)/);
assert.match(html, /new URLSearchParams\(location\.search\)\.get\('renderer'\)/);
assert.match(html, /rendererParam === 'css'/);
assert.match(html, /document\.visibilityState === 'hidden'/);
assert.match(html, /showFallback/);
assert.match(html, /aria-label="Create your free Alpha Nova account"/);
assert.doesNotMatch(html, /__[A-Z0-9_]+__/);
assert.doesNotMatch(html, /id="(?:controls|play|replay|mute|share|progress)"/i);
assert.doesNotMatch(html, /<audio\b|AudioContext/);
assert.doesNotMatch(html, /repeat:\s*-1\b/);

const scripts = [...html.matchAll(/<script(?:\s+type="module")?>([\s\S]*?)<\/script>/g)];
assert.equal(scripts.length, 2);
new vm.Script(scripts[0][1], { filename: 'embedded-gsap.js' });
new vm.Script(scripts[1][1], { filename: 'dont-tap-buy-runtime.js' });

const threeUri = html.match(/await import\('(data:text\/javascript;base64,[^']+)'\)/)?.[1];
assert.ok(threeUri, 'embedded Three.js module missing');
const threeSource = Buffer.from(threeUri.split(',')[1], 'base64').toString('utf8');
assert.doesNotMatch(threeSource, /\b(?:import|export)\s+(?:[^;]*?\sfrom\s*)?["']/);
const three = await import(threeUri);
assert.equal(three.REVISION, '166');

const runtimeUrls = [...html.matchAll(/(?:src|href)="(https?:\/\/[^"]+)"/g)]
  .map((match) => match[1])
  .filter((url) => url !== 'https://alphanova48.in/login?mode=signup');
assert.deepEqual(runtimeUrls, []);

const hash = createHash('sha256').update(html).digest('hex');
console.log(`DONT_TAP_BUY_AD_CHECK=PASS three=${three.REVISION} bytes=${Buffer.byteLength(html)} sha256=${hash}`);
```

- [ ] **Step 2: Run the validator to prove the contract starts red**

Run from `web/`:

```powershell
rtk node scripts/validate-dont-tap-buy-ad.mjs
```

Expected: FAIL with `ENOENT` for `public/alpha-nova-dont-tap-buy-20s-ad.html`.

- [ ] **Step 3: Commit the contract**

```powershell
rtk git add web/scripts/validate-dont-tap-buy-ad.mjs
rtk git commit -m "test: define dont tap buy ad contract"
```

### Task 2: Add the Deterministic Packaging Pipeline

**Files:**
- Modify: `web/package.json`
- Modify: `web/package-lock.json`
- Create: `web/scripts/build-dont-tap-buy-ad.mjs`

**Interfaces:**
- Consumes: the template token `__GSAP_SOURCE__`, template token `__THREE_DATA_URI__`, `node_modules/gsap/dist/gsap.min.js`, and `node_modules/three/build/three.module.min.js`.
- Produces: `web/public/alpha-nova-dont-tap-buy-20s-ad.html`, `npm run build:dont-tap-buy-ad`, and `npm run test:dont-tap-buy-ad`.

- [ ] **Step 1: Pin the two creative runtimes**

Run from `web/`:

```powershell
rtk npm install --save-dev --save-exact gsap@3.12.5 three@0.166.1
```

Expected: `package.json` and `package-lock.json` record exact versions `3.12.5` and `0.166.1`; no unrelated dependency version changes.

- [ ] **Step 2: Add focused package commands**

Add these keys before the existing `dev` script in `web/package.json`:

```json
"build:dont-tap-buy-ad": "node scripts/build-dont-tap-buy-ad.mjs",
"test:dont-tap-buy-ad": "npm run build:dont-tap-buy-ad && node scripts/validate-dont-tap-buy-ad.mjs"
```

- [ ] **Step 3: Create the packager**

Create `web/scripts/build-dont-tap-buy-ad.mjs`:

```js
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const webDir = path.resolve(scriptDir, '..');
const templatePath = path.join(scriptDir, 'assets/alpha-nova-dont-tap-buy-20s-ad.template.html');
const gsapPath = path.join(webDir, 'node_modules/gsap/dist/gsap.min.js');
const threePath = path.join(webDir, 'node_modules/three/build/three.module.min.js');
const outputPath = path.join(webDir, 'public/alpha-nova-dont-tap-buy-20s-ad.html');

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

- [ ] **Step 4: Verify the package files and packager parse**

```powershell
rtk node --check scripts/build-dont-tap-buy-ad.mjs
rtk node --check scripts/validate-dont-tap-buy-ad.mjs
rtk npm ls gsap three --depth=0
```

Expected: both scripts parse; dependency output contains `gsap@3.12.5` and `three@0.166.1`.

- [ ] **Step 5: Commit the packaging foundation**

```powershell
rtk git add web/package.json web/package-lock.json web/scripts/build-dont-tap-buy-ad.mjs
rtk git commit -m "build: add dont tap buy ad pipeline"
```

### Task 3: Build the 20-Second Film

**Files:**
- Create: `web/scripts/assets/alpha-nova-dont-tap-buy-20s-ad.template.html`
- Create: `web/public/alpha-nova-dont-tap-buy-20s-ad.html`

**Interfaces:**
- Consumes: global `gsap`, dynamically imported `THREE`, query parameters `frame`, `renderer`, and `motion`.
- Produces: DOM beat IDs `hook`, `trend`, `setup`, `risk`, `payoff`; runtime functions `startFilm(THREE)`, `createScene(THREE)`, `buildTimeline(visual, camera)`, `showFallback(reason)`, `seekFrame(seconds)`; and a stopped final state at `20.0` seconds.

- [ ] **Step 1: Create the semantic 9:16 shell**

The template must contain this exact semantic structure, with each beat in the Reel-safe text area:

```html
<main id="stage" aria-label="Alpha Nova promotional film">
  <canvas id="world" aria-hidden="true"></canvas>
  <div id="css-object" aria-hidden="true"><span>BUY</span></div>
  <section class="beat" id="hook"><h1>DON’T TAP BUY YET.</h1></section>
  <section class="beat" id="trend">
    <p class="eyebrow">01 · TREND</p><h2>READ THE TREND.</h2>
    <p class="states"><span>UPTREND</span><span>SIDEWAYS</span><span>DOWNTREND</span></p>
  </section>
  <section class="beat" id="setup">
    <p class="eyebrow">02 · SETUP</p><h2>FIND THE SETUP.</h2>
    <p class="example">EXAMPLE</p>
    <p class="flow"><span>ENTRY <b>₹200</b></span><span>STOP <b>₹180</b></span><span>TARGET <b>₹240</b></span></p>
  </section>
  <section class="beat" id="risk">
    <p class="eyebrow">03 · RISK</p><h2>SIZE THE RISK.</h2>
    <p class="example">EXAMPLE</p>
    <p class="flow"><span>CAPITAL <b>₹5,00,000</b></span><span>RISK <b>1%</b></span><span>QUANTITY <b>250 SHARES</b></span></p>
  </section>
  <section class="beat" id="payoff">
    <p class="kicker">TRADE PREPARED.</p><h2>ALPHA NOVA</h2>
    <a id="cta" href="https://alphanova48.in/login?mode=signup" aria-label="Create your free Alpha Nova account">START FREE · NO CARD →</a>
    <p class="disclaimer">Analytics and educational information only. Not investment advice.</p>
  </section>
</main>
```

Add `<meta name="ad-duration" content="20">`, define `--stage-ratio: 9 / 16`, and use `min-height: 100svh`. Keep primary copy within `left/right: 8%`, hook above the center object, and the CTA above the bottom 15% Reel overlay zone.

- [ ] **Step 2: Create the Three.js object system**

Implement `startFilm(THREE)` as the coordinator that calls `createScene(THREE)`, creates `buildTimeline(visual, camera)`, attaches resizing and visibility behavior, starts rendering, then either seeks the requested frame or plays once. Implement `createScene(THREE)` using these named objects and responsibilities:

```js
const visual = {
  button: new THREE.Group(),
  contact: new THREE.Group(),
  trendRing: new THREE.Group(),
  setupRing: new THREE.Group(),
  riskRing: new THREE.Group(),
  pressureHalo: new THREE.Mesh(),
};
```

- Build the BUY button from a short beveled cylinder, a clear outer shell, and a recessed `CanvasTexture` label reading `BUY`.
- Keep the button’s lowest point at least `0.06` scene units above the contact surface in every timeline state.
- Build the three rings with `TorusGeometry`; use distinct radii and restrained titanium/electric-blue materials.
- Build ENTRY, STOP, and TARGET markers as small emissive nodes on `setupRing`.
- Build CAPITAL, RISK, and QUANTITY markers as three ticks on `riskRing`.
- Use one perspective camera, two area-like directional lights, one rim light, and no postprocessing dependency.
- Scale camera distance from the stage aspect so the full button and all three rings remain visible on narrow and short portrait screens.

- [ ] **Step 3: Implement the deterministic GSAP story**

Use one paused master timeline and these exact beat boundaries:

```js
const DURATION = 20;
const BEATS = Object.freeze({ hook: 0, trend: 3, setup: 7, risk: 12, payoff: 16, end: 20 });
const timeline = gsap.timeline({ paused: true });

timeline
  .set(['#hook', '#trend', '#setup', '#risk', '#payoff'], { autoAlpha: 0 })
  .to('#hook', { autoAlpha: 1, duration: 0.35 }, 0.15)
  .fromTo(visual.button.position, { y: 3.8 }, { y: 0.52, duration: 1.45, ease: 'power4.in' }, 0)
  .to(camera.position, { z: 7.25, duration: 0.32, ease: 'power2.out' }, 1.45)
  .to('#hook', { autoAlpha: 0, duration: 0.35 }, 2.55)
  .to('#trend', { autoAlpha: 1, duration: 0.35 }, 3.05)
  .to(visual.trendRing.rotation, { z: Math.PI * 2, duration: 2.2, ease: 'power3.out' }, 3.15)
  .to('#trend', { autoAlpha: 0, duration: 0.35 }, 6.55)
  .to('#setup', { autoAlpha: 1, duration: 0.35 }, 7.05)
  .to(visual.setupRing.scale, { x: 1, y: 1, z: 1, duration: 1.1, ease: 'back.out(1.4)' }, 7.15)
  .to(visual.setupRing.rotation, { z: -Math.PI * 1.5, duration: 3.0, ease: 'power2.inOut' }, 8.1)
  .to('#setup', { autoAlpha: 0, duration: 0.35 }, 11.55)
  .to('#risk', { autoAlpha: 1, duration: 0.35 }, 12.05)
  .to(visual.riskRing.scale, { x: 1, y: 1, z: 1, duration: 1.1, ease: 'back.out(1.3)' }, 12.15)
  .to(visual.riskRing.rotation, { z: Math.PI * 1.25, duration: 2.8, ease: 'power2.inOut' }, 13.0)
  .to('#risk', { autoAlpha: 0, duration: 0.35 }, 15.55)
  .to([visual.trendRing.rotation, visual.setupRing.rotation, visual.riskRing.rotation], { z: 0, duration: 0.7, ease: 'power4.out' }, 16)
  .to('#payoff', { autoAlpha: 1, duration: 0.45 }, 16.25)
  .to({}, { duration: 3.3 }, 16.7);

timeline.eventCallback('onComplete', () => timeline.pause(DURATION));
```

Initialize `setupRing.scale` and `riskRing.scale` at `0.01`; update renderer/camera inside `requestAnimationFrame`; seek to `?frame=` without autoplay when present; otherwise play once. On `visibilitychange`, pause while hidden and resume only if the timeline had been playing.

- [ ] **Step 4: Implement reduced motion and failure behavior**

- Read `motion` and `renderer` once from `URLSearchParams`.
- Treat `motion=full` as a deterministic override; otherwise honor `matchMedia('(prefers-reduced-motion: reduce)')`.
- In reduced motion, retain all beat boundaries but cap each object transition and crossfade at `0.16` seconds.
- `showFallback(reason)` must hide the canvas, show `#css-object`, and run the complete DOM timeline.
- Call `showFallback('forced')` for `renderer=css` and `showFallback('webgl')` after any Three.js initialization rejection.
- If GSAP is missing, add class `static-final` to show `#payoff` and hide other beats.

- [ ] **Step 5: Embed the runtimes and build the file**

Place `__GSAP_SOURCE__` in one classic script and import `__THREE_DATA_URI__` from the one module script:

```html
<script>__GSAP_SOURCE__</script>
<script type="module">
async function boot() {
  const THREE = await import('__THREE_DATA_URI__');
  await startFilm(THREE);
}
boot().catch(() => showFallback('webgl'));
</script>
```

Run from `web/`:

```powershell
rtk npm run test:dont-tap-buy-ad
```

Expected: `DONT_TAP_BUY_AD_CHECK=PASS three=166` with a SHA-256 hash.

- [ ] **Step 6: Commit the complete film**

```powershell
rtk git add web/scripts/assets/alpha-nova-dont-tap-buy-20s-ad.template.html web/public/alpha-nova-dont-tap-buy-20s-ad.html
rtk git commit -m "feat: add dont tap buy ad"
```

### Task 4: Perform Visual, Timing, and Fallback QA

**Files:**
- Modify if a QA failure is found: `web/scripts/assets/alpha-nova-dont-tap-buy-20s-ad.template.html`
- Regenerate after any fix: `web/public/alpha-nova-dont-tap-buy-20s-ad.html`

**Interfaces:**
- Consumes: deterministic `?frame=<seconds>`, `?renderer=css`, and `?motion=full` query controls.
- Produces: verified visual frames at `0.6`, `4.5`, `9.0`, `14.0`, and `18.5` seconds in normal and fallback modes.

- [ ] **Step 1: Start a local preview**

Run from `web/`:

```powershell
rtk npm run build
rtk npm run preview -- --host 127.0.0.1
```

Expected: Vite reports a local HTTP URL and `/alpha-nova-dont-tap-buy-20s-ad.html` returns `200`.

- [ ] **Step 2: Inspect the five deterministic frames at 1080×1920**

Open these URLs at a 1080×1920 viewport:

```text
http://127.0.0.1:4173/alpha-nova-dont-tap-buy-20s-ad.html?frame=0.6&motion=full
http://127.0.0.1:4173/alpha-nova-dont-tap-buy-20s-ad.html?frame=4.5&motion=full
http://127.0.0.1:4173/alpha-nova-dont-tap-buy-20s-ad.html?frame=9.0&motion=full
http://127.0.0.1:4173/alpha-nova-dont-tap-buy-20s-ad.html?frame=14.0&motion=full
http://127.0.0.1:4173/alpha-nova-dont-tap-buy-20s-ad.html?frame=18.5&motion=full
```

Expected: the hook is readable by `0.6`; each feature has one dominant headline and its matching ring; the button never touches the surface; the CTA and disclaimer are fully visible at `18.5`.

- [ ] **Step 3: Inspect CSS fallback and reduced motion**

Open the same five frames with `renderer=css`, then load without `motion=full` in a reduced-motion browser context.

Expected: every headline appears at the same beat boundaries; no blank stage, overlap, jump to the final card, or console error occurs.

- [ ] **Step 4: Verify direct-file operation and exact stopping time**

Open `web/public/alpha-nova-dont-tap-buy-20s-ad.html` via `file://`, let it play from `0.0`, and watch through `20.0`.

Expected: autoplay starts without user input, the page stops on the final CTA at `20.0`, and it does not loop or skip while the tab remains visible.

- [ ] **Step 5: Rebuild and recommit only if QA required a source correction**

```powershell
rtk npm run test:dont-tap-buy-ad
rtk git add web/scripts/assets/alpha-nova-dont-tap-buy-20s-ad.template.html web/public/alpha-nova-dont-tap-buy-20s-ad.html
rtk git commit -m "fix: polish dont tap buy ad playback"
```

Expected: either no commit is needed, or the focused test passes before the correction is committed.

### Task 5: Run the Final Repository Gate

**Files:**
- Generate: `web/dist/alpha-nova-dont-tap-buy-20s-ad.html`

**Interfaces:**
- Consumes: the validated public artifact and existing Vite application.
- Produces: clean focused validation, clean lint/build, source/dist SHA-256 equality, and a scoped final commit.

- [ ] **Step 1: Run the complete local gate**

Run from `web/`:

```powershell
rtk npm run test:dont-tap-buy-ad
rtk npm run lint
rtk npm run build
```

Expected: focused ad test passes, ESLint exits `0`, and Vite completes successfully.

- [ ] **Step 2: Prove the public and distribution files are identical**

```powershell
$sourceHash = (Get-FileHash -Algorithm SHA256 -LiteralPath 'public\alpha-nova-dont-tap-buy-20s-ad.html').Hash
$distHash = (Get-FileHash -Algorithm SHA256 -LiteralPath 'dist\alpha-nova-dont-tap-buy-20s-ad.html').Hash
if ($sourceHash -ne $distHash) { throw "source/dist hash mismatch" }
$sourceHash
```

Expected: one SHA-256 value prints and no exception is thrown.

- [ ] **Step 3: Check scope and whitespace**

Run from the repository root:

```powershell
rtk git diff --check
rtk git status --short
```

Expected: no whitespace errors; identify the planned ad files separately from all pre-existing unrelated modified and untracked work, and preserve that unrelated work unchanged.

- [ ] **Step 4: Commit the Vite-copied artifact if it is tracked by repository policy**

```powershell
rtk git add web/dist/alpha-nova-dont-tap-buy-20s-ad.html
rtk git commit -m "build: copy dont tap buy ad to dist"
```

Expected: the commit contains only the byte-identical distribution HTML. Do not stage unrelated Vite asset churn.

- [ ] **Step 5: Report the local deliverable**

Report the absolute paths to the public HTML, readable template, and validator; include focused-test, lint, build, visual-QA, fallback-QA, and source/dist hash results. State explicitly that nothing was deployed.
