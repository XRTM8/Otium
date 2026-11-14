import { memo, useEffect, useRef, useState } from 'react';
import type { PointerEvent } from 'react';
import type { InkPoint, InkStroke } from './drawing';
const StrokeShape = memo(function StrokeShape({ stroke, width, height }: { stroke: InkStroke; width: number; height: number }) {
  const firstPoint = stroke.points[0];
  return stroke.points.length === 1 && firstPoint
    ? <circle cx={firstPoint.x * width} cy={firstPoint.y * height} r={stroke.width * width / 2} fill={stroke.color} opacity={stroke.opacity} />
    : <polyline points={stroke.points.map(p => `${p.x * width},${p.y * height}`).join(' ')} fill="none" stroke={stroke.color} opacity={stroke.opacity} strokeWidth={stroke.width * width} strokeLinecap="round" strokeLinejoin="round" />;
});

export function Ink({ enabled, color, width, height, strokes: controlled, onChange, size = 3, highlighter = false }: {
  enabled: boolean; color: string; width: number; height: number;
  strokes?: InkStroke[]; onChange?: (value: InkStroke[]) => void; size?: number; highlighter?: boolean;
}) {
  const [internal, setInternal] = useState<InkStroke[]>([]);
  const [liveHeader, setLiveHeader] = useState<{ color: string; width: number; opacity: number; cx: number; cy: number; initialPoints: string } | null>(null);
  const strokes = controlled ?? internal;
  const visibleLiveHeader = enabled ? liveHeader : null;
  const pointer = useRef<number | null>(null);
  const live = useRef<InkStroke | null>(null);
  const rectRef = useRef<DOMRect | null>(null);
  const livePointsStrRef = useRef<string>('');
  const livePolylineRef = useRef<SVGPolylineElement | null>(null);
  const liveDotRef = useRef<SVGCircleElement | null>(null);
  useEffect(() => {
    if (!enabled) {
      pointer.current = null;
      live.current = null;
      rectRef.current = null;
      livePointsStrRef.current = '';
    }
  }, [enabled]);
  const point = (event: Pick<PointerEvent<SVGSVGElement>, 'clientX' | 'clientY'>, rect: DOMRect): InkPoint => ({
    x: Math.max(0, Math.min(1, (event.clientX - rect.left) / Math.max(1, rect.width))),
    y: Math.max(0, Math.min(1, (event.clientY - rect.top) / Math.max(1, rect.height)))
  });
  const cancel = () => {
    pointer.current = null;
    live.current = null;
    rectRef.current = null;
    livePointsStrRef.current = '';
    setLiveHeader(null);
  };
  return <svg className={`ink ${enabled ? 'active' : ''}`} viewBox={`0 0 ${width} ${height}`} aria-label="طبقة الشرح"
    onPointerDown={event => {
      if (!enabled || !event.isPrimary || event.button !== 0 || pointer.current !== null || strokes.length >= 200) return;
      event.preventDefault(); pointer.current = event.pointerId;
      event.currentTarget.setPointerCapture(event.pointerId);
      const rect = event.currentTarget.getBoundingClientRect();
      rectRef.current = rect;
      const first = point(event, rect);
      const strokeWidth = Math.min(1, size / Math.max(1, rect.width));
      const opacity = highlighter ? 0.3 : 1;
      const initialPoints = `${first.x * width},${first.y * height}`;
      live.current = { color, width: strokeWidth, opacity, points: [first] };
      livePointsStrRef.current = initialPoints;
      setLiveHeader({ color, width: strokeWidth, opacity, cx: first.x * width, cy: first.y * height, initialPoints });
    }}
    onPointerMove={event => {
      if (!enabled || event.pointerId !== pointer.current || !live.current || live.current.points.length >= 3000) return;
      const coalesced = event.nativeEvent.getCoalescedEvents?.();
      const samples = coalesced?.length ? coalesced : [event];
      const cachedRect = rectRef.current;
      const rect = cachedRect && cachedRect.width > 0 && cachedRect.height > 0 ? cachedRect : event.currentTarget.getBoundingClientRect();
      const points = samples.map(sample => point(sample, rect));
      const remaining = 3000 - live.current.points.length;
      const accepted = remaining >= points.length ? points : points.slice(0, remaining);
      if (accepted.length === 0) return;
      live.current.points.push(...accepted);
      for (const p of accepted) {
        livePointsStrRef.current += ` ${p.x * width},${p.y * height}`;
      }
      if (livePolylineRef.current) {
        livePolylineRef.current.setAttribute('points', livePointsStrRef.current);
      }
      if (liveDotRef.current && live.current.points.length > 1) {
        liveDotRef.current.style.display = 'none';
      }
    }}
    onPointerUp={event => {
      if (event.pointerId !== pointer.current) return;
      const finished = live.current;
      cancel();
      if (finished) { const next = [...strokes, finished]; if (onChange) onChange(next); else setInternal(next); }
    }} onPointerCancel={cancel} onLostPointerCapture={cancel}>
    {strokes.map((stroke) => <StrokeShape key={`${stroke.color}-${stroke.width}-${stroke.opacity}-${stroke.points[0]?.x ?? 0}-${stroke.points[0]?.y ?? 0}-${stroke.points.length}`} stroke={stroke} width={width} height={height} />)}
    {visibleLiveHeader && (
      <g>
        <circle ref={liveDotRef} cx={visibleLiveHeader.cx} cy={visibleLiveHeader.cy} r={visibleLiveHeader.width * width / 2} fill={visibleLiveHeader.color} opacity={visibleLiveHeader.opacity} />
        <polyline ref={livePolylineRef} points={visibleLiveHeader.initialPoints} fill="none" stroke={visibleLiveHeader.color} opacity={visibleLiveHeader.opacity} strokeWidth={visibleLiveHeader.width * width} strokeLinecap="round" strokeLinejoin="round" />
      </g>
    )}
  </svg>;
}
