import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const artifactPath = join(
  scriptDirectory,
  '..',
  'public',
  'alpha-nova-pressure-test-30s-ad.html',
);

const failures = [];
let html = '';

try {
  html = await readFile(artifactPath, 'utf8');
} catch (error) {
  failures.push(`artifact unreadable: ${error.message}`);
}

const requireText = (text) => {
  if (!html.includes(text)) failures.push(`missing: ${text}`);
};

const forbid = (pattern, message) => {
  if (pattern.test(html)) failures.push(message);
};

for (const text of [
  'data-aspect="9:16"',
  'const AD_DURATION = 30;',
  'repeat: 0',
  'hook: 0',
  'pressure: 4',
  'flcl: 7',
  'signals: 12',
  'risk: 17',
  'resolution: 22',
  'endcard: 26',
  'complete: 30',
  'You know this feeling.',
  'The trade feels urgent.',
  'FLCL',
  'See the regime.',
  'SIGNALS',
  'Plan the move.',
  'MINERVINI + DRUCK',
  'Test trend. Size risk.',
  'Urgency is not conviction.',
  'A trade idea deserves a pressure test.',
  'Pressure-test the trade.',
  'FLCL · Signals · Minervini + Druck',
  'href="https://alphanova48.in"',
  'createPressureScene',
  'SphereGeometry',
  'ShaderMaterial',
  'PlaneGeometry',
  'TorusGeometry',
  'ACESFilmicToneMapping',
  'THREE.REVISION',
  "renderer = 'webgl'",
  "renderer = 'css'",
  'createMasterTimeline',
  'seekToFrame',
  'visibilitychange',
  'pagehide',
  'pageshow',
  'requestAnimationFrame',
  'waitingForFirstVisible',
  'playbackReady',
  'get visibleBeats()',
  'readableBeatIds',
  'timeline.set(`#${previous}`, { autoAlpha: 0 }, at);',
  'timeline.set(`#${name}`, { autoAlpha: 1 }, at);',
  'new URLSearchParams',
  'prefers-reduced-motion: reduce',
  'is-css-fallback',
  'fallback=1',
]) requireText(text);

forbid(/__THREE_MODULE_DATA_URI__|__GSAP_RUNTIME__/u, 'unresolved runtime marker');
forbid(/<script\b[^>]*\bsrc\s*=/iu, 'external script source');
forbid(/<link\b[^>]*\bhref\s*=/iu, 'external linked asset');
forbid(/url\(\s*["']?https?:/iu, 'external CSS asset');
forbid(/<(audio|video)\b/iu, 'audio or video element present');
forbid(/href=["']https?:\/\/(?!alphanova48\.in(?:[\/'"]))/iu, 'unexpected external navigation');
forbid(/\bloop\s*=/iu, 'looping media attribute present');
forbid(
  /const entrance = Math\.max\(0, at - 0\.82\)/u,
  'copy beats are revealed early and can overlap',
);
forbid(
  /\{ y: 14 \* motionScale, filter: `blur\(\$\{6 \* motionScale\}px\)` \}/u,
  'incoming copy is blurred at canonical beat boundaries',
);

const bytes = Buffer.byteLength(html, 'utf8');
if (bytes < 500_000) failures.push(`artifact too small for embedded runtimes: ${bytes}`);

if (failures.length) {
  process.stderr.write(`PRESSURE_TEST_AD_CHECK=FAIL\n${failures.map((item) => `- ${item}`).join('\n')}\n`);
  process.exitCode = 1;
} else {
  const sha256 = createHash('sha256').update(html).digest('hex');
  process.stdout.write(
    `PRESSURE_TEST_AD_CHECK=PASS three=166 duration=30 bytes=${bytes} sha256=${sha256}\n`,
  );
}
