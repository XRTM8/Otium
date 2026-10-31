import { expect, it } from 'vitest';
import { defaultBeamTab } from './deviceRole';
it('makes Android displays receivers even with a document already open', () => {
  expect(defaultBeamTab('mobile', false, 'receiver')).toBe('receive');
  expect(defaultBeamTab('mobile', true, 'receiver')).toBe('receive');
});
it('preserves phone and existing desktop sender defaults', () => {
  expect(defaultBeamTab('mobile', false)).toBe('send');
  expect(defaultBeamTab('desktop', true)).toBe('send');
  expect(defaultBeamTab('desktop', false)).toBe('receive');
  expect(defaultBeamTab('desktop', false, 'sender')).toBe('send');
});
