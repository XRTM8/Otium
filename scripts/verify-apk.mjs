#!/usr/bin/env node
/**
 * APK release gate.
 *
 * Refuses to let an installable-looking but broken artifact reach a release.
 * Verifies, for every APK given:
 *   1. it carries an APK Signature Scheme v2/v3 signature
 *   2. the signing certificate matches the expected SHA-256 fingerprint
 *   3. versionName matches package.json and versionCode is sane
 *   4. minSdk / targetSdk match the declared policy
 *   5. native libraries are 16 KB page-size aligned (Android 15+ requirement)
 *
 * Usage:
 *   node scripts/verify-apk.mjs release/*.apk
 *   node scripts/verify-apk.mjs --expect-cert 685e08... --expect-version 1.6.0 release/*.apk
 *
 * Options:
 *   --expect-cert <sha256>   required certificate fingerprint
 *   --expect-version <ver>   defaults to package.json version
 *   --min-sdk <n>            default 24
 *   --target-sdk <n>         default: read from APK, warn if below 35
 *   --skip-16kb              skip the page-size alignment check
 *
 * Requires the Android SDK build-tools (apksigner, aapt2, zipalign) and
 * ANDROID_HOME / ANDROID_SDK_ROOT, or the tools on PATH.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const argv = process.argv.slice(2);
const options = {
  expectCert: null,
  expectVersion: null,
  minSdk: 24,
  targetSdk: null,
  check16kb: true,
  apks: []
};

for (let i = 0; i < argv.length; i += 1) {
  const arg = argv[i];
  if (arg === '--expect-cert') options.expectCert = argv[++i];
  else if (arg === '--expect-version') options.expectVersion = argv[++i];
  else if (arg === '--min-sdk') options.minSdk = Number(argv[++i]);
  else if (arg === '--target-sdk') options.targetSdk = Number(argv[++i]);
  else if (arg === '--skip-16kb') options.check16kb = false;
  else if (arg.startsWith('--')) {
    console.error(`unknown option: ${arg}`);
    process.exit(2);
  } else options.apks.push(arg);
}

if (options.apks.length === 0) {
  console.error('usage: node scripts/verify-apk.mjs [options] <apk...>');
  process.exit(2);
}

if (!options.expectVersion) {
  try {
    options.expectVersion = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version;
  } catch {
    options.expectVersion = null;
  }
}

const sdkRoot = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT || null;

function findTool(baseName) {
  const names = process.platform === 'win32'
    ? [`${baseName}.bat`, `${baseName}.exe`, baseName]
    : [baseName, `${baseName}.exe`, `${baseName}.bat`];

  if (sdkRoot) {
    const buildTools = path.join(sdkRoot, 'build-tools');
    if (existsSync(buildTools)) {
      const versions = readdirSync(buildTools)
        .filter((name) => /^\d+\.\d+\.\d+$/.test(name))
        .sort((a, b) => {
          const [a1, a2, a3] = a.split('.').map(Number);
          const [b1, b2, b3] = b.split('.').map(Number);
          return b1 - a1 || b2 - a2 || b3 - a3;
        });
      for (const version of versions) {
        for (const name of names) {
          const candidate = path.join(buildTools, version, name);
          if (existsSync(candidate)) return candidate;
        }
      }
    }
  }

  for (const name of names) {
    try {
      const found = execFileSync(process.platform === 'win32' ? 'where' : 'which', [name], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore']
      }).trim().split(/\r?\n/)[0];
      if (found) return found;
    } catch {
      /* keep looking */
    }
  }

  return null;
}

function runTool(tool, args) {
  const isBatch = process.platform === 'win32' && tool.toLowerCase().endsWith('.bat');
  const common = { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 };

  // A .bat wrapper must go through the shell. Passing a fully quoted command
  // string (instead of args + shell) avoids Node's DEP0190 warning.
  const result = isBatch
    ? spawnSync([tool, ...args].map((value) => `"${value}"`).join(' '), { ...common, shell: true })
    : spawnSync(tool, args, common);

  // apksigner splits its report between stdout and stderr depending on the
  // build-tools version and platform, so always read both.
  const out = `${result.stdout ?? ''}${result.stderr ?? ''}`;
  return { ok: result.status === 0, out, code: result.status ?? 1 };
}

const apksigner = findTool('apksigner');
const aapt2 = findTool('aapt2');
const zipalign = findTool('zipalign');

if (!apksigner || !aapt2) {
  console.error('FAIL: apksigner and aapt2 are required. Set ANDROID_HOME or add build-tools to PATH.');
  process.exit(2);
}

const normalizeFingerprint = (value) => String(value || '').replace(/[^0-9a-f]/gi, '').toLowerCase();

function verifyOne(file) {
  const name = path.basename(file);
  const problems = [];
  const facts = {};

  if (!existsSync(file)) {
    return { name, problems: ['file does not exist'], facts };
  }
  facts.size = `${(statSync(file).size / 1048576).toFixed(1)} MB`;

  const signed = runTool(apksigner, ['verify', '--print-certs', '--verbose', file]);
  if (!signed.ok || /DOES NOT VERIFY/i.test(signed.out)) {
    problems.push('APK is NOT signed (this artifact cannot be installed on any Android device)');
  }

  facts.v2 = /Verified using v2 scheme.*: true/i.test(signed.out);
  facts.v3 = /Verified using v3 scheme.*: true/i.test(signed.out);
  if (signed.ok && !facts.v2 && !facts.v3) {
    problems.push('no v2/v3 signature scheme present');
  }

  const certToken = /Signer #1 certificate SHA-256 digest:\s*(\S+)/i.exec(signed.out)?.[1] ?? null;
  const cert = certToken
    ? normalizeFingerprint(certToken)
    : (/\b([0-9a-f]{64})\b/i.exec(signed.out)?.[1]?.toLowerCase() ?? null);
  facts.cert = cert;
  if (cert && options.expectCert && cert !== normalizeFingerprint(options.expectCert)) {
    problems.push(`signing key mismatch: expected ${normalizeFingerprint(options.expectCert)}, got ${cert}`);
  }
  if (!cert && signed.ok) {
    problems.push('could not read signer certificate');
    facts.rawVerify = signed.out.split(/\r?\n/).filter(Boolean).slice(0, 14).join('\n');
  }

  const badging = runTool(aapt2, ['dump', 'badging', file]);
  const line = badging.out;
  facts.package = /package: name='([^']+)'/.exec(line)?.[1] ?? null;
  facts.versionName = /versionName='([^']+)'/.exec(line)?.[1] ?? null;
  facts.versionCode = /versionCode='([^']+)'/.exec(line)?.[1] ?? null;
  facts.minSdk = Number(/minSdkVersion:'(\d+)'/.exec(line)?.[1] ?? NaN);
  facts.targetSdk = Number(/targetSdkVersion:'(\d+)'/.exec(line)?.[1] ?? NaN);
  facts.abis = [...line.matchAll(/'([a-z0-9_-]+)'/g)]
    .map((match) => match[1])
    .filter((value) => /^(arm64-v8a|armeabi-v7a|x86|x86_64)$/.test(value));
  facts.abis = [...new Set(facts.abis)];

  if (!facts.package) problems.push('unreadable APK manifest (aapt2 failed)');
  if (options.expectVersion && facts.versionName !== options.expectVersion) {
    problems.push(`versionName is ${facts.versionName}, expected ${options.expectVersion}`);
  }
  if (Number.isFinite(facts.minSdk) && facts.minSdk < options.minSdk) {
    problems.push(`minSdk ${facts.minSdk} is below the supported floor ${options.minSdk}`);
  }
  if (options.targetSdk && facts.targetSdk !== options.targetSdk) {
    problems.push(`targetSdk is ${facts.targetSdk}, expected ${options.targetSdk}`);
  }
  if (/application-debuggable/.test(line)) {
    problems.push('APK is marked debuggable');
  }

  if (options.check16kb && zipalign) {
    const aligned = runTool(zipalign, ['-c', '-P', '16', '-v', '4', file]);
    facts.aligned16kb = aligned.ok;
    if (!aligned.ok) problems.push('native libraries are not 16 KB page-size aligned');
  }

  return { name, problems, facts };
}

const results = options.apks.filter((file) => file.toLowerCase().endsWith('.apk')).map(verifyOne);
let failed = false;

for (const result of results) {
  const mark = result.problems.length === 0 ? 'PASS' : 'FAIL';
  if (result.problems.length > 0) failed = true;

  console.log(`${mark}  ${result.name}`);
  const { facts } = result;
  console.log(
    `      ${facts.package ?? '?'}  ${facts.versionName ?? '?'} (${facts.versionCode ?? '?'})  ` +
      `sdk ${facts.minSdk ?? '?'}→${facts.targetSdk ?? '?'}  ${facts.size ?? '?'}`
  );
  console.log(
    `      abis: ${(facts.abis ?? []).join(', ') || 'none'}  ` +
      `v2=${facts.v2 ?? '?'} v3=${facts.v3 ?? '?'}  ` +
      `16kb=${facts.aligned16kb ?? 'n/a'}  ` +
      `cert=${facts.cert ? normalizeFingerprint(facts.cert).slice(0, 16) + '…' : 'none'}`
  );
  for (const problem of result.problems) console.log(`      - ${problem}`);
  if (facts.rawVerify) {
    console.log('      apksigner said:');
    for (const line of facts.rawVerify.split('\n')) console.log(`      | ${line}`);
  }
}

if (failed) {
  console.error('\nRelease gate failed: at least one APK is not installable or not trustworthy.');
  process.exit(1);
}

console.log(`\nAll ${results.length} APK(s) passed the release gate.`);
