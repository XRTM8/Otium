import { describe, expect, it } from 'vitest';
import { DEFAULT_TEACHING, normalizeTeaching, readTeaching, saveTeaching } from './teaching';
describe('teacher comfort preferences', () => {
  it('remembers reachable placement and pen settings on this device', () => {
    const value = { ...DEFAULT_TEACHING, position: 'right' as const, offset: 56, size: 60, color: '#2266aa', width: 8, stylusOnly: true };
    saveTeaching(value); expect(readTeaching()).toEqual(value);
  });
  it('keeps damaged preferences within usable bounds', () => {
    expect(normalizeTeaching({ offset: -90, size: 500, width: NaN, color: 'invalid' })).toEqual({ ...DEFAULT_TEACHING, offset: 8, size: 64 });
  });
});
