import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  buildMarketDominoAd,
  embedRequired,
  pngDataUri,
  stripTrailingWhitespace,
} from './build-market-domino-ad.mjs';

test('stripTrailingWhitespace normalizes line endings and runtime whitespace', () => {
  assert.equal(stripTrailingWhitespace('a  \r\n b\t\n'), 'a\n b\n');
});

test('embedRequired replaces one marker and rejects missing or repeated markers', () => {
  assert.equal(
    embedRequired('before TOKEN after', 'TOKEN', 'value'),
    'before value after',
  );
  assert.throws(
    () => embedRequired('missing', 'TOKEN', 'value'),
    /Missing marker: TOKEN/,
  );
  assert.throws(
    () => embedRequired('TOKEN TOKEN', 'TOKEN', 'value'),
    /Repeated marker: TOKEN/,
  );
});

test('pngDataUri creates a portable PNG data URI', () => {
  assert.equal(pngDataUri(Buffer.from([1, 2, 3])), 'data:image/png;base64,AQID');
});

test('buildMarketDominoAd embeds runtimes and all three product screens', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'market-domino-ad-'));
  const templatePath = join(directory, 'template.html');
  const outputPath = join(directory, 'output.html');
  const threePath = join(directory, 'three.js');
  const gsapPath = join(directory, 'gsap.js');
  const chartPath = join(directory, 'chart.png');
  const signalsPath = join(directory, 'signals.png');
  const sectorsPath = join(directory, 'sectors.png');

  await Promise.all([
    writeFile(
      templatePath,
      [
        '<script>/*__GSAP_RUNTIME__*/</script>',
        '<script>const uri="__THREE_MODULE_DATA_URI__";</script>',
        '<img src="__CHART_SCREEN_DATA_URI__">',
        '<img src="__SIGNALS_SCREEN_DATA_URI__">',
        '<img src="__SECTORS_SCREEN_DATA_URI__">',
        '',
      ].join('\n'),
      'utf8',
    ),
    writeFile(threePath, 'export const REVISION = "166";  \r\n', 'utf8'),
    writeFile(gsapPath, 'window.gsap = {};  \r\n', 'utf8'),
    writeFile(chartPath, Buffer.from([1, 2, 3])),
    writeFile(signalsPath, Buffer.from([4, 5, 6])),
    writeFile(sectorsPath, Buffer.from([7, 8, 9])),
  ]);

  const result = await buildMarketDominoAd({
    templatePath,
    outputPath,
    threePath,
    gsapPath,
    chartPath,
    signalsPath,
    sectorsPath,
  });
  const output = await readFile(outputPath, 'utf8');

  assert.ok(result.bytes > 200);
  assert.match(result.sha256, /^[a-f0-9]{64}$/u);
  assert.match(output, /window\.gsap = \{\};/u);
  assert.match(output, /data:text\/javascript;base64,/u);
  assert.equal((output.match(/data:image\/png;base64,/gu) ?? []).length, 3);
  assert.doesNotMatch(
    output,
    /__(THREE|CHART|SIGNALS|SECTORS)|__GSAP_RUNTIME__/u,
  );
  assert.equal(output.endsWith('\n'), true);
  assert.doesNotMatch(output, /[ \t]+\n/u);
});

test('creative template keeps the hook visible and gates playback from zero', async () => {
  const template = await readFile(
    new URL('assets/alpha-nova-market-domino-30s-ad.template.html', import.meta.url),
    'utf8',
  );

  assert.match(template, /class="beat is-opening" id="hook"/u);
  assert.match(template, /One reaction…/u);
  assert.match(template, /const AD_DURATION = 30;/u);
  assert.match(template, /timeline\.pause\(0\)/u);
  assert.match(template, /requestAnimationFrame/u);
  assert.match(template, /visibilitychange/u);
  assert.match(template, /waitingForFirstVisible/u);
  assert.match(template, /window\.__MARKET_DOMINO_AD__/u);
});
