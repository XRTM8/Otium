import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { BEAM_RELAY_ORIGIN } from './beamSecurity';
it('keeps web and native connection policies aligned with the actual relay', () => {
  const html = readFileSync(new URL('../../../index.html', import.meta.url), 'utf8');
  const conf = JSON.parse(readFileSync(new URL('../../../src-tauri/tauri.conf.json', import.meta.url), 'utf8'));
  expect(html).toContain(BEAM_RELAY_ORIGIN);
  expect(html).not.toContain("script-src 'self' 'unsafe-inline'");
  expect(html).not.toContain('wss: https:');
  expect(conf.app.security.csp['connect-src']).toContain(BEAM_RELAY_ORIGIN);
  expect(conf.app.security.devCsp['connect-src']).toContain(BEAM_RELAY_ORIGIN);
});
