#!/usr/bin/env node
/**
 * Builds the release feed consumed by both Otium editions.
 *
 * The Windows updater reads `platforms.windows-x86_64` (Tauri's signed
 * installer format). Otium's own update UI reads `assets` to offer the portable
 * EXE and the Android APK. One feed therefore carries one version and one set
 * of release notes for both platforms.
 *
 * The script also stages the artifacts under stable names inside the output
 * directory, so the URLs written to latest.json always match the files that
 * get uploaded to the GitHub release.
 *
 * Usage:
 *   node scripts/generate-latest-json.mjs \
 *     --installer path/to/Otium_0.1.0_x64-setup.exe \
 *     --signature path/to/Otium_0.1.0_x64-setup.exe.sig \
 *     --portable path/to/otium.exe \
 *     --apk path/to/app-universal-release.apk
 *
 * Without artifact flags the script looks in the standard Tauri output paths.
 */
import { createHash } from 'node:crypto';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync
} from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function fail(message) {
  console.error(`error: ${message}`);
  process.exit(1);
}

function readJson(relativePath) {
  try {
    return JSON.parse(readFileSync(path.join(root, relativePath), 'utf8'));
  } catch (error) {
    fail(`could not read ${relativePath}: ${error.message}`);
  }
}

function parseArgs(argv) {
  const options = new Map();
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (!argument.startsWith('--')) fail(`unexpected argument: ${argument}`);

    const equals = argument.indexOf('=');
    if (equals !== -1) {
      options.set(argument.slice(2, equals), argument.slice(equals + 1));
      continue;
    }

    const key = argument.slice(2);
    const next = argv[index + 1];
    if (next === undefined || next.startsWith('--')) {
      options.set(key, true);
    } else {
      options.set(key, next);
      index += 1;
    }
  }
  return options;
}

function stringOption(options, key, fallback) {
  const value = options.get(key);
  if (value === undefined || value === true) return fallback;
  return String(value);
}

function absolute(relativeOrAbsolute) {
  return path.isAbsolute(relativeOrAbsolute)
    ? relativeOrAbsolute
    : path.join(root, relativeOrAbsolute);
}

function requireFile(relativeOrAbsolute, label) {
  const resolved = absolute(relativeOrAbsolute);
  if (!existsSync(resolved)) fail(`${label} not found: ${relativeOrAbsolute}`);
  if (!statSync(resolved).isFile()) fail(`${label} is not a file: ${relativeOrAbsolute}`);
  return resolved;
}

function newest(directory, predicate) {
  if (!existsSync(directory)) return null;
  const matches = readdirSync(directory)
    .filter(predicate)
    .map((name) => path.join(directory, name))
    .filter((file) => statSync(file).isFile())
    .sort((left, right) => statSync(right).mtimeMs - statSync(left).mtimeMs);
  return matches[0] ?? null;
}

function discoverInstaller(version) {
  const bundleDir = path.join(root, 'src-tauri', 'target', 'release', 'bundle', 'nsis');
  const preferred = path.join(bundleDir, `Otium_${version}_x64-setup.exe`);
  if (existsSync(preferred)) return preferred;
  const fallback = newest(bundleDir, (name) => /-setup\.exe$/i.test(name));
  if (fallback) return fallback;
  fail(
    'no NSIS installer found. Run `npm run tauri:build -- --bundles nsis` ' +
      `or pass --installer. Expected ${path.relative(root, preferred)}.`
  );
}

function discoverPortable() {
  const releaseDir = path.join(root, 'src-tauri', 'target', 'release');
  for (const name of ['otium.exe', 'Otium.exe']) {
    const candidate = path.join(releaseDir, name);
    if (existsSync(candidate)) return candidate;
  }
  fail('no portable executable found. Run the Windows build or pass --portable.');
}

function discoverApk() {
  const apkRoot = path.join(
    root,
    'src-tauri',
    'gen',
    'android',
    'app',
    'build',
    'outputs',
    'apk'
  );
  if (!existsSync(apkRoot)) {
    fail('no Android APK found. Run `npm run tauri:android` or pass --apk.');
  }

  const candidates = [];
  for (const flavor of readdirSync(apkRoot)) {
    const releaseDir = path.join(apkRoot, flavor, 'release');
    if (!existsSync(releaseDir)) continue;
    for (const name of readdirSync(releaseDir)) {
      if (!name.toLowerCase().endsWith('.apk')) continue;
      candidates.push(path.join(releaseDir, name));
    }
  }

  const universal = candidates.find((file) => /universal/i.test(path.basename(file)));
  if (universal) return universal;
  if (candidates.length === 1) return candidates[0];
  if (candidates.length === 0) {
    fail('the Android build produced no release APK. Pass --apk explicitly.');
  }
  fail(
    'multiple Android APKs found; pass the universal one explicitly with --apk.\n' +
      candidates.map((file) => `  - ${path.relative(root, file)}`).join('\n')
  );
}

function sha256(file) {
  return createHash('sha256').update(readFileSync(file)).digest('hex');
}

function normalizeTag(value) {
  return value
    .trim()
    .replace(/^refs\/tags\//i, '')
    .replace(/^otium[-_]?/i, '')
    .replace(/^v/i, '');
}

const options = parseArgs(process.argv.slice(2));
const packageJson = readJson('package.json');
const version = normalizeTag(stringOption(options, 'version', packageJson.version));
if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version)) {
  fail(`invalid version "${version}"`);
}

const tag = stringOption(options, 'tag', `v${version}`);
if (normalizeTag(tag) !== version) {
  fail(`tag "${tag}" does not match version ${version}`);
}

const repository =
  stringOption(options, 'repo', '') ||
  process.env.GITHUB_REPOSITORY ||
  'XRTM8/Otium';
if (!/^[^/\s]+\/[^/\s]+$/.test(repository)) {
  fail(`invalid repository "${repository}" (expected owner/name)`);
}

const baseUrl = (
  stringOption(options, 'base-url', '') ||
  `https://github.com/${repository}/releases/download/${tag}`
).replace(/\/+$/, '');

const notesPath = requireFile(
  stringOption(options, 'notes', 'release-notes.md'),
  'release notes'
);
const notes = readFileSync(notesPath, 'utf8').trim();
if (!notes) fail(`${path.relative(root, notesPath)} is empty`);

const installer = requireFile(
  stringOption(options, 'installer', '') || discoverInstaller(version),
  'Windows installer'
);
if (!path.basename(installer).includes(version)) {
  fail(
    `installer "${path.basename(installer)}" does not contain version ${version}. ` +
      'Refusing to publish an artifact from another build.'
  );
}
const signature = requireFile(
  stringOption(options, 'signature', '') || `${installer}.sig`,
  'Windows installer signature'
);
const portable = requireFile(
  stringOption(options, 'portable', '') || discoverPortable(),
  'portable Windows executable'
);
const apk = requireFile(stringOption(options, 'apk', '') || discoverApk(), 'Android APK');

const signatureText = readFileSync(signature, 'utf8').trim();
if (!signatureText) fail('the Windows installer signature is empty');

const outputDir = absolute(stringOption(options, 'output-dir', 'release'));
mkdirSync(outputDir, { recursive: true });

const installerName = `Otium_${version}_x64-setup.exe`;
const portableName = `Otium_${version}_x64-portable.exe`;
const apkName = `Otium_${version}_universal.apk`;

function stage(source, name) {
  const destination = path.join(outputDir, name);
  if (path.resolve(source) !== path.resolve(destination)) {
    copyFileSync(source, destination);
  }
  return {
    name,
    url: `${baseUrl}/${name}`,
    size: statSync(destination).size,
    sha256: sha256(destination)
  };
}

const installerAsset = stage(installer, installerName);
const portableAsset = stage(portable, portableName);
const apkAsset = stage(apk, apkName);

const pubDate = stringOption(options, 'pub-date', new Date().toISOString());
const parsedDate = new Date(pubDate);
if (Number.isNaN(parsedDate.getTime())) fail(`invalid --pub-date "${pubDate}"`);

const feed = {
  version,
  notes,
  pub_date: parsedDate.toISOString(),
  platforms: {
    'windows-x86_64': {
      signature: signatureText,
      url: installerAsset.url
    }
  },
  assets: {
    windowsInstaller: {
      url: installerAsset.url,
      size: installerAsset.size,
      sha256: installerAsset.sha256
    },
    windowsPortable: {
      url: portableAsset.url,
      size: portableAsset.size,
      sha256: portableAsset.sha256
    },
    androidApk: {
      url: apkAsset.url,
      size: apkAsset.size,
      sha256: apkAsset.sha256
    }
  }
};

const feedPath = path.join(outputDir, 'latest.json');
writeFileSync(feedPath, `${JSON.stringify(feed, null, 2)}\n`, 'utf8');

function humanSize(bytes) {
  return `${(bytes / (1024 * 1024)).toFixed(2)} MiB`;
}

console.log(`Otium ${version} release feed`);
console.log(`  tag:      ${tag}`);
console.log(`  notes:    ${path.relative(root, notesPath)}`);
console.log(`  feed:     ${path.relative(root, feedPath)}`);
console.log(`  installer ${installerName} (${humanSize(installerAsset.size)})`);
console.log(`  portable  ${portableName} (${humanSize(portableAsset.size)})`);
console.log(`  apk       ${apkName} (${humanSize(apkAsset.size)})`);
