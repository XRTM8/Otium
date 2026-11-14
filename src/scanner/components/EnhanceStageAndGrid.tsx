import React from 'react';
import {
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import type { Language } from '../../core/i18n/translations';
import type { ScannedPage } from '../core/types';
import type { SignaturePlacement } from '../core/enhancePdfCompile';
import { EnhanceGridView } from './EnhanceGridView';

export interface EnhanceStageAndGridProps {
  lang: Language;
  isGridView: boolean;
  setIsGridView: (open: boolean) => void;
  pages: ScannedPage[];
  safeIndex: number;
  setCurrentPageIndex: (idx: number) => void;
  selectedPages: Set<string>;
  handleBulkDelete: () => void;
  handleTogglePageSelect: (pageId: string) => void;
  onMovePage: (fromIndex: number, toIndex: number) => void;
  handleStageTouchStart: (e: React.TouchEvent<HTMLDivElement>) => void;
  handleStageTouchMove: (e: React.TouchEvent<HTMLDivElement>) => void;
  handleStageTouchEnd: (event: React.TouchEvent<HTMLDivElement>) => void;
  handleStageTouchCancel: (event: React.TouchEvent<HTMLDivElement>) => void;
  toastMsg: string;
  zoomScale: number;
  resetZoomAndPan: () => void;
  stageContainerRef: React.RefObject<HTMLDivElement | null>;
  panOffset: { x: number; y: number };
  previewImageRef: React.RefObject<HTMLImageElement | null>;
  previewSource: string;
  isRedacting: boolean;
  redactionPointsRef: React.MutableRefObject<{ x: number; y: number }[]>;
  redactionLiveStrRef: React.MutableRefObject<string>;
  redactionSvgRectRef: React.MutableRefObject<DOMRect | null>;
  redactionPolylineRef: React.RefObject<SVGPolylineElement | null>;
  redactionStrokes: { x: number; y: number }[][];
  redactionDraftInit: string | null;
  setRedactionDraftInit: (draft: string | null) => void;
  setRedactionStrokes: React.Dispatch<React.SetStateAction<{ x: number; y: number }[][]>>;
  currentPage: ScannedPage;
  signatures: Record<string, SignaturePlacement>;
  setSignatures: React.Dispatch<React.SetStateAction<Record<string, SignaturePlacement>>>;
  pdfGenerating: boolean;
  ocrStatus: string;
  triggerHaptic: (duration?: number) => void;
}

export const EnhanceStageAndGrid: React.FC<EnhanceStageAndGridProps> = ({
  lang,
  isGridView,
  setIsGridView,
  pages,
  safeIndex,
  setCurrentPageIndex,
  selectedPages,
  handleBulkDelete,
  handleTogglePageSelect,
  onMovePage,
  handleStageTouchStart,
  handleStageTouchMove,
  handleStageTouchEnd,
  handleStageTouchCancel,
  toastMsg,
  zoomScale,
  resetZoomAndPan,
  stageContainerRef,
  panOffset,
  previewImageRef,
  previewSource,
  isRedacting,
  redactionPointsRef,
  redactionLiveStrRef,
  redactionSvgRectRef,
  redactionPolylineRef,
  redactionStrokes,
  redactionDraftInit,
  setRedactionDraftInit,
  setRedactionStrokes,
  currentPage,
  signatures,
  setSignatures,
  pdfGenerating,
  ocrStatus,
  triggerHaptic,
}) => {
  const [previewBounds, setPreviewBounds] = React.useState({ x: 0, y: 0, width: 0, height: 0 });
  React.useEffect(() => {
    const preview = previewImageRef.current;
    if (isGridView || !preview) return;
    const update = () => setPreviewBounds({
      x: preview.offsetLeft, y: preview.offsetTop, width: preview.clientWidth, height: preview.clientHeight,
    });
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(update);
    observer.observe(preview);
    if (preview.offsetParent) observer.observe(preview.offsetParent);
    return () => observer.disconnect();
  }, [isGridView, previewImageRef]);

  if (isGridView) {
    return (
      <EnhanceGridView
        lang={lang}
        pages={pages}
        safeIndex={safeIndex}
        selectedPages={selectedPages}
        setIsGridView={setIsGridView}
        setCurrentPageIndex={setCurrentPageIndex}
        handleBulkDelete={handleBulkDelete}
        handleTogglePageSelect={handleTogglePageSelect}
        onMovePage={onMovePage}
      />
    );
  }

  const projectStroke = ({ x, y }: { x: number; y: number }) =>
    `${previewBounds.x + x * previewBounds.width},${previewBounds.y + y * previewBounds.height}`;
  return (
    <div
      onTouchStart={handleStageTouchStart}
      onTouchMove={handleStageTouchMove}
      onTouchEnd={handleStageTouchEnd}
      onTouchCancel={handleStageTouchCancel}
      className="relative flex-1 w-full h-full flex items-center justify-center p-4 overflow-hidden touch-none"
    >
      {zoomScale > 1.05 && (
        <div className="absolute top-2 inset-x-0 flex justify-center z-40 pointer-events-auto animate-in fade-in duration-150">
          <button
            onClick={() => {
              triggerHaptic(10);
              resetZoomAndPan();
            }}
            className="px-3.5 py-1 rounded-full bg-black/85 backdrop-blur-md border border-accent/50 text-accent text-xs font-bold shadow-2xl flex items-center gap-1.5 active:scale-95 transition-transform"
          >
            <span>{Math.round(zoomScale * 100)}%</span>
            <span className="text-[10px] text-gray-300 font-arabic font-normal">{lang === 'ar' ? 'إعادة التكبير' : 'Reset zoom'}</span>
          </button>
        </div>
      )}

      {toastMsg && (
        <div className="absolute top-4 inset-x-0 flex justify-center z-40 pointer-events-none animate-in fade-in duration-200">
          <span className="px-4 py-1.5 rounded-full bg-accent text-on-accent font-semibold text-xs shadow-2xl flex items-center gap-1.5 border border-white/20">
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>{toastMsg}</span>
          </span>
        </div>
      )}

      <div
        ref={stageContainerRef}
        style={{
          transform: `translateX(0px) translate(${panOffset.x}px, ${panOffset.y}px) scale(${zoomScale})`,
          transition: zoomScale > 1.05 ? 'none' : 'transform 0.22s cubic-bezier(0.16, 1, 0.3, 1)',
        }}
        className="relative w-full h-full max-h-[64vh] flex items-center justify-center select-none will-change-transform"
      >
        <img
          ref={previewImageRef}
          src={previewSource}
          alt={`Page ${safeIndex + 1}`}
          className="max-w-full max-h-full object-contain rounded-xl shadow-2xl pointer-events-none"
        />

        {isRedacting && (
          <svg
            onPointerDown={(e) => {
              e.preventDefault();
              try {
                e.currentTarget.setPointerCapture(e.pointerId);
              } catch (err) {
                console.debug('[EnhanceStage] setPointerCapture skipped:', err);
              }
              const rect = previewImageRef.current?.getBoundingClientRect();
              if (!rect || rect.width <= 0 || rect.height <= 0 || e.clientX < rect.left || e.clientX > rect.right || e.clientY < rect.top || e.clientY > rect.bottom) return;
              redactionSvgRectRef.current = rect;
              const pt = { x: (e.clientX - rect.left) / rect.width, y: (e.clientY - rect.top) / rect.height };
              const overlay = e.currentTarget.getBoundingClientRect();
              const local = `${(e.clientX - overlay.left) / zoomScale},${(e.clientY - overlay.top) / zoomScale}`;
              const initStr = `${local} ${local}`;
              redactionPointsRef.current = [pt];
              redactionLiveStrRef.current = initStr;
              setRedactionDraftInit(initStr);
            }}
            onPointerMove={(e) => {
              if (redactionPointsRef.current.length === 0) return;
              const rect = redactionSvgRectRef.current;
              if (!rect) return;
              const pt = { x: (e.clientX - rect.left) / rect.width, y: (e.clientY - rect.top) / rect.height };
              redactionPointsRef.current.push(pt);
              const overlay = e.currentTarget.getBoundingClientRect();
              redactionLiveStrRef.current += ` ${(e.clientX - overlay.left) / zoomScale},${(e.clientY - overlay.top) / zoomScale}`;
              redactionPolylineRef.current?.setAttribute('points', redactionLiveStrRef.current);
            }}
            onPointerUp={(e) => {
              try {
                e.currentTarget.releasePointerCapture(e.pointerId);
              } catch (err) {
                console.debug('[EnhanceStage] releasePointerCapture skipped:', err);
              }
              const pts = redactionPointsRef.current;
              redactionPointsRef.current = [];
              redactionLiveStrRef.current = '';
              redactionSvgRectRef.current = null;
              setRedactionDraftInit(null);
              if (pts.length > 0) {
                setRedactionStrokes((prev) => [...prev, pts]);
              }
            }}
            onPointerCancel={() => {
              redactionPointsRef.current = [];
              redactionLiveStrRef.current = '';
              redactionSvgRectRef.current = null;
              setRedactionDraftInit(null);
            }}
            className="absolute inset-0 w-full h-full z-30 touch-none cursor-crosshair bg-black/5"
          >
            {redactionStrokes.map((stroke) => {
              const first = stroke[0];
              const last = stroke[stroke.length - 1];
              const strokeKey = `${stroke.length}-${first?.x ?? 0}-${first?.y ?? 0}-${last?.x ?? 0}-${last?.y ?? 0}`;
              return (
                <polyline
                  key={strokeKey}
                  points={stroke.map(projectStroke).join(' ')}
                  fill="none"
                  stroke="#000000"
                  strokeWidth="18"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              );
            })}
            {redactionDraftInit !== null && (
              <polyline
                ref={redactionPolylineRef}
                points={redactionDraftInit}
                fill="none"
                stroke="#000000"
                strokeWidth="18"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            )}
          </svg>
        )}

        {!isRedacting && redactionStrokes.length > 0 && (
          <svg className="absolute inset-0 w-full h-full z-20 pointer-events-none">
            {redactionStrokes.map((stroke) => {
              const first = stroke[0];
              const last = stroke[stroke.length - 1];
              const strokeKey = `${stroke.length}-${first?.x ?? 0}-${first?.y ?? 0}-${last?.x ?? 0}-${last?.y ?? 0}`;
              return (
                <polyline
                  key={strokeKey}
                  points={stroke.map(projectStroke).join(' ')}
                  fill="none"
                  stroke="#000000"
                  strokeWidth="18"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              );
            })}
          </svg>
        )}

        {(() => {
          const activeSig = currentPage ? signatures[currentPage.id] : undefined;
          if (!currentPage || !activeSig) return null;
          return (
            <div
              style={{
                left: `${activeSig.x * 100}%`,
                top: `${activeSig.y * 100}%`,
              }}
              className="absolute z-20 w-32 -translate-x-1/2 -translate-y-1/2 p-1.5 border-2 border-dashed border-accent bg-accent/10 rounded-xl shadow-2xl flex items-center justify-center group"
            >
              <img
                src={activeSig.dataUrl}
                alt="Signature"
                className="w-full h-auto object-contain pointer-events-none"
              />
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  triggerHaptic(10);
                  setSignatures((prev) => {
                    const next = { ...prev };
                    delete next[currentPage.id];
                    return next;
                  });
                }}
                className="absolute -top-2.5 -right-2.5 w-5 h-5 rounded-full bg-red-500 text-white flex items-center justify-center text-xs font-bold shadow-md active:scale-90"
                title="Remove signature"
              >
                ✕
              </button>
            </div>
          );
        })()}

        {pdfGenerating && (
          <div className="absolute inset-0 bg-black/80 backdrop-blur-sm flex flex-col items-center justify-center p-6 text-center z-30">
            <div className="w-10 h-10 border-4 border-accent border-t-transparent rounded-full animate-spin mb-3" />
            <p className="text-sm font-semibold text-white">{ocrStatus || (lang === 'ar' ? 'جارٍ تجهيز PDF…' : 'Preparing PDF…')}</p>
          </div>
        )}
      </div>

      {safeIndex > 0 && (
        <button
          onClick={() => {
            triggerHaptic(10);
            setCurrentPageIndex(safeIndex - 1);
          }}
          className="absolute left-3 p-2.5 rounded-full glass-button text-white active:scale-90 shadow-xl z-20"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
      )}

      {safeIndex < pages.length - 1 && (
        <button
          onClick={() => {
            triggerHaptic(10);
            setCurrentPageIndex(safeIndex + 1);
          }}
          className="absolute right-3 p-2.5 rounded-full glass-button text-white active:scale-90 shadow-xl z-20"
        >
          <ChevronRight className="w-5 h-5" />
        </button>
      )}
    </div>
  );
};
