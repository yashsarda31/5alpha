# Alpha Nova Signals 20-Second Ad Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a self-contained, 20-second, 9:16 Alpha Nova Signals HTML ad that turns hours of stock research into a five-minute workflow and ends at `https://alphanova48.in/signals`.

**Architecture:** A small Node build script injects the existing licensed GSAP runtime, the existing self-contained Three.js data module, and the Alpha Nova logo into a focused HTML template. The generated file is the only shareable artifact; it runs one deterministic GSAP timeline, uses Three.js for depth and particles, falls back to CSS/DOM states, and holds on its final CTA.

**Tech Stack:** HTML5, CSS, Three.js r166.1, GSAP 3.12.5, Node.js built-in test/assert/fs/crypto modules, Vite.

## Global Constraints

- Create `web/public/alpha-nova-signals-20s-ad.html`; preserve every existing ad.
- Primary composition is exactly 9:16 and designed for 1080 x 1920.
- The master timeline is exactly 20 seconds, does not loop, and holds on the end card.
- No playback, replay, mute, share, or progress controls.
- The ad is soundless and starts automatically after document readiness.
- The final CTA text is `See today's signals` and its URL is `https://alphanova48.in/signals`.
- The shareable HTML has no runtime dependency other than the CTA navigation.
- The copy uses `Quality-first signals` and avoids guaranteed-return claims.
- No React route, analytics, API, production configuration, or deployment changes.

---

## File Structure

- Create `web/scripts/alpha-nova-signals-20s-ad.template.html`: readable creative source with three named build tokens for embedded payloads.
- Create `web/scripts/build-signals-ad.mjs`: deterministic asset packager that emits the standalone public HTML.
- Create `web/scripts/validate-signals-ad.mjs`: structural, timing, dependency, and hash validator.
- Generate `web/public/alpha-nova-signals-20s-ad.html`: final one-file deliverable.
- Generate `web/dist/alpha-nova-signals-20s-ad.html`: Vite copy used only for verification.

### Task 1: Add a failing standalone-ad contract

**Files:**
- Create: `web/scripts/validate-signals-ad.mjs`
- Test: `web/scripts/validate-signals-ad.mjs`

**Interfaces:**
- Consumes: optional CLI path; defaults to `web/public/alpha-nova-signals-20s-ad.html` relative to the script.
- Produces: exit code `0` and `SIGNALS_AD_CHECK=PASS`; throws an assertion error on the first violated contract.

- [ ] **Step 1: Write the validator before the ad exists**

Implement the validator with Node built-ins and these exact contracts:

```js
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const defaultAd = path.resolve(scriptDir, '../public/alpha-nova-signals-20s-ad.html');
const target = process.argv[2] ? path.resolve(process.argv[2]) : defaultAd;
const html = await readFile(target, 'utf8');

assert.match(html, /<meta name="ad-duration" content="20">/);
assert.match(html, /--stage-ratio:\s*9\s*\/\s*16/);
assert.match(html, /Still spending hours on stocks\?/);
assert.match(html, /05:00 \/ DAY/);
assert.match(html, /Quality-first signals\./);
assert.match(html, /Real-time stock alerts\./);
assert.match(html, /Five minutes\. Then live your life\./);
assert.match(html, /href="https:\/\/alphanova48\.in\/signals"/);
assert.match(html, /See today's signals/);
assert.match(html, /const DURATION = 20;/);
assert.match(html, /gsap\.timeline\(\{ paused: true \}\)/);
assert.match(html, /await import\('data:text\/javascript;base64,/);
assert.match(html, /GSAP 3\.12\.5/);
assert.match(html, /prefers-reduced-motion: reduce/);
assert.match(html, /showFinalState\(\)/);
assert.doesNotMatch(html, /__GSAP_SOURCE__|__THREE_DATA_URI__|__LOGO_DATA_URI__/);
assert.doesNotMatch(html, /id="(?:controls|btnPlay|btnReplay|btnSound|btnShare|progress)"/);
assert.doesNotMatch(html, /<audio\b|AudioContext|\.repeat\s*\(|repeat:\s*-?1/);

const runtimeUrls = [...html.matchAll(/(?:src|href)="(https?:\/\/[^\"]+)"/g)]
  .map((match) => match[1])
  .filter((url) => url !== 'https://alphanova48.in/signals');
assert.deepEqual(runtimeUrls, []);

const hash = createHash('sha256').update(html).digest('hex');
console.log(`SIGNALS_AD_CHECK=PASS bytes=${Buffer.byteLength(html)} sha256=${hash}`);
```

- [ ] **Step 2: Run the validator and confirm the red state**

Run from `web`:

```powershell
rtk node scripts/validate-signals-ad.mjs
```

Expected: failure with `ENOENT` for `alpha-nova-signals-20s-ad.html`.

- [ ] **Step 3: Commit the failing contract**

```powershell
rtk git add web/scripts/validate-signals-ad.mjs
rtk git commit -m "test: define Alpha Nova signals ad contract"
```

### Task 2: Build the deterministic single-file packager

**Files:**
- Create: `web/scripts/build-signals-ad.mjs`
- Consume: `web/public/alpha-nova-five-minutes-20s-ad.html`
- Consume: `web/public/ad-assets/alpha-nova-logo.jpeg`
- Consume: `web/scripts/alpha-nova-signals-20s-ad.template.html`
- Produce: `web/public/alpha-nova-signals-20s-ad.html`

**Interfaces:**
- Consumes template tokens `__GSAP_SOURCE__`, `__THREE_DATA_URI__`, and `__LOGO_DATA_URI__` exactly once each.
- Produces UTF-8 HTML with LF line endings and no unresolved tokens.

- [ ] **Step 1: Create the packager with strict extraction checks**

```js
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const webDir = path.resolve(scriptDir, '..');
const sourcePath = path.join(webDir, 'public/alpha-nova-five-minutes-20s-ad.html');
const logoPath = path.join(webDir, 'public/ad-assets/alpha-nova-logo.jpeg');
const templatePath = path.join(scriptDir, 'alpha-nova-signals-20s-ad.template.html');
const outputPath = path.join(webDir, 'public/alpha-nova-signals-20s-ad.html');

const [source, logo, templateRaw] = await Promise.all([
  readFile(sourcePath, 'utf8'),
  readFile(logoPath),
  readFile(templatePath, 'utf8'),
]);

const gsapMatch = source.match(/<script>(\/\*![\s\S]*?GSAP 3\.12\.5[\s\S]*?)<\/script>\s*<script>/);
const threeMatch = source.match(/await import\('(data:text\/javascript;base64,[^']+)'\)/);
assert.ok(gsapMatch, 'embedded GSAP 3.12.5 payload not found');
assert.ok(threeMatch, 'self-contained Three.js data module not found');

const values = {
  __GSAP_SOURCE__: gsapMatch[1],
  __THREE_DATA_URI__: threeMatch[1],
  __LOGO_DATA_URI__: `data:image/jpeg;base64,${logo.toString('base64')}`,
};

let output = templateRaw.replace(/\r\n/g, '\n');
for (const [token, value] of Object.entries(values)) {
  assert.equal(output.split(token).length - 1, 1, `${token} must appear exactly once`);
  output = output.replace(token, value);
}
assert.doesNotMatch(output, /__[A-Z0-9_]+__/);
await writeFile(outputPath, output, 'utf8');
console.log(`BUILT ${path.relative(webDir, outputPath)} (${Buffer.byteLength(output)} bytes)`);
```

- [ ] **Step 2: Run the packager before the template exists**

```powershell
rtk node scripts/build-signals-ad.mjs
```

Expected: failure with `ENOENT` for `alpha-nova-signals-20s-ad.template.html`.

- [ ] **Step 3: Keep the packager uncommitted until Task 3 supplies its testable template**

Do not stage generated output or modify `web/package.json` in this step.

### Task 3: Implement the 9:16 Time Collapse creative

**Files:**
- Create: `web/scripts/alpha-nova-signals-20s-ad.template.html`
- Modify: `web/scripts/build-signals-ad.mjs`
- Generate: `web/public/alpha-nova-signals-20s-ad.html`
- Test: `web/scripts/validate-signals-ad.mjs`

**Interfaces:**
- `initThree(): Promise<{ update(time: number): void, resize(): void } | null>` initializes or returns `null` without blocking the DOM film.
- `buildTimeline(): gsap.core.Timeline` returns a paused timeline whose total duration is exactly `20`.
- `showFinalState(): void` hides earlier scenes and reveals the final CTA.
- `startFilm(): Promise<void>` attempts Three.js setup, starts the render loop, then plays the GSAP timeline once.

- [ ] **Step 1: Create semantic scenes and the 9:16 stage**

Use this exact scene structure in the template:

```html
<main class="stage no-three" id="stage" aria-label="Alpha Nova 20-second Signals ad">
  <canvas id="world" aria-hidden="true"></canvas>
  <section class="scene problem" id="problem"><p class="eyebrow">THE DAILY MARKET ROUTINE</p><h1>Still spending<br>hours on stocks?</h1></section>
  <section class="scene timer" id="timer"><p>Your market workflow, compressed.</p><h2>05:00 <span>/ DAY</span></h2></section>
  <section class="scene signals" id="signals">
    <h2>Quality-first signals.</h2><p>Clear setups. Defined risk. Less noise.</p>
    <div class="signal-deck" aria-label="Illustrative signal cards">
      <article class="signal-card"><span>RELIANCE</span><strong>Momentum setup</strong><small>Entry 1,468 · Stop 1,421 · Target 1,562</small></article>
      <article class="signal-card"><span>HDFCBANK</span><strong>Breakout setup</strong><small>Entry 1,996 · Stop 1,938 · Target 2,112</small></article>
      <article class="signal-card"><span>INFY</span><strong>Trend setup</strong><small>Entry 1,612 · Stop 1,566 · Target 1,704</small></article>
    </div>
  </section>
  <section class="scene alerts" id="alerts">
    <h2>Real-time stock alerts.</h2><p>Know when a new setup is ready.</p>
    <div class="alert-stack" aria-label="Illustrative alert notifications">
      <article class="alert-card"><span>NOW</span><strong>New RELIANCE setup</strong><small>Signal ready · Risk levels defined</small></article>
      <article class="alert-card"><span>ALPHA NOVA</span><strong>HDFCBANK cleared filters</strong><small>Open Signals to review</small></article>
      <article class="alert-card"><span>LIVE</span><strong>INFY watch condition met</strong><small>Review the complete plan</small></article>
    </div>
  </section>
  <section class="scene finale" id="finale"><img src="__LOGO_DATA_URI__" alt="Alpha Nova"><h2>Five minutes.<br>Then live your life.</h2><a href="https://alphanova48.in/signals" target="_blank" rel="noopener">See today's signals <span aria-hidden="true">&rarr;</span></a><p class="legal">Educational market analytics, not investment advice. Markets carry risk.</p></section>
  <p class="fallback" id="fallback" role="status" aria-live="polite"></p>
</main>
```

Set these composition rules in the same template:

```css
:root { --stage-ratio: 9 / 16; --ink: #f7f8fb; --blue: #79a7ff; --violet: #a98cff; }
html, body { width: 100%; height: 100%; margin: 0; overflow: hidden; background: #020308; }
body { display: grid; place-items: center; font-family: -apple-system, BlinkMacSystemFont, "SF Pro Display", "Segoe UI", sans-serif; }
.stage { position: relative; aspect-ratio: var(--stage-ratio); width: min(100vw, 56.25vh); height: min(100vh, 177.778vw); overflow: hidden; isolation: isolate; }
.scene { position: absolute; inset: 0; display: grid; align-content: center; padding: max(9vh, 96px) 9% max(13vh, 150px); opacity: 0; visibility: hidden; }
#world { position: absolute; inset: 0; width: 100%; height: 100%; }
.finale a { min-height: 48px; display: inline-flex; align-items: center; justify-content: center; }
@media (prefers-reduced-motion: reduce) { .scene, .scene * { animation: none !important; transition: none !important; } }
```

- [ ] **Step 2: Add the embedded runtimes and fallback-first boot path**

The template must contain the payloads and exact boot constants:

```html
<script>__GSAP_SOURCE__</script>
<script type="module">
const DURATION = 20;
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
let threeState = null;

function showFinalState() {
  document.querySelectorAll('.scene').forEach((scene) => {
    scene.style.opacity = scene.id === 'finale' ? '1' : '0';
    scene.style.visibility = scene.id === 'finale' ? 'visible' : 'hidden';
  });
}

async function initThree() {
  try {
    const THREE = await import('__THREE_DATA_URI__');
    const canvas = document.getElementById('world');
    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x020308, 0.055);
    const camera = new THREE.PerspectiveCamera(42, 9 / 16, 0.1, 100);
    camera.position.set(0, 0, 8.2);
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: !reduced, alpha: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;

    const particleCount = reduced || navigator.hardwareConcurrency <= 4 ? 700 : 1500;
    const chaos = new Float32Array(particleCount * 3);
    const clock = new Float32Array(particleCount * 3);
    const focus = new Float32Array(particleCount * 3);
    const positions = new Float32Array(particleCount * 3);
    for (let index = 0; index < particleCount; index += 1) {
      const offset = index * 3;
      const angle = (index / particleCount) * Math.PI * 2;
      const ring = 2.15 + (Math.random() - 0.5) * 0.32;
      chaos[offset] = (Math.random() - 0.5) * 10;
      chaos[offset + 1] = (Math.random() - 0.5) * 16;
      chaos[offset + 2] = (Math.random() - 0.5) * 7;
      clock[offset] = Math.cos(angle) * ring;
      clock[offset + 1] = Math.sin(angle) * ring;
      clock[offset + 2] = (Math.random() - 0.5) * 0.18;
      focus[offset] = (Math.random() - 0.5) * 4.4;
      focus[offset + 1] = (Math.random() - 0.5) * 6.6;
      focus[offset + 2] = -0.9 + (Math.random() - 0.5) * 0.9;
      positions[offset] = chaos[offset];
      positions[offset + 1] = chaos[offset + 1];
      positions[offset + 2] = chaos[offset + 2];
    }

    const particleGeometry = new THREE.BufferGeometry();
    const positionAttribute = new THREE.BufferAttribute(positions, 3);
    particleGeometry.setAttribute('position', positionAttribute);
    const particleMaterial = new THREE.PointsMaterial({ color: 0x8db2ff, size: 0.026, transparent: true, opacity: 0.78, depthWrite: false, blending: THREE.AdditiveBlending });
    const particles = new THREE.Points(particleGeometry, particleMaterial);
    scene.add(particles);

    const fragmentGroup = new THREE.Group();
    const fragmentGeometry = new THREE.BoxGeometry(0.035, 0.38, 0.035);
    const fragmentMaterial = new THREE.MeshPhysicalMaterial({ color: 0xdce8ff, metalness: 0.72, roughness: 0.2, transparent: true, opacity: 0.62 });
    for (let index = 0; index < 36; index += 1) {
      const fragment = new THREE.Mesh(fragmentGeometry, fragmentMaterial);
      const angle = (index / 36) * Math.PI * 2;
      fragment.position.set(Math.cos(angle) * 2.35, Math.sin(angle) * 2.35, 0);
      fragment.rotation.z = angle;
      fragmentGroup.add(fragment);
    }
    scene.add(fragmentGroup);

    const cardGroup = new THREE.Group();
    const cardGeometry = new THREE.BoxGeometry(3.8, 1.15, 0.08);
    const cardMaterial = new THREE.MeshPhysicalMaterial({ color: 0x10213e, metalness: 0.16, roughness: 0.28, transparent: true, opacity: 0.32, transmission: 0.25 });
    [-1.45, 0, 1.45].forEach((y, index) => {
      const card = new THREE.Mesh(cardGeometry, cardMaterial.clone());
      card.position.set((index - 1) * 0.18, y, -0.6 - index * 0.12);
      card.rotation.y = (index - 1) * 0.06;
      cardGroup.add(card);
    });
    cardGroup.visible = false;
    scene.add(cardGroup);

    const alertGroup = new THREE.Group();
    const ringGeometry = new THREE.RingGeometry(0.72, 0.75, 64);
    for (let index = 0; index < 3; index += 1) {
      const ringMaterial = new THREE.MeshBasicMaterial({ color: index === 1 ? 0xa98cff : 0x79a7ff, transparent: true, opacity: 0.34 - index * 0.08, side: THREE.DoubleSide });
      const ring = new THREE.Mesh(ringGeometry, ringMaterial);
      ring.position.z = -0.25 - index * 0.08;
      ring.scale.setScalar(1 + index * 0.65);
      alertGroup.add(ring);
    }
    alertGroup.visible = false;
    scene.add(alertGroup);

    scene.add(new THREE.AmbientLight(0x789ee8, 1.35));
    const keyLight = new THREE.PointLight(0xffffff, 18, 22);
    keyLight.position.set(2.4, 3.2, 5.5);
    scene.add(keyLight);

    const clamp = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, value));
    const ease = (value) => value * value * (3 - 2 * value);
    const morph = (from, to, amount) => {
      for (let index = 0; index < positions.length; index += 1) positions[index] = from[index] + (to[index] - from[index]) * amount;
      positionAttribute.needsUpdate = true;
    };

    function update(time) {
      const clockMix = ease(clamp((time - 3.6) / 3.2, 0, 1));
      const focusMix = ease(clamp((time - 7.2) / 2.2, 0, 1));
      if (focusMix > 0) morph(clock, focus, focusMix);
      else morph(chaos, clock, clockMix);
      particles.rotation.z = time * 0.018;
      particles.rotation.y = Math.sin(time * 0.22) * 0.08;
      fragmentGroup.visible = time < 8;
      fragmentGroup.rotation.z = -time * 0.12;
      fragmentMaterial.opacity = 0.62 * (1 - clamp((time - 6.6) / 1.2, 0, 1));
      cardGroup.visible = time >= 7.8 && time < 13.1;
      cardGroup.rotation.y = Math.sin(time * 0.45) * 0.035;
      alertGroup.visible = time >= 12.8 && time < 16.1;
      alertGroup.children.forEach((ring, index) => {
        const pulse = 1 + ((time * 0.65 + index * 0.24) % 1) * 1.8;
        ring.scale.setScalar(pulse);
        ring.material.opacity = 0.34 * (2 - pulse) / 1.8;
      });
      particleMaterial.opacity = time > 16 ? Math.max(0.08, 0.78 - (time - 16) * 0.17) : 0.78;
      camera.position.x = Math.sin(time * 0.19) * 0.12;
      camera.position.y = Math.cos(time * 0.16) * 0.09;
      renderer.render(scene, camera);
    }

    function resize() {
      const rect = canvas.getBoundingClientRect();
      renderer.setSize(Math.max(1, rect.width), Math.max(1, rect.height), false);
      camera.aspect = rect.width / Math.max(1, rect.height);
      camera.updateProjectionMatrix();
    }

    return { update, resize };
  } catch (error) {
    console.warn('Three.js unavailable; continuing with CSS film.', error);
    return null;
  }
}
```

- [ ] **Step 3: Encode the complete 20-second GSAP master timeline**

```js
function buildTimeline() {
  const timeline = gsap.timeline({ paused: true });
  const reveal = (selector, at) => timeline.set(selector, { autoAlpha: 1 }, at);
  const hide = (selector, at) => timeline.to(selector, { autoAlpha: 0, duration: 0.45, ease: 'power2.in' }, at);

  reveal('#problem', 0)
    .from('#problem .eyebrow', { y: 22, autoAlpha: 0, duration: 0.7 }, 0.15)
    .from('#problem h1', { y: 70, autoAlpha: 0, filter: 'blur(16px)', duration: 1.1, ease: 'power3.out' }, 0.35);
  hide('#problem', 3.55);
  reveal('#timer', 3.9)
    .from('#timer h2', { scale: 1.7, autoAlpha: 0, filter: 'blur(22px)', duration: 1.15, ease: 'expo.out' }, 4.05)
    .from('#timer p', { y: 24, autoAlpha: 0, duration: 0.65 }, 5.15);
  hide('#timer', 7.55);
  reveal('#signals', 7.9)
    .from('#signals h2, #signals > p', { y: 36, autoAlpha: 0, stagger: 0.12, duration: 0.72 }, 8.05)
    .from('.signal-card', { y: 110, rotateX: -18, autoAlpha: 0, stagger: 0.16, duration: 1.05, ease: 'power3.out' }, 8.55);
  hide('#signals', 12.55);
  reveal('#alerts', 12.9)
    .from('#alerts h2, #alerts > p', { y: 34, autoAlpha: 0, stagger: 0.1, duration: 0.65 }, 13.0)
    .from('.alert-card', { x: 90, autoAlpha: 0, stagger: 0.18, duration: 0.72, ease: 'power3.out' }, 13.45);
  hide('#alerts', 15.55);
  reveal('#finale', 15.9)
    .from('#finale img', { scale: 0.78, autoAlpha: 0, duration: 0.72, ease: 'back.out(1.4)' }, 16.05)
    .from('#finale h2', { y: 46, autoAlpha: 0, duration: 0.82 }, 16.35)
    .from('#finale a, #finale .legal', { y: 24, autoAlpha: 0, stagger: 0.16, duration: 0.62 }, 17.05)
    .to({}, { duration: 0.01 }, DURATION - 0.01)
    .call(showFinalState, [], DURATION);
  return timeline;
}
```

If reduced motion is active, set all tween durations to at most `0.18` while retaining the same scene start times. Do not skip any copy scene.

- [ ] **Step 4: Add automatic one-shot playback and lifecycle handling**

```js
async function startFilm() {
  if (!window.gsap) {
    showFinalState();
    return;
  }
  threeState = await initThree();
  document.getElementById('stage').classList.toggle('no-three', !threeState);
  const timeline = buildTimeline();
  if (Math.abs(timeline.totalDuration() - DURATION) > 0.001) throw new Error('Timeline must be exactly 20 seconds');
  const startedAt = performance.now();
  const frame = (now) => {
    threeState?.update((now - startedAt) / 1000);
    if (timeline.progress() < 1) requestAnimationFrame(frame);
  };
  threeState?.resize();
  addEventListener('resize', () => threeState?.resize(), { passive: true });
  requestAnimationFrame(frame);
  timeline.play(0);
}

addEventListener('DOMContentLoaded', () => startFilm().catch((error) => {
  console.error(error);
  showFinalState();
}), { once: true });
</script>
```

- [ ] **Step 5: Build and run the contract**

```powershell
rtk node scripts/build-signals-ad.mjs
rtk node scripts/validate-signals-ad.mjs
```

Expected: `BUILT public/alpha-nova-signals-20s-ad.html` and `SIGNALS_AD_CHECK=PASS`.

- [ ] **Step 6: Commit the creative source, builder, and standalone output**

```powershell
rtk git add web/scripts/build-signals-ad.mjs web/scripts/alpha-nova-signals-20s-ad.template.html web/public/alpha-nova-signals-20s-ad.html
rtk git commit -m "feat: add Alpha Nova signals vertical ad"
```

### Task 4: Verify visual states, fallbacks, and Vite output

**Files:**
- Verify: `web/public/alpha-nova-signals-20s-ad.html`
- Generate and verify: `web/dist/alpha-nova-signals-20s-ad.html`
- Modify only if checks fail: template, builder, validator, or final output from Tasks 1-3.

**Interfaces:**
- Consumes: final standalone HTML and the existing Vite project.
- Produces: five evidence screenshots, clean browser console, passing lint/build, and equal source/dist SHA-256 hashes.

- [ ] **Step 1: Run static checks before browser QA**

```powershell
rtk node scripts/validate-signals-ad.mjs
rtk npm run lint
rtk npm run build
rtk git diff --check
```

Expected: all commands exit `0`.

- [ ] **Step 2: Prove Vite copied the standalone artifact byte-for-byte**

```powershell
rtk proxy powershell -NoProfile -Command "(Get-FileHash 'public/alpha-nova-signals-20s-ad.html' -Algorithm SHA256).Hash; (Get-FileHash 'dist/alpha-nova-signals-20s-ad.html' -Algorithm SHA256).Hash"
```

Expected: both hashes are identical.

- [ ] **Step 3: Run the Vite preview and inspect five timed frames**

```powershell
rtk npm run preview -- --host 127.0.0.1
```

Open `/alpha-nova-signals-20s-ad.html` at a 1080 x 1920-equivalent viewport and capture frames near `2.0`, `6.0`, `10.5`, `14.5`, and `19.0` seconds. Confirm every headline is readable, the CTA remains within the Reel safe area, there are no controls, the end card remains visible after 20 seconds, and the console has no errors.

- [ ] **Step 4: Verify reduced motion and WebGL failure paths**

Emulate `prefers-reduced-motion: reduce`, reload, and confirm all five messages appear in sequence using short fades. Then block WebGL context creation, reload, and confirm the DOM/CSS film still reaches the CTA.

- [ ] **Step 5: Re-run the focused gate after any visual corrections**

```powershell
rtk node scripts/build-signals-ad.mjs
rtk node scripts/validate-signals-ad.mjs
rtk npm run lint
rtk npm run build
rtk git diff --check
```

Expected: all commands exit `0`, and source/dist hashes remain equal.

- [ ] **Step 6: Commit only corrections made during QA**

```powershell
rtk git add web/scripts/alpha-nova-signals-20s-ad.template.html web/scripts/build-signals-ad.mjs web/scripts/validate-signals-ad.mjs web/public/alpha-nova-signals-20s-ad.html
rtk git commit -m "test: verify Alpha Nova signals ad"
```

Do not stage unrelated worktree changes or generated Vite assets outside the new ad.
