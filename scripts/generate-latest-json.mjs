#!/usr/bin/env node
/**
 * Generates the unified, signed release feed (latest.json) for Otium.
 *
 * Targets strictly 3 release artifacts:
 * 1. Windows x64 NSIS Installer (.exe) with minisign updater signature.
 * 2. Android Universal APK (.apk) for all supported device ABIs.
 * 3. Android Modern ARM64-v8a APK (.apk) optimized for modern 64-bit devices.
 *
 * Compatible with existing Tauri v2 updater keys and previous signatures.
 * Portable EXEs, legacy 32-bit ARM, and x86 APKs are deliberately excluded.
 *
 * Usage:
 *   node scripts/generate-latest-json.mjs \
 *     --installer path/to/Otium_2.0.10_x64-setup.exe \
 *     --signature path/to/Otium_2.0.10_x64-setup.exe.sig \
 *     --apk-universal path/to/Otium_2.0.10_universal.apk \
 *     --apk-arm64 path/to/Otium_2.0.10_arm64-v8a.apk
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

function discoverApk(flavorPattern) {
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
  if (!existsSync(apkRoot)) return null;

  const candidates = [];
  for (const flavor of readdirSync(apkRoot)) {
    const releaseDir = path.join(apkRoot, flavor, 'release');
    if (!existsSync(releaseDir)) continue;
    for (const name of readdirSync(releaseDir)) {
      if (!name.toLowerCase().endsWith('.apk')) continue;
      candidates.push(path.join(releaseDir, name));
    }
  }

  return candidates.find((file) => flavorPattern.test(path.basename(file))) ?? null;
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

// 1. Windows Installer (NSIS Setup .exe only)
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

// 2. Windows Updater Signature (.sig)
const signature = requireFile(
  stringOption(options, 'signature', '') || `${installer}.sig`,
  'Windows installer signature'
);
const signatureText = readFileSync(signature, 'utf8').trim();
if (!signatureText) fail('the Windows installer signature is empty');

// 3. Android Universal APK
const apkUniversalPath =
  stringOption(options, 'apk-universal', '') ||
  stringOption(options, 'apk', '') ||
  discoverApk(/universal/i);
const apkUniversal = requireFile(apkUniversalPath, 'Android Universal APK');

// 4. Android Modern ARM64 APK
const apkArm64Path =
  stringOption(options, 'apk-arm64', '') ||
  discoverApk(/arm64/i);
const apkArm64 = requireFile(apkArm64Path, 'Android Modern ARM64 APK');

const outputDir = absolute(stringOption(options, 'output-dir', 'release'));
mkdirSync(outputDir, { recursive: true });

const installerName = `Otium_${version}_x64-setup.exe`;
const installerSigName = `${installerName}.sig`;
const apkUniversalName = `Otium_${version}_universal.apk`;
const apkArm64Name = `Otium_${version}_arm64-v8a.apk`;

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
stage(signature, installerSigName);
const apkUniversalAsset = stage(apkUniversal, apkUniversalName);
const apkArm64Asset = stage(apkArm64, apkArm64Name);

const pubDate = stringOption(options, 'pub-date', new Date().toISOString());
const parsedDate = new Date(pubDate);
if (Number.isNaN(parsedDate.getTime())) fail(`invalid --pub-date "${pubDate}"`);

// Build standard Tauri v2 update feed preserving exact signature structure
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
    androidUniversal: {
      url: apkUniversalAsset.url,
      size: apkUniversalAsset.size,
      sha256: apkUniversalAsset.sha256
    },
    androidArm64: {
      url: apkArm64Asset.url,
      size: apkArm64Asset.size,
      sha256: apkArm64Asset.sha256
    },
    // Backwards-compatibility alias for older mobile clients
    androidApk: {
      url: apkUniversalAsset.url,
      size: apkUniversalAsset.size,
      sha256: apkUniversalAsset.sha256
    }
  }
};

const feedPath = path.join(outputDir, 'latest.json');
writeFileSync(feedPath, `${JSON.stringify(feed, null, 2)}\n`, 'utf8');

function humanSize(bytes) {
  return `${(bytes / (1024 * 1024)).toFixed(2)} MiB`;
}

console.log(`Otium ${version} release feed (Universal + ARM64 + NSIS Setup EXE)`);
console.log(`  tag:             ${tag}`);
console.log(`  notes:           ${path.relative(root, notesPath)}`);
console.log(`  feed:            ${path.relative(root, feedPath)}`);
console.log(`  installer (.exe) ${installerName} (${humanSize(installerAsset.size)})`);
console.log(`  signature (.sig) ${installerSigName}`);
console.log(`  universal (.apk) ${apkUniversalName} (${humanSize(apkUniversalAsset.size)})`);
console.log(`  arm64-v8a (.apk) ${apkArm64Name} (${humanSize(apkArm64Asset.size)})`);
