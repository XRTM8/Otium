import { expect, it } from 'vitest';
import { boundedResponseBytes, trustedRelayUrl } from './beamSecurity';

it('allows only explicitly trusted HTTPS attachment hosts', () => {
  expect(trustedRelayUrl('https://ntfy.tedomum.fr/file/example.pdf')).toBe('https://ntfy.tedomum.fr/file/example.pdf');
  expect(trustedRelayUrl('https://ntfy.sh/file/example.pdf')).toBe('https://ntfy.sh/file/example.pdf');
  for (const url of ['http://ntfy.sh/file', 'https://127.0.0.1/private', 'https://ntfy.sh.evil.test/file', 'file:///secret.pdf', 'https://user:pass@ntfy.sh/file', 'https://ntfy.sh:8443/file']) expect(() => trustedRelayUrl(url)).toThrow();
});
it('bounds streamed bytes even when Content-Length is absent', async () => {
  const response = new Response(new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(6)); controller.enqueue(new Uint8Array(6)); controller.close(); } }));
  await expect(boundedResponseBytes(response, 10)).rejects.toThrow('transfer limit');
  expect((await boundedResponseBytes(new Response(new Uint8Array(8)), 10)).byteLength).toBe(8);
});
it('rejects oversized declared attachments before allocating a body', async () => {
  await expect(boundedResponseBytes(new Response('small', { headers: { 'Content-Length': '1000000' } }), 10)).rejects.toThrow('transfer limit');
});
