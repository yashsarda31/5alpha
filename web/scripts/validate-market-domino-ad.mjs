import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const artifactPath = join(
  scriptDirectory,
  '..',
  'public',
  'alpha-nova-market-domino-30s-ad.html',
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
  'chain: 4',
  'pause: 9',
  'chart: 12',
  'signals: 15.4',
  'sectors: 18.8',
  'decision: 22',
  'endcard: 26',
  'complete: 30',
  'One reaction…',
  '…can trigger everything.',
  'Pause.',
  'See the chart.',
  'Read the signal.',
  'Know the regime.',
  'Then decide.',
  'Break the reaction. Build the decision.',
  'Chart. Signal. Regime. One disciplined view.',
  'href="https://alphanova48.in/"',
  'Alpha Nova Chart Analyser screenshot',
  'Alpha Nova India Market Signals screenshot',
  'Alpha Nova Sector Rotation screenshot',
  'createDominoScene',
  'BoxGeometry',
  'CylinderGeometry',
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
  'timeline.pause(0);',
  'get visibleBeats()',
  'readableBeatIds',
  'master.set(`#${previous}`, { autoAlpha: 0 }, at);',
  'master.set(`#${name}`, { autoAlpha: 1 }, at);',
  'new URLSearchParams',
  'prefers-reduced-motion: reduce',
  'is-css-fallback',
  "params.get('fallback') === '1'",
  "params.get('frame')",
  'window.__MARKET_DOMINO_AD__',
]) requireText(text);

const pngDataUris = html.match(/data:image\/png;base64,/gu) ?? [];
if (pngDataUris.length !== 3) {
  failures.push(`expected 3 embedded PNG screenshots, found ${pngDataUris.length}`);
}

forbid(
  /__THREE_MODULE_DATA_URI__|__(CHART|SIGNALS|SECTORS)_SCREEN_DATA_URI__|__GSAP_RUNTIME__/u,
  'unresolved embed marker',
);
forbid(/<script\b[^>]*\bsrc\s*=/iu, 'external script source');
forbid(/<link\b[^>]*\bhref\s*=/iu, 'external linked asset');
forbid(/<img\b[^>]*\bsrc=["']https?:/iu, 'external screenshot asset');
forbid(/url\(\s*["']?https?:/iu, 'external CSS asset');
forbid(/<(audio|video)\b/iu, 'audio or video element present');
forbid(
  /href=["']https?:\/\/(?!alphanova48\.in\/["'])/iu,
  'unexpected external navigation',
);
forbid(/\bloop\s*=/iu, 'looping media attribute present');
forbid(/\bcontrols\s*=/iu, 'media controls present');
forbid(
  /master\.set\(`#\$\{name\}`, \{ autoAlpha: 1 \}, fadeStart\)/u,
  'incoming copy is revealed before its canonical boundary',
);

const openingMatches = html.match(/class="beat is-opening"/gu) ?? [];
if (openingMatches.length !== 1) {
  failures.push(`expected one static opening beat, found ${openingMatches.length}`);
}

const bytes = Buffer.byteLength(html, 'utf8');
if (bytes < 700_000) {
  failures.push(`artifact too small for embedded runtimes and screenshots: ${bytes}`);
}

if (failures.length) {
  process.stderr.write(
    `MARKET_DOMINO_AD_CHECK=FAIL\n${failures.map((item) => `- ${item}`).join('\n')}\n`,
  );
  process.exitCode = 1;
} else {
  const sha256 = createHash('sha256').update(html).digest('hex');
  process.stdout.write(
    `MARKET_DOMINO_AD_CHECK=PASS three=166 duration=30 bytes=${bytes} sha256=${sha256}\n`,
  );
}
