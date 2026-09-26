import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  buildPressureTestAd,
  embedRuntime,
  stripTrailingWhitespace,
} from './build-pressure-test-ad.mjs';

test('stripTrailingWhitespace normalizes line endings and runtime whitespace', () => {
  assert.equal(stripTrailingWhitespace('a  \r\n b\t\n'), 'a\n b\n');
});

test('embedRuntime replaces one required marker', () => {
  assert.equal(
    embedRuntime('before TOKEN after', 'TOKEN', 'runtime'),
    'before runtime after',
  );
  assert.throws(
    () => embedRuntime('no marker', 'TOKEN', 'runtime'),
    /Missing marker: TOKEN/,
  );
});

test('buildPressureTestAd embeds GSAP and a self-contained Three.js data URI', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'pressure-test-ad-'));
  const templatePath = join(directory, 'template.html');
  const outputPath = join(directory, 'output.html');
  const threePath = join(directory, 'three.js');
  const gsapPath = join(directory, 'gsap.js');

  await Promise.all([
    writeFile(
      templatePath,
      '<script>/*__GSAP_RUNTIME__*/</script>\n<script>const uri="__THREE_MODULE_DATA_URI__";</script>\n',
      'utf8',
    ),
    writeFile(threePath, 'export const REVISION = "166";  \r\n', 'utf8'),
    writeFile(gsapPath, 'window.gsap = {};  \r\n', 'utf8'),
  ]);

  const result = await buildPressureTestAd({
    templatePath,
    outputPath,
    threePath,
    gsapPath,
  });
  const output = await readFile(outputPath, 'utf8');

  assert.ok(result.bytes > 100);
  assert.match(result.sha256, /^[a-f0-9]{64}$/u);
  assert.match(output, /window\.gsap = \{\};/u);
  assert.match(output, /data:text\/javascript;base64,/u);
  assert.doesNotMatch(output, /__THREE_MODULE_DATA_URI__|__GSAP_RUNTIME__/u);
  assert.equal(output.endsWith('\n'), true);
  assert.doesNotMatch(output, /[ \t]+\n/u);
});
