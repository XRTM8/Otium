import React, { useEffect, useRef } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import type { TextAnnotation, ThemeMode } from '../core/types';
import type { Language } from '../core/i18n/translations';
import type { ReaderController } from '../app/useReaderController';
import { PdfPage } from './PdfPage';

interface PageSlotProps {
  pageNum: number;
  isNear: boolean;
  doc: PDFDocumentProxy;
  scale: number;
  theme: ThemeMode;
  annotations: TextAnnotation[];
  onDeleteAnnotation: (id: string) => void;
  baseAspectRatio: number;
  basePageWidth?: number;
  basePageHeight?: number;
  searchQuery?: string;
  isCurrentSearchPage?: boolean;
  lang: Language;
  onPageVisible: (num: number) => void;
}

const PageSlot: React.FC<PageSlotProps> = ({
  pageNum,
  isNear,
  doc,
  scale,
  theme,
  annotations,
  onDeleteAnnotation,
  baseAspectRatio,
  basePageWidth = 595,
  basePageHeight = 842,
  searchQuery,
  isCurrentSearchPage,
  lang,
  onPageVisible
}) => {
  const slotRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = slotRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          onPageVisible(pageNum);
        }
      },
      { rootMargin: '400px 0px 400px 0px', threshold: 0.01 }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [pageNum, onPageVisible]);

  const standardWidth = Math.round(basePageWidth * scale);
  const standardHeight = Math.round(basePageHeight * scale);

  return (
    <div
      ref={slotRef}
      id={`pdf-page-${pageNum}`}
      dir="ltr"
      style={{
        width: `${standardWidth}px`,
        height: `${standardHeight}px`,
        contentVisibility: 'auto',
        containIntrinsicSize: `${standardWidth}px ${standardHeight}px`,
        contain: 'layout paint'
      }}
      className="my-4 sm:my-5 mx-auto flex items-center justify-center transform-gpu"
    >
      {isNear ? (
        <PdfPage
          doc={doc}
          pageNumber={pageNum}
          scale={scale}
          theme={theme}
          annotations={annotations}
          onDeleteAnnotation={onDeleteAnnotation}
          baseAspectRatio={baseAspectRatio}
          searchQuery={searchQuery}
          isCurrentSearchPage={isCurrentSearchPage}
          lang={lang}
          onPageVisible={onPageVisible}
        />
      ) : (
        <div
          style={{ width: `${standardWidth}px`, height: `${standardHeight}px` }}
          className="rounded-sm border border-dashed border-line-subtle bg-hover-subtle dark:bg-hover-subtle flex items-center justify-center font-mono text-xs opacity-20 select-none shadow-xs"
        >
          <span>{lang === 'ar' ? `صفحة ${pageNum}` : `Page ${pageNum}`}</span>
        </div>
      )}
    </div>
  );
};

interface ReaderWorkspaceProps {
  reader: ReaderController;
  compact?: boolean;
}

/**
 * The reading surface shared by both shells. It knows about pages, gestures and
 * view modes, but nothing about desktop toolbars or Android navigation.
 */
export const ReaderWorkspace: React.FC<ReaderWorkspaceProps> = ({ reader, compact = false }) => {
  const {
    doc,
    numPages,
    currentPage,
    zoom,
    theme,
    viewMode,
    lang,
    baseAspectRatio,
    basePageSize,
    annotations,
    deleteAnnotation,
    searchQuery,
    activeSearchPage,
    handlePageVisible,
    goToNextPage,
    goToPrevPage,
    scrollContainerRef,
    handleWheel,
    handleTouchStart,
    handleTouchMove,
    handleTouchEnd,
    touchDeltaX,
    isDraggingTouch,
    dualFlipKey,
    dualFlipDir
  } = reader;

  if (!doc) return null;

  return (
    <div
      ref={scrollContainerRef}
      onWheel={handleWheel}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      style={{
        paddingTop: compact
          ? 'max(4.1rem, calc(env(safe-area-inset-top, 0px) + 3.6rem))'
          : 'max(4.5rem, calc(env(safe-area-inset-top, 0px) + 4.2rem))',
        paddingBottom: compact
          ? 'max(5.5rem, calc(env(safe-area-inset-bottom, 0px) + 5rem))'
          : undefined,
        touchAction: 'pan-x pan-y pinch-zoom'
      }}
      className="flex-1 w-full h-full overflow-y-auto overflow-x-auto pb-20 sm:pb-24 px-2 sm:px-4 relative"
    >
      {/* Reading progress for the current document. */}
      <div className="fixed top-0 inset-x-0 h-[2px] bg-line dark:bg-hover z-40 pointer-events-none">
        <div
          className="h-full bg-accent transition-all duration-300"
          style={{ width: `${(currentPage / Math.max(1, numPages)) * 100}%` }}
        />
      </div>

      {(viewMode === 'single' || viewMode === 'dual') && (
        <>
          <button
            type="button"
            onClick={goToPrevPage}
            disabled={currentPage <= 1}
            title={lang === 'ar' ? 'الصفحة السابقة' : 'Previous page'}
            aria-label={lang === 'ar' ? 'الصفحة السابقة' : 'Previous page'}
            className="fixed left-2 sm:left-5 top-1/2 -translate-y-1/2 z-30 p-2 sm:p-2.5 rounded-full bg-surface/60 hover:bg-surface text-ink backdrop-blur-md opacity-25 hover:opacity-100 disabled:opacity-0 transition-all cursor-pointer shadow-xl border border-line"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <button
            type="button"
            onClick={goToNextPage}
            disabled={currentPage >= numPages}
            title={lang === 'ar' ? 'الصفحة التالية' : 'Next page'}
            aria-label={lang === 'ar' ? 'الصفحة التالية' : 'Next page'}
            className="fixed right-2 sm:right-5 top-1/2 -translate-y-1/2 z-30 p-2 sm:p-2.5 rounded-full bg-surface/60 hover:bg-surface text-ink backdrop-blur-md opacity-25 hover:opacity-100 disabled:opacity-0 transition-all cursor-pointer shadow-xl border border-line"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </>
      )}

      {viewMode === 'continuous' ? (
        <div className="flex flex-col items-center">
          {Array.from({ length: numPages }, (_, index) => index + 1).map((pageNum) => (
            <PageSlot
              key={pageNum}
              pageNum={pageNum}
              isNear={Math.abs(pageNum - currentPage) <= 4}
              doc={doc}
              scale={zoom}
              theme={theme}
              annotations={annotations}
              onDeleteAnnotation={deleteAnnotation}
              baseAspectRatio={baseAspectRatio}
              basePageWidth={basePageSize.width}
              basePageHeight={basePageSize.height}
              searchQuery={searchQuery}
              isCurrentSearchPage={activeSearchPage === pageNum}
              lang={lang}
              onPageVisible={handlePageVisible}
            />
          ))}
        </div>
      ) : viewMode === 'dual' ? (
        <div className="min-h-full flex items-center justify-center py-2 sm:py-4 overflow-hidden">
          <div
            key={dualFlipKey}
            className="flex flex-row items-center justify-center gap-1 sm:gap-2 shadow-2xl"
            style={{
              transform:
                isDraggingTouch && touchDeltaX !== 0 ? `translateX(${touchDeltaX}px)` : undefined,
              animation:
                !isDraggingTouch && dualFlipKey > 0
                  ? `dualPageFlip${dualFlipDir === 'forward' ? 'Forward' : 'Backward'} 280ms cubic-bezier(0.16, 1, 0.3, 1) both`
                  : undefined
            }}
          >
            <div className="relative">
              <PdfPage
                key={`dual-page-${currentPage}`}
                doc={doc}
                pageNumber={currentPage}
                scale={zoom}
                theme={theme}
                annotations={annotations}
                onDeleteAnnotation={deleteAnnotation}
                baseAspectRatio={baseAspectRatio}
                searchQuery={searchQuery}
                isCurrentSearchPage={activeSearchPage === currentPage}
                lang={lang}
              />
            </div>

            {currentPage + 1 <= numPages ? (
              <div className="relative border-l border-line">
                <PdfPage
                  key={`dual-page-${currentPage + 1}`}
                  doc={doc}
                  pageNumber={currentPage + 1}
                  scale={zoom}
                  theme={theme}
                  annotations={annotations}
                  onDeleteAnnotation={deleteAnnotation}
                  baseAspectRatio={baseAspectRatio}
                  searchQuery={searchQuery}
                  isCurrentSearchPage={activeSearchPage === currentPage + 1}
                  lang={lang}
                />
              </div>
            ) : (
              <div
                style={{
                  width: Math.round(basePageSize.width * zoom),
                  height: Math.round(basePageSize.height * zoom)
                }}
                className="hidden sm:flex items-center justify-center border border-dashed border-line rounded-xs text-xs text-ink-faint font-mono"
              >
                {lang === 'ar' ? 'نهاية المستند' : 'End of Document'}
              </div>
            )}
          </div>
        </div>
      ) : (
        <div
          style={{
            transform:
              isDraggingTouch && touchDeltaX !== 0 ? `translateX(${touchDeltaX}px)` : undefined
          }}
          className="min-h-full flex items-center justify-center py-2 sm:py-4"
        >
          <PdfPage
            key={`single-page-${currentPage}`}
            doc={doc}
            pageNumber={currentPage}
            scale={zoom}
            theme={theme}
            annotations={annotations}
            onDeleteAnnotation={deleteAnnotation}
            baseAspectRatio={baseAspectRatio}
            searchQuery={searchQuery}
            isCurrentSearchPage={activeSearchPage === currentPage}
            lang={lang}
          />
        </div>
      )}
    </div>
  );
};
