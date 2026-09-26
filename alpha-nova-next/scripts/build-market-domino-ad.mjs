import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDirectory = dirname(fileURLToPath(import.meta.url));

const defaults = Object.freeze({
  templatePath: join(
    scriptDirectory,
    'assets',
    'alpha-nova-market-domino-30s-ad.template.html',
  ),
  outputPath: join(
    scriptDirectory,
    '..',
    'public',
    'alpha-nova-market-domino-30s-ad.html',
  ),
  threePath: join(
    scriptDirectory,
    '..',
    'node_modules',
    'three',
    'build',
    'three.module.min.js',
  ),
  gsapPath: join(
    scriptDirectory,
    '..',
    'node_modules',
    'gsap',
    'dist',
    'gsap.min.js',
  ),
  chartPath: join(scriptDirectory, 'assets', 'market-domino-chart.png'),
  signalsPath: join(scriptDirectory, 'assets', 'market-domino-signals.png'),
  sectorsPath: join(scriptDirectory, 'assets', 'market-domino-sectors.png'),
});

export const stripTrailingWhitespace = (value) =>
  value
    .split(/\r?\n/u)
    .map((line) => line.replace(/[ \t]+$/u, ''))
    .join('\n');

export const embedRequired = (template, marker, value) => {
  const first = template.indexOf(marker);
  if (first < 0) throw new Error(`Missing marker: ${marker}`);
  if (template.indexOf(marker, first + marker.length) >= 0) {
    throw new Error(`Repeated marker: ${marker}`);
  }
  return template.replace(marker, value);
};

export const pngDataUri = (buffer) =>
  `data:image/png;base64,${buffer.toString('base64')}`;

export const buildMarketDominoAd = async (options = {}) => {
  const paths = { ...defaults, ...options };
  const [rawTemplate, rawThree, rawGsap, chart, signals, sectors] =
    await Promise.all([
      readFile(paths.templatePath, 'utf8'),
      readFile(paths.threePath, 'utf8'),
      readFile(paths.gsapPath, 'utf8'),
      readFile(paths.chartPath),
      readFile(paths.signalsPath),
      readFile(paths.sectorsPath),
    ]);

  const template = stripTrailingWhitespace(rawTemplate);
  const three = stripTrailingWhitespace(rawThree);
  const gsap = stripTrailingWhitespace(rawGsap);
  const threeModuleUri = `data:text/javascript;base64,${Buffer.from(
    three,
    'utf8',
  ).toString('base64')}`;

  let output = embedRequired(template, '/*__GSAP_RUNTIME__*/', gsap);
  output = embedRequired(
    output,
    '__THREE_MODULE_DATA_URI__',
    threeModuleUri,
  );
  output = embedRequired(
    output,
    '__CHART_SCREEN_DATA_URI__',
    pngDataUri(chart),
  );
  output = embedRequired(
    output,
    '__SIGNALS_SCREEN_DATA_URI__',
    pngDataUri(signals),
  );
  output = embedRequired(
    output,
    '__SECTORS_SCREEN_DATA_URI__',
    pngDataUri(sectors),
  );
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
  const result = await buildMarketDominoAd();
  process.stdout.write(
    `MARKET_DOMINO_AD_BUILD=PASS bytes=${result.bytes} sha256=${result.sha256}\n`,
  );
}
