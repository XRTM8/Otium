#!/usr/bin/env node
/**
 * Post-release verifier.
 *
 * Downloads the published feed and every attached artifact, then proves that
 * the sizes, SHA-256 values, and the updater signature all match what the
 * repository says they should be. Run it after the Release workflow finishes:
 *
 *   node scripts/verify-release.mjs
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FEED_URL = 'https://github.com/XRTM8/Otium/releases/latest/download/latest.json';
const packageJson = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
const expectedVersion = packageJson.version;

function fail(message) {
  console.error('FAIL:', message);
  process.exitCode = 1;
}

async function fetchBuffer(url) {
  const response = await fetch(url, { redirect: 'follow' });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText} for ${url}`);
  return Buffer.from(await response.arrayBuffer());
}

function spkiFromRaw(raw32) {
  const prefix = Buffer.from('302a300506032b6570032100', 'hex');
  return crypto.createPublicKey({
    key: Buffer.concat([prefix, raw32]),
    format: 'der',
    type: 'spki'
  });
}

function parseMinisign(text) {
  return Buffer.from(text.trim(), 'base64').toString('utf8').split(/\r?\n/).filter(Boolean);
}

function parsePublicKey(pubkeyB64) {
  const blob = Buffer.from(parseMinisign(pubkeyB64)[1], 'base64');
  return { keyId: blob.subarray(2, 10), key: blob.subarray(10, 42) };
}

async function main() {
  console.log('feed:', FEED_URL);
  const feed = JSON.parse((await fetchBuffer(FEED_URL)).toString('utf8'));
  console.log('published version:', feed.version, '| notes chars:', (feed.notes || '').length);

  if (feed.version !== expectedVersion) {
    fail(`feed version is ${feed.version}, expected ${expectedVersion}`);
  }
  if (!feed.platforms || !feed.platforms['windows-x86_64']) {
    fail('feed has no windows-x86_64 platform');
  }

  const conf = JSON.parse(readFileSync(path.join(root, 'src-tauri', 'tauri.conf.json'), 'utf8'));
  const { keyId: pubKeyId, key: pubKey } = parsePublicKey(conf.plugins.updater.pubkey.trim());

  for (const [key, asset] of Object.entries(feed.assets || {})) {
    if (!asset || !asset.url) {
      fail(`asset ${key} is missing from the feed`);
      continue;
    }

    const buffer = await fetchBuffer(asset.url);
    const sha256 = crypto.createHash('sha256').update(buffer).digest('hex');
    const checks = {
      https: asset.url.startsWith('https://'),
      size: asset.size === buffer.length,
      sha256: (asset.sha256 || '').toLowerCase() === sha256
    };
    if (!Object.values(checks).every(Boolean)) {
      fail(`asset ${key} mismatch: ${JSON.stringify(checks)}`);
    }
    console.log(`asset ${key}: ${buffer.length} bytes`, checks);

    if (key !== 'windowsInstaller') continue;

    const sigText = (await fetchBuffer(`${asset.url}.sig`)).toString('utf8').trim();
    const feedSig = feed.platforms['windows-x86_64'].signature.trim();
    if (sigText !== feedSig) fail('attached .sig differs from the feed signature');

    const sigLines = parseMinisign(sigText);
    const sigBlob = Buffer.from(sigLines[1], 'base64');
    const alg = sigBlob.subarray(0, 2).toString('latin1');
    const sigKeyId = sigBlob.subarray(2, 10);
    const signature = sigBlob.subarray(10, 74);
    const message = alg === 'ED' ? crypto.createHash('blake2b512').update(buffer).digest() : buffer;
    const ed25519Valid = crypto.verify(null, message, spkiFromRaw(pubKey), signature);

    console.log('updater signature:', {
      alg,
      keyIdMatches: sigKeyId.equals(pubKeyId),
      ed25519Valid,
      trustedComment: sigLines.find((line) => line.startsWith('trusted comment: '))
    });
    if (!sigKeyId.equals(pubKeyId) || !ed25519Valid) {
      fail('installer signature does not verify against the embedded public key');
    }
  }

  console.log(process.exitCode ? 'RESULT: FAILED' : 'RESULT: published release verified');
}

main().catch((error) => {
  console.error('ERROR:', error.message);
  process.exitCode = 1;
});
