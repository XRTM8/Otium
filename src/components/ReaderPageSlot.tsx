import React from 'react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import type { TextAnnotation, ThemeMode } from '../core/types';
import type { Language } from '../core/i18n/translations';
import { PdfPage } from './PdfPage';
import { PageErrorBoundary } from './PageErrorBoundary';

export interface PageSlotProps {
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
  renderPriority: number;
}

const PageSlotView: React.FC<PageSlotProps> = ({
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
  renderPriority
}) => {
  const standardWidth = Math.round(basePageWidth * scale);
  const standardHeight = Math.round(basePageHeight * scale);

  return (
    <div
      id={`pdf-page-${pageNum}`}
      dir="ltr"
      data-page-slot={pageNum}
      style={{
        width: `${standardWidth}px`,
        height: `${standardHeight}px`,
        contain: 'layout paint'
      }}
      className="pdf-page-frame my-4 sm:my-5 mx-auto flex items-center justify-center"
    >
      {isNear ? (
        <PageErrorBoundary
          pageNum={pageNum}
          width={standardWidth}
          height={standardHeight}
          lang={lang}
          resetKey={`${pageNum}-${scale}`}
          includeErrorDetail
        >
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
            renderPriority={renderPriority}
          />
        </PageErrorBoundary>
      ) : (
        <div
          style={{ width: `${standardWidth}px`, height: `${standardHeight}px` }}
          className="flex items-center justify-center rounded-sm border border-dashed border-line-subtle bg-hover-subtle font-mono text-xs opacity-25 select-none"
        >
          <span>{lang === 'ar' ? `صفحة ${pageNum}` : `Page ${pageNum}`}</span>
        </div>
      )}
    </div>
  );
};

export const PageSlot = React.memo(PageSlotView);
