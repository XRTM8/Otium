import { describe, expect, it } from 'vitest';
import { computeCanvasCropRegion } from './areaSnippetGeometry';

describe('AreaSnippetModal canvas crop clamping', () => {
  it('clips negative start overhang and right/bottom overhang strictly to canvas bounds', () => {
    const region = computeCanvasCropRegion(
      80,
      30,
      100,
      90,
      400,
      200,
      { left: 100, top: 50, width: 200, height: 100 }
    );
    // scaleX = 2, scaleY = 2
    // Left screenX = 80..180 intersects rect 100..180 => x=0..160 in canvas
    // Top screenY = 30..120 intersects rect 50..120 => y=0..140 in canvas
    expect(region).toEqual({ cropX: 0, cropY: 0, cropW: 160, cropH: 140 });
  });

  it('clamps right and bottom overhang strictly inside canvas dimensions', () => {
    const region = computeCanvasCropRegion(
      250,
      120,
      100,
      100,
      400,
      200,
      { left: 100, top: 50, width: 200, height: 100 }
    );
    // x=(250-100)*2=300..400 => w=100; y=(120-50)*2=140..200 => h=60
    expect(region).toEqual({ cropX: 300, cropY: 140, cropW: 100, cropH: 60 });
  });

  it('returns null when selection falls completely outside the canvas or dimensions are zero', () => {
    expect(
      computeCanvasCropRegion(0, 0, 50, 50, 400, 200, { left: 100, top: 100, width: 200, height: 100 })
    ).toBeNull();
    expect(
      computeCanvasCropRegion(100, 100, 50, 50, 0, 200, { left: 100, top: 100, width: 200, height: 100 })
    ).toBeNull();
  });
});
