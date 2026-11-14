import { expect, it } from 'vitest';
import { validDrawing, validStrokes, type InkStroke } from './drawing';
const stroke: InkStroke = { color: '#ff0000', opacity: 0.3, width: 0.01, points: [{ x: 0.2, y: 0.9 }] };
it('accepts normalized ink for resizing while rejecting invalid coordinates and page numbers', () => {
  expect(validDrawing({ 1: [stroke], 200: [] })).toBe(true);
  expect(validDrawing({ 201: [stroke] })).toBe(false);
  expect(validStrokes([{ ...stroke, points: [{ x: -1, y: 0 }] }])).toBe(false);
  expect(validStrokes([{ ...stroke, color: 'url(https://example.com)' }])).toBe(false);
});
it('bounds drawing work across the entire presentation', () => {
  const large = { ...stroke, points: Array.from({ length: 3000 }, () => ({ x: 0, y: 0 })) };
  expect(validDrawing({ 1: Array(66).fill(large), 2: [large] })).toBe(false);
  expect(validStrokes(Array(201).fill(stroke))).toBe(false);
});
