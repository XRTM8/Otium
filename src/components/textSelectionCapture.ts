import type { AnnotationQuad, AnnotationRect, TextAnnotation } from '../core/types';
import {
  getAccurateSelectionRects,
  mergeSelectionRects,
  pageElementFor,
  type SelectionState,
} from './textSelectionGeometry';

export function captureWindowSelectionState(): SelectionState | null {
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed || selection.rangeCount === 0) return null;

  const text = selection.toString().replace(/\s+/g, ' ').trim();
  if (!text) return null;

  const range = selection.getRangeAt(0);
  const startPage = pageElementFor(range.startContainer);
  const endPage = pageElementFor(range.endContainer);

  // Cross-page selections would produce ambiguous page-relative rects.
  if (!startPage || !endPage || startPage !== endPage) return null;

  const pageRect = startPage.getBoundingClientRect();
  if (!pageRect.width || !pageRect.height) return null;

  const lines = mergeSelectionRects(getAccurateSelectionRects(range), pageRect);
  if (lines.length === 0) return null;

  const rects: AnnotationRect[] = lines.map((line) => ({
    xPct: Math.max(0, Math.min(1, (line.left - pageRect.left) / pageRect.width)),
    yPct: Math.max(0, Math.min(1, (line.top - pageRect.top) / pageRect.height)),
    widthPct: Math.max(0.004, Math.min(1, (line.right - line.left) / pageRect.width)),
    heightPct: Math.max(0.004, Math.min(1, (line.bottom - line.top) / pageRect.height)),
  }));

  const firstRect = lines[0];
  const lastRect = lines[lines.length - 1];
  if (!firstRect || !lastRect) return null;
  const selectionTop = firstRect.top;
  const selectionBottom = lastRect.bottom;
  const viewportHeight = window.innerHeight;
  const viewportWidth = window.innerWidth;
  const centerX =
    (Math.min(...lines.map((line) => line.left)) + Math.max(...lines.map((line) => line.right))) / 2;
  const barHeight = 96;
  const hasRoomAbove = selectionTop > barHeight + 22;
  const hasRoomBelow = selectionBottom + barHeight + 22 < viewportHeight;
  const isTop = hasRoomAbove;
  const halfWidth = Math.min(168, (viewportWidth - 16) / 2);
  const x = Math.min(viewportWidth - 8 - halfWidth, Math.max(8 + halfWidth, centerX));
  const rawY = isTop
    ? Math.max(12, selectionTop - 12)
    : hasRoomBelow
      ? selectionBottom + 12
      : Math.max(12, viewportHeight - barHeight - 12);

  return {
    text,
    pageNumber: Number.parseInt(startPage.dataset.pageNumber || '1', 10),
    rects,
    quadPoints: rects.map<AnnotationQuad>((rect) => [
      rect.xPct,
      rect.yPct,
      rect.xPct + rect.widthPct,
      rect.yPct + rect.heightPct,
    ]),
    screenRects: lines.map((line) => ({
      left: line.left,
      top: line.top,
      width: line.right - line.left,
      height: line.bottom - line.top,
    })),
    coords: { x, y: rawY, isTop },
  };
}

export function buildSelectionSignature(state: SelectionState): string {
  return [
    state.pageNumber,
    state.text,
    ...state.rects.map(
      (rect) =>
        `${rect.xPct.toFixed(4)},${rect.yPct.toFixed(4)},${rect.widthPct.toFixed(4)},${rect.heightPct.toFixed(4)}`
    ),
  ].join('|');
}

export function findOverlappingSelectionAnnotation(
  annotations: TextAnnotation[],
  selectionState: SelectionState
): TextAnnotation | undefined {
  return annotations.find(
    (annotation) =>
      annotation.pageNumber === selectionState.pageNumber &&
      (annotation.text.includes(selectionState.text) ||
        selectionState.text.includes(annotation.text) ||
        annotation.rects.some((annotationRect) =>
          selectionState.rects.some(
            (selectionRect) =>
              Math.abs(annotationRect.yPct - selectionRect.yPct) < 0.015 &&
              Math.max(annotationRect.xPct, selectionRect.xPct) <
                Math.min(
                  annotationRect.xPct + annotationRect.widthPct,
                  selectionRect.xPct + selectionRect.widthPct
                )
          )
        ))
  );
}
