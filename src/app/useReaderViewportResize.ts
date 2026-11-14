import { useEffectEvent, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import type { ViewMode } from '../core/types';
import { READER_READING_LINE } from '../core/reader/readingPosition';

interface ReadingPosition {
  page: number;
  x: number;
  y: number;
}

interface ResizeOptions {
  doc: PDFDocumentProxy | null;
  viewMode: ViewMode;
  currentPage: number;
  scrollContainerRef: RefObject<HTMLDivElement | null>;
  zoom: number;
  refitViewport: () => void;
}

function pageElement(container: HTMLDivElement, page: number, viewMode: ViewMode) {
  return viewMode === 'continuous'
    ? container.querySelector<HTMLElement>(`[data-page-slot="${page}"]`)
    : container.querySelector<HTMLElement>(`[data-pdf-page="${page}"]`);
}

const clampFraction = (value: number) => Math.max(0, Math.min(1, value));

function readPosition(container: HTMLDivElement, page: number, viewMode: ViewMode): ReadingPosition | null {
  const rect = pageElement(container, page, viewMode)?.getBoundingClientRect();
  if (!rect?.width || !rect.height) return null;
  const viewport = container.getBoundingClientRect();
  return {
    page,
    x: clampFraction((viewport.left + container.clientWidth / 2 - rect.left) / rect.width),
    y: clampFraction((viewport.top + container.clientHeight * READER_READING_LINE - rect.top) / rect.height),
  };
}

export function useReaderViewportResize({
  doc, viewMode, currentPage, scrollContainerRef, zoom, refitViewport,
}: ResizeOptions) {
  const resizingRef = useRef(false);
  const lastPositionRef = useRef<ReadingPosition | null>(null);
  const pageRef = useRef(currentPage);
  const sizeRef = useRef({ width: 0, height: 0 });
  const [restorePosition, setRestorePosition] = useState<ReadingPosition | null>(null);
  const refit = useEffectEvent(refitViewport);

  useLayoutEffect(() => {
    const container = scrollContainerRef.current;
    if (!doc || !container) return;
    const recordPosition = () => {
      if (resizingRef.current || sizeRef.current.width !== container.clientWidth ||
        sizeRef.current.height !== container.clientHeight) return;
      lastPositionRef.current = readPosition(container, pageRef.current, viewMode);
    };
    let sampleFrame = 0;
    const sampleAfterScroll = () => {
      if (sampleFrame) return;
      sampleFrame = requestAnimationFrame(() => {
        sampleFrame = 0;
        recordPosition();
      });
    };
    let refitTimer = 0;
    let releaseFrame = 0;
    let position: ReadingPosition | null = null;
    const finish = () => {
      resizingRef.current = false;
      position = null;
      delete container.dataset.readerResizing;
      recordPosition();
    };
    const resize = () => {
      if (container.closest('[data-board-resizing="true"]')) return;
      const width = container.clientWidth;
      const height = container.clientHeight;
      if (!width || !height || (width === sizeRef.current.width && height === sizeRef.current.height)) return;
      if (!resizingRef.current) position = lastPositionRef.current;
      resizingRef.current = true;
      container.dataset.readerResizing = 'true';
      sizeRef.current = { width, height };
      window.clearTimeout(refitTimer);
      cancelAnimationFrame(releaseFrame);
      refitTimer = window.setTimeout(() => {
        refit();
        setRestorePosition(position && { ...position });
        // Keep scroll events from the refit from selecting or saving another page.
        releaseFrame = requestAnimationFrame(() => {
          releaseFrame = requestAnimationFrame(finish);
        });
      }, 80);
    };

    sizeRef.current = { width: container.clientWidth, height: container.clientHeight };
    if (sizeRef.current.width && sizeRef.current.height) refit();
    recordPosition();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(resize);
    observer?.observe(container);
    container.addEventListener('scroll', sampleAfterScroll, { passive: true });
    window.addEventListener('resize', resize);
    window.addEventListener('orientationchange', resize);
    return () => {
      observer?.disconnect();
      container.removeEventListener('scroll', sampleAfterScroll);
      window.removeEventListener('resize', resize);
      window.removeEventListener('orientationchange', resize);
      window.clearTimeout(refitTimer);
      cancelAnimationFrame(releaseFrame);
      cancelAnimationFrame(sampleFrame);
      resizingRef.current = false;
      delete container.dataset.readerResizing;
      lastPositionRef.current = null;
    };
  }, [doc, viewMode, scrollContainerRef]);

  useLayoutEffect(() => {
    pageRef.current = currentPage;
    const container = scrollContainerRef.current;
    if (!doc || !container) return;
    if (zoom <= 0) return;
    if (!resizingRef.current) {
      lastPositionRef.current = readPosition(container, currentPage, viewMode);
      return;
    }
    if (restorePosition?.page !== currentPage) return;
    const page = pageElement(container, currentPage, viewMode)?.getBoundingClientRect();
    if (!page?.width || !page.height) return;
    const viewport = container.getBoundingClientRect();
    const centerX = viewport.left + container.clientWidth / 2;
    const readingY = viewport.top + container.clientHeight * READER_READING_LINE;
    container.scrollBy({
      left: page.left + restorePosition.x * page.width - centerX,
      top: page.top + restorePosition.y * page.height - readingY,
      behavior: 'instant',
    });
  }, [currentPage, doc, restorePosition, scrollContainerRef, viewMode, zoom]);

  return resizingRef;
}
