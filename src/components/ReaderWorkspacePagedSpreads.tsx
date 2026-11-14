import React from 'react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import type { TextAnnotation, ThemeMode } from '../core/types';
import type { Language } from '../core/i18n/translations';
import { PdfPage } from './PdfPage';
import { PageErrorBoundary } from './PageErrorBoundary';

interface SpreadPageFrameProps {
  doc: PDFDocumentProxy;
  pageNumber: number;
  resetKey: string;
  zoom: number;
  theme: ThemeMode;
  annotations: TextAnnotation[];
  onDeleteAnnotation: (id: string) => void;
  baseAspectRatio: number;
  basePageSize: { width: number; height: number };
  searchQuery: string;
  activeSearchPage: number | null;
  lang: Language;
  renderPriority: number;
}

const SpreadPageFrame: React.FC<SpreadPageFrameProps> = ({
  doc,
  pageNumber,
  resetKey,
  zoom,
  theme,
  annotations,
  onDeleteAnnotation,
  baseAspectRatio,
  basePageSize,
  searchQuery,
  activeSearchPage,
  lang,
  renderPriority,
}) => (
  <PageErrorBoundary
    pageNum={pageNumber}
    width={Math.round(basePageSize.width * zoom)}
    height={Math.round(basePageSize.height * zoom)}
    lang={lang}
    resetKey={resetKey}
  >
    <PdfPage
      doc={doc}
      pageNumber={pageNumber}
      scale={zoom}
      theme={theme}
      annotations={annotations}
      onDeleteAnnotation={onDeleteAnnotation}
      baseAspectRatio={baseAspectRatio}
      searchQuery={searchQuery}
      isCurrentSearchPage={activeSearchPage === pageNumber}
      lang={lang}
      renderPriority={renderPriority}
    />
  </PageErrorBoundary>
);

export interface ReaderWorkspacePagedSpreadsProps {
  viewMode: 'dual' | 'single';
  doc: PDFDocumentProxy;
  numPages: number;
  currentPage: number;
  zoom: number;
  theme: ThemeMode;
  lang: Language;
  baseAspectRatio: number;
  basePageSize: { width: number; height: number };
  annotationsByPage: Map<number, TextAnnotation[]> | null;
  emptyAnnotations: TextAnnotation[];
  deleteAnnotation: (id: string) => void;
  searchQuery: string;
  activeSearchPage: number | null;
  dualFlipKey: number;
  reverseSpread: boolean;
  pagedAnimation: string | undefined;
}

export const ReaderWorkspacePagedSpreads: React.FC<ReaderWorkspacePagedSpreadsProps> = ({
  viewMode,
  doc,
  numPages,
  currentPage,
  zoom,
  theme,
  lang,
  baseAspectRatio,
  basePageSize,
  annotationsByPage,
  emptyAnnotations,
  deleteAnnotation,
  searchQuery,
  activeSearchPage,
  dualFlipKey,
  reverseSpread,
  pagedAnimation,
}) => {
  const annotationsFor = (pageNum: number) =>
    annotationsByPage ? (annotationsByPage.get(pageNum) ?? emptyAnnotations) : emptyAnnotations;

  if (viewMode === 'dual') {
    return (
      <div className="min-h-full w-max min-w-full flex items-start justify-center py-2 sm:py-4 overflow-hidden">
        <div style={{ willChange: 'transform' }}>
          <div
            key={`dual-${dualFlipKey}`}
            className="flex items-center justify-center gap-0 shadow-2xl rounded-sm overflow-hidden"
            style={{
              animation: pagedAnimation,
              willChange: 'transform, opacity',
              flexDirection: reverseSpread ? 'row-reverse' : 'row',
            }}
          >
            <div className={`relative shrink-0 ${reverseSpread ? 'book-gutter-inner-left' : 'book-gutter-inner-right'}`}>
              <SpreadPageFrame
                doc={doc}
                pageNumber={currentPage}
                resetKey={`dual-${currentPage}-${zoom}`}
                zoom={zoom}
                theme={theme}
                annotations={annotationsFor(currentPage)}
                onDeleteAnnotation={deleteAnnotation}
                baseAspectRatio={baseAspectRatio}
                basePageSize={basePageSize}
                searchQuery={searchQuery}
                activeSearchPage={activeSearchPage}
                lang={lang}
                renderPriority={0}
              />
            </div>

            {currentPage + 1 <= numPages ? (
              <div
                className={`relative shrink-0 ${reverseSpread ? 'border-r book-gutter-inner-left' : 'border-l book-gutter-inner-left'} border-line/40`}
              >
                <SpreadPageFrame
                  doc={doc}
                  pageNumber={currentPage + 1}
                  resetKey={`dual-${currentPage + 1}-${zoom}`}
                  zoom={zoom}
                  theme={theme}
                  annotations={annotationsFor(currentPage + 1)}
                  onDeleteAnnotation={deleteAnnotation}
                  baseAspectRatio={baseAspectRatio}
                  basePageSize={basePageSize}
                  searchQuery={searchQuery}
                  activeSearchPage={activeSearchPage}
                  lang={lang}
                  renderPriority={1}
                />
              </div>
            ) : (
              <div
                style={{
                  width: Math.round(basePageSize.width * zoom),
                  height: Math.round(basePageSize.height * zoom),
                }}
                className="hidden sm:flex items-center justify-center border border-dashed border-line rounded-xs text-xs text-ink-faint font-mono"
              >
                {lang === 'ar' ? 'نهاية المستند' : 'End of Document'}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      style={{ willChange: 'transform' }}
      className="min-h-full w-max min-w-full flex items-start justify-center py-2 sm:py-4 overflow-hidden"
    >
      <div
        key={`single-${dualFlipKey}`}
        style={{ animation: pagedAnimation, willChange: 'transform, opacity' }}
      >
        <SpreadPageFrame
          doc={doc}
          pageNumber={currentPage}
          resetKey={`single-${currentPage}-${zoom}`}
          zoom={zoom}
          theme={theme}
          annotations={annotationsFor(currentPage)}
          onDeleteAnnotation={deleteAnnotation}
          baseAspectRatio={baseAspectRatio}
          basePageSize={basePageSize}
          searchQuery={searchQuery}
          activeSearchPage={activeSearchPage}
          lang={lang}
          renderPriority={0}
        />
      </div>
    </div>
  );
};
