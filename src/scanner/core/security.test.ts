import { beforeEach, describe, expect, it } from 'vitest';
import { clearVaultPin, hasVaultPin, setVaultPin, verifyVaultPin } from './security';

describe('Vault Security Engine', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('reports hasVaultPin = false initially', () => {
    expect(hasVaultPin()).toBe(false);
  });

  it('hashes and sets PIN correctly and verifies successfully', async () => {
    await setVaultPin('1234');
    expect(hasVaultPin()).toBe(true);

    const match = await verifyVaultPin('1234');
    expect(match).toBe(true);

    const wrong = await verifyVaultPin('9999');
    expect(wrong).toBe(false);
  });

  it('clears vault pin cleanly', async () => {
    await setVaultPin('5678');
    expect(hasVaultPin()).toBe(true);

    clearVaultPin();
    expect(hasVaultPin()).toBe(false);
    expect(await verifyVaultPin('5678')).toBe(false);
  });
});
