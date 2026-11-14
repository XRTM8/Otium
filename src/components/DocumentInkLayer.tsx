import React, { useCallback, useEffect, useRef, useState } from 'react';
import { clampPoint, hitInk, type InkMark, type InkPoint } from '../core/annotations/ink';
import { InkContext } from './documentInkContext';
import { DocumentInkNoteDialog } from './DocumentInkNoteDialog';
import type { InkTool } from './TeacherDock';

const newMarkId = () =>
  typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `ink-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;

interface DraftHeader {
  color: string;
  strokeWidth: number;
  opacity: number;
  cx: number;
  cy: number;
  initialPoints: string;
}

/** Per-page SVG ink, highlighter, eraser, and draggable text-note overlay layer. */
export function DocumentInkLayer({ page, width, height, lang }: { page: number; width: number; height: number; lang: string }) {
  const ink = React.useContext(InkContext);
  const layerScope = `${ink?.tool ?? ''}:${page}`;
  const [draftState, setDraftState] = useState<{ scope: string; value: DraftHeader | null }>({ scope: layerScope, value: null });
  const [noteState, setNoteState] = useState<{ scope: string; value: InkMark | null }>({ scope: layerScope, value: null });
  const [movingState, setMovingState] = useState<{ scope: string; value: InkMark | null }>({ scope: layerScope, value: null });

  const draftHeader = draftState.scope === layerScope ? draftState.value : null;
  const note = noteState.scope === layerScope ? noteState.value : null;
  const movingNote = movingState.scope === layerScope ? movingState.value : null;

  const setDraftHeader = useCallback((value: DraftHeader | null) => setDraftState({ scope: layerScope, value }), [layerScope]);
  const setNote = useCallback((value: InkMark | null) => setNoteState({ scope: layerScope, value }), [layerScope]);
  const setMovingNote = useCallback((value: InkMark | null) => setMovingState({ scope: layerScope, value }), [layerScope]);

  const noteDrag = useRef<{ id: number; x: number; y: number; origin: InkMark; current: InkMark; moved: boolean; element: SVGTextElement } | null>(null);
  const noteFrame = useRef<number | null>(null);
  const drawing = useRef<InkMark | null>(null);
  const draftPointsStrRef = useRef<string>('');
  const draftPolylineRef = useRef<SVGPolylineElement | null>(null);
  const draftDotRef = useRef<SVGCircleElement | null>(null);
  const surfaceRectRef = useRef<DOMRect | null>(null);
  const gesture = useRef<number | null>(null);
  const surface = useRef<HTMLDivElement>(null);
  const lastPen = useRef(0);
  const ar = lang === 'ar';

  const prevToolPageRef = useRef<{ tool: InkTool | undefined; page: number }>({ tool: ink?.tool, page });
  useEffect(() => {
    if (prevToolPageRef.current.tool !== ink?.tool || prevToolPageRef.current.page !== page) {
      prevToolPageRef.current = { tool: ink?.tool, page };
      drawing.current = null;
      gesture.current = null;
      noteDrag.current = null;
      surfaceRectRef.current = null;
      draftPointsStrRef.current = '';
    }
    return () => {
      if (noteFrame.current !== null) cancelAnimationFrame(noteFrame.current);
      noteFrame.current = null;
    };
  }, [ink?.tool, page]);

  const prevSizeRef = useRef({ width, height });
  useEffect(() => {
    if (prevSizeRef.current.width !== width || prevSizeRef.current.height !== height) {
      prevSizeRef.current = { width, height };
      surfaceRectRef.current = null;
    }
  }, [width, height]);

  const marks = (ink?.marks ?? []).filter((mark) => mark.page === page);

  const point = (e: Pick<PointerEvent, 'clientX' | 'clientY'>, useCached = false) => {
    const cached = useCached ? surfaceRectRef.current : null;
    const box = cached && cached.width > 0 && cached.height > 0 ? cached : surface.current!.getBoundingClientRect();
    return clampPoint((e.clientX - box.left) / box.width, (e.clientY - box.top) / box.height);
  };

  const erase = (p: InkPoint) => {
    if (!ink) return;
    const hit = [...marks].reverse().find((mark) => hitInk(mark, p, width, height));
    if (hit) ink.change(ink.marks.filter((mark) => mark.id !== hit.id));
  };

  const handleSurfacePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!ink) return;
    if (e.pointerType === 'pen') lastPen.current = e.timeStamp;
    if (e.pointerType === 'touch' && (e.width > 35 || e.height > 35 || (lastPen.current > 0 && e.timeStamp - lastPen.current < 800))) return;
    if (!ink.ready || ink.tool === 'hand' || ink.tool === 'select' || (ink.stylus && e.pointerType !== 'pen') || e.button !== 0) return;
    if (gesture.current !== null) return;
    e.preventDefault();
    e.stopPropagation();
    surfaceRectRef.current = surface.current!.getBoundingClientRect();
    const p = point(e, true);
    if (ink.tool === 'note') {
      const existing = [...marks].reverse().find((mark) => mark.type === 'note' && hitInk(mark, p, width, height));
      setNote(existing || { id: newMarkId(), page, type: 'note', color: ink.color, width: ink.size / 160, points: [p], text: '' });
      return;
    }
    gesture.current = e.pointerId;
    e.currentTarget.setPointerCapture(e.pointerId);
    if (ink.tool === 'eraser') {
      erase(p);
      return;
    }
    const markWidth = ink.size / (ink.tool === 'highlighter' ? 140 : 1000);
    const initialPoints = `${p.x * width},${p.y * height}`;
    drawing.current = { id: newMarkId(), page, type: ink.tool, color: ink.color, width: markWidth, points: [p] };
    draftPointsStrRef.current = initialPoints;
    setDraftHeader({
      color: ink.color,
      strokeWidth: markWidth * width,
      opacity: ink.tool === 'highlighter' ? 0.3 : 1,
      cx: p.x * width,
      cy: p.y * height,
      initialPoints,
    });
  };

  if (!ink) return null;

  const closeNote = () => {
    setNote(null);
    ink.setTool('hand');
  };

  const finishNoteDrag = (e: React.PointerEvent<SVGTextElement>, cancelled = false) => {
    const drag = noteDrag.current;
    if (!drag || drag.id !== e.pointerId) return;
    e.stopPropagation();
    noteDrag.current = null;
    if (noteFrame.current !== null) cancelAnimationFrame(noteFrame.current);
    noteFrame.current = null;
    setMovingNote(null);
    try {
      if (drag.element.hasPointerCapture(e.pointerId)) drag.element.releasePointerCapture(e.pointerId);
    } catch {
      /* Older WebViews may release capture themselves. */
    }
    if (cancelled) return;
    if (drag.moved) ink.change(ink.marks.map((mark) => (mark.id === drag.origin.id ? drag.current : mark)));
    else setNote(drag.origin);
  };

  const finish = (e: React.PointerEvent, cancelled = false) => {
    if (gesture.current !== e.pointerId) return;
    if (drawing.current && !cancelled) ink.change([...ink.marks, drawing.current]);
    gesture.current = null;
    drawing.current = null;
    surfaceRectRef.current = null;
    draftPointsStrRef.current = '';
    setDraftHeader(null);
  };

  const renderMark = (mark: InkMark) => {
    const firstPoint = mark.points[0];
    if (!firstPoint) return null;
    return mark.type === 'note' ? (
      <text
        key={mark.id}
        x={firstPoint.x * width}
        y={firstPoint.y * height}
        fill={mark.color}
        fontSize={mark.width * width}
        fontFamily="Tajawal, Arial, sans-serif"
        dominantBaseline="text-before-edge"
        direction={/[\u0600-\u06ff]/.test(mark.text || '') ? 'rtl' : 'ltr'}
        style={{ pointerEvents: ink.tool === 'hand' || ink.tool === 'note' ? 'auto' : 'none', cursor: 'grab', touchAction: 'none' }}
        role="button"
        tabIndex={0}
        aria-label={ar ? 'تعديل أو حذف الملاحظة' : 'Edit or delete note'}
        onPointerDown={(e) => {
          if ((ink.tool !== 'hand' && ink.tool !== 'note') || noteDrag.current || e.button !== 0) return;
          e.preventDefault();
          e.stopPropagation();
          noteDrag.current = { id: e.pointerId, x: e.clientX, y: e.clientY, origin: mark, current: mark, moved: false, element: e.currentTarget };
          try {
            e.currentTarget.setPointerCapture(e.pointerId);
          } catch {
            /* Pointer capture is optional on older panels. */
          }
        }}
        onPointerMove={(e) => {
          const drag = noteDrag.current;
          const originFirst = drag?.origin.points[0];
          if (!drag || drag.id !== e.pointerId || !originFirst || !surface.current) return;
          e.preventDefault();
          e.stopPropagation();
          const dx = e.clientX - drag.x;
          const dy = e.clientY - drag.y;
          if (!drag.moved && Math.hypot(dx, dy) < 5) return;
          drag.moved = true;
          const box = surface.current.getBoundingClientRect();
          drag.current = { ...drag.origin, points: [clampPoint(originFirst.x + dx / box.width, originFirst.y + dy / box.height)] };
          if (noteFrame.current === null) {
            noteFrame.current = requestAnimationFrame(() => {
              noteFrame.current = null;
              setMovingNote(noteDrag.current?.current || null);
            });
          }
        }}
        onPointerUp={(e) => finishNoteDrag(e)}
        onPointerCancel={(e) => finishNoteDrag(e, true)}
        onLostPointerCapture={(e) => finishNoteDrag(e, true)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            e.stopPropagation();
            setNote(mark);
          }
        }}
      >
        {(() => {
          const lineCounts = new Map<string, number>();
          return (mark.text || '').split('\n').map((line, i) => {
            const seen = lineCounts.get(line) ?? 0;
            lineCounts.set(line, seen + 1);
            return (
              <tspan key={`${line}:${seen}`} x={firstPoint.x * width} dy={i ? '1.35em' : '0'}>
                {line}
              </tspan>
            );
          });
        })()}
      </text>
    ) : mark.points.length === 1 ? (
      <circle
        key={mark.id}
        cx={firstPoint.x * width}
        cy={firstPoint.y * height}
        r={(mark.width * width) / 2}
        fill={mark.color}
        opacity={mark.type === 'highlighter' ? 0.3 : 1}
      />
    ) : (
      <polyline
        key={mark.id}
        points={mark.points.map((p) => `${p.x * width},${p.y * height}`).join(' ')}
        fill="none"
        stroke={mark.color}
        strokeWidth={mark.width * width}
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity={mark.type === 'highlighter' ? 0.3 : 1}
      />
    );
  };

  return (
    <div
      ref={surface}
      className="absolute inset-0 z-[15] select-none"
      style={{
        pointerEvents: ink.tool === 'hand' || ink.tool === 'select' || !ink.ready ? 'none' : 'auto',
        touchAction: ink.stylus ? 'pan-x pan-y pinch-zoom' : ink.tool === 'hand' ? 'auto' : 'none',
        cursor: ink.tool === 'eraser' ? 'crosshair' : ink.tool === 'note' ? 'text' : 'crosshair',
      }}
      onTouchStart={(e) => {
        if (e.touches.length > 1 && !ink.stylus) {
          drawing.current = null;
          gesture.current = null;
          surfaceRectRef.current = null;
          draftPointsStrRef.current = '';
          setDraftHeader(null);
        }
        if (!ink.stylus) e.stopPropagation();
      }}
      onTouchMove={(e) => {
        if (!ink.stylus) e.stopPropagation();
      }}
      onTouchEnd={(e) => {
        if (!ink.stylus) e.stopPropagation();
      }}
      onPointerDown={handleSurfacePointerDown}
      onPointerMove={(e) => {
        if (gesture.current !== e.pointerId) return;
        e.preventDefault();
        e.stopPropagation();
        if (ink.tool === 'eraser') {
          erase(point(e, true));
          return;
        }
        if (!drawing.current || drawing.current.points.length >= 5000) return;
        const p = point(e, true);
        const last = drawing.current.points[drawing.current.points.length - 1];
        if (last && Math.hypot((p.x - last.x) * width, (p.y - last.y) * height) < 1) return;
        drawing.current.points.push(p);
        draftPointsStrRef.current += ` ${p.x * width},${p.y * height}`;
        if (draftPolylineRef.current) {
          draftPolylineRef.current.setAttribute('points', draftPointsStrRef.current);
        }
        if (draftDotRef.current && drawing.current.points.length > 1) {
          draftDotRef.current.style.display = 'none';
        }
      }}
      onPointerUp={(e) => finish(e)}
      onPointerCancel={(e) => finish(e, true)}
      onLostPointerCapture={(e) => finish(e, true)}
    >
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="absolute inset-0 pointer-events-none">
        {marks.map((mark) => renderMark(movingNote?.id === mark.id ? movingNote : mark))}
        {draftHeader && (
          <g>
            <circle ref={draftDotRef} cx={draftHeader.cx} cy={draftHeader.cy} r={draftHeader.strokeWidth / 2} fill={draftHeader.color} opacity={draftHeader.opacity} />
            <polyline
              ref={draftPolylineRef}
              points={draftHeader.initialPoints}
              fill="none"
              stroke={draftHeader.color}
              strokeWidth={draftHeader.strokeWidth}
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity={draftHeader.opacity}
            />
          </g>
        )}
      </svg>
      {note && (
        <DocumentInkNoteDialog
          note={note}
          ar={ar}
          canDelete={ink.marks.some((mark) => mark.id === note.id)}
          onChange={setNote}
          onSave={() => {
            ink.change([...ink.marks.filter((mark) => mark.id !== note.id), { ...note, text: note.text!.trim() }]);
            closeNote();
          }}
          onDelete={() => {
            ink.change(ink.marks.filter((mark) => mark.id !== note.id));
            closeNote();
          }}
          onClose={closeNote}
        />
      )}
    </div>
  );
}
