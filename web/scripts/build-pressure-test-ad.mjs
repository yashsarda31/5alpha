import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDirectory = dirname(fileURLToPath(import.meta.url));

const defaults = Object.freeze({
  templatePath: join(scriptDirectory, 'assets', 'alpha-nova-pressure-test-30s-ad.template.html'),
  outputPath: join(scriptDirectory, '..', 'public', 'alpha-nova-pressure-test-30s-ad.html'),
  threePath: join(scriptDirectory, '..', 'node_modules', 'three', 'build', 'three.module.min.js'),
  gsapPath: join(scriptDirectory, '..', 'node_modules', 'gsap', 'dist', 'gsap.min.js'),
});

export const stripTrailingWhitespace = (value) =>
  value
    .split(/\r?\n/u)
    .map((line) => line.replace(/[ \t]+$/u, ''))
    .join('\n');

export const embedRuntime = (template, marker, source) => {
  if (!template.includes(marker)) {
    throw new Error(`Missing marker: ${marker}`);
  }
  return template.replace(marker, source);
};

export const buildPressureTestAd = async (options = {}) => {
  const paths = { ...defaults, ...options };
  const [rawTemplate, rawThree, rawGsap] = await Promise.all([
    readFile(paths.templatePath, 'utf8'),
    readFile(paths.threePath, 'utf8'),
    readFile(paths.gsapPath, 'utf8'),
  ]);

  const template = stripTrailingWhitespace(rawTemplate);
  const three = stripTrailingWhitespace(rawThree);
  const gsap = stripTrailingWhitespace(rawGsap);
  const threeModuleUri = `data:text/javascript;base64,${Buffer.from(three, 'utf8').toString('base64')}`;

  let output = embedRuntime(template, '/*__GSAP_RUNTIME__*/', gsap);
  output = embedRuntime(output, '__THREE_MODULE_DATA_URI__', threeModuleUri);
  output = `${stripTrailingWhitespace(output).replace(/\n*$/u, '')}\n`;

  await writeFile(paths.outputPath, output, 'utf8');

  return {
    bytes: Buffer.byteLength(output, 'utf8'),
    sha256: createHash('sha256').update(output).digest('hex'),
  };
};

const isDirectRun = process.argv[1]
  && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));

if (isDirectRun) {
  const result = await buildPressureTestAd();
  process.stdout.write(
    `PRESSURE_TEST_AD_BUILD=PASS bytes=${result.bytes} sha256=${result.sha256}\n`,
  );
}
