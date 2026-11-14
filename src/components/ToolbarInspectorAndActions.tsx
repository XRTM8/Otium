import React from 'react';
import { Check, Edit2, X } from 'lucide-react';
import type { ThemeMode } from '../core/types';
import type { getTranslations } from '../core/i18n/translations';

export { ToolbarThemeAndActions } from './ToolbarThemeAndActions';

interface ToolbarDocumentInspectorProps {
  title: string;
  currentPage: number;
  totalPages: number;
  zoom: number;
  theme: ThemeMode;
  ar: boolean;
  t: ReturnType<typeof getTranslations>;
  showInspector: boolean;
  isRenaming: boolean;
  renameText: string;
  fileSizeBytes?: number;
  pageDimensions?: { width: number; height: number };
  annotationsCount?: number;
  bookmarksCount?: number;
  onToggleInspector: () => void;
  onCloseInspector: () => void;
  onStartRenaming: () => void;
  onStopRenaming: () => void;
  onRenameTextChange: (value: string) => void;
  onRenameTitle?: (newTitle: string) => void;
}

export const ToolbarDocumentInspector: React.FC<ToolbarDocumentInspectorProps> = ({
  title,
  currentPage,
  totalPages,
  zoom,
  theme,
  ar,
  t,
  showInspector,
  isRenaming,
  renameText,
  fileSizeBytes,
  pageDimensions,
  annotationsCount,
  bookmarksCount,
  onToggleInspector,
  onCloseInspector,
  onStartRenaming,
  onStopRenaming,
  onRenameTextChange,
  onRenameTitle,
}) => (
  <div className="relative hidden sm:block">
    <button
      type="button"
      onClick={onToggleInspector}
      title={ar ? 'معلومات المستند والتقدم' : 'Document Info & Progress'}
      dir="auto"
      className={`max-w-[100px] md:max-w-[160px] xl:max-w-[220px] shrink-0 truncate rounded-lg px-2 py-1 text-xs font-medium transition-all cursor-pointer ${
        showInspector
          ? 'bg-hover text-ink font-semibold'
          : 'text-ink-muted hover:bg-hover-subtle hover:text-ink'
      }`}
    >
      <bdi>{title}</bdi>
    </button>

    {showInspector && (
      <>
        <div className="fixed inset-0 z-40" onClick={onCloseInspector} />
        <div
          dir={ar ? 'rtl' : 'ltr'}
          className="chrome-surface absolute start-0 top-full z-50 mt-2 w-64 rounded-2xl p-3.5 text-ink shadow-2xl fluid-pop select-none text-start"
        >
          <div className="flex items-start justify-between gap-2 border-b border-line pb-2.5">
            <div className="min-w-0 flex-1">
              <div className={`text-[10px] uppercase text-ink-faint ${ar ? 'font-sans' : 'font-mono tracking-wider'}`}>
                {ar ? 'المستند الحالي' : 'Current Document'}
              </div>
              {isRenaming ? (
                <div className="flex items-center gap-1 mt-1">
                  <input
                    type="text"
                    value={renameText}
                    onChange={(e) => onRenameTextChange(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        if (renameText.trim() && onRenameTitle) {
                          onRenameTitle(renameText.trim());
                        }
                        onStopRenaming();
                      } else if (e.key === 'Escape') {
                        e.preventDefault();
                        e.stopPropagation();
                        onRenameTextChange(title);
                        onStopRenaming();
                      }
                    }}
                    autoFocus
                    className="w-full text-xs font-medium text-ink bg-hover px-1.5 py-0.5 rounded outline-none border border-line-strong"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      if (renameText.trim() && onRenameTitle) {
                        onRenameTitle(renameText.trim());
                      }
                      onStopRenaming();
                    }}
                    className="toolbar-icon h-5 w-5 text-accent shrink-0"
                    title={ar ? 'حفظ الاسم' : 'Save name'}
                  >
                    <Check className="w-3 h-3" />
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-1 mt-0.5 group">
                  <span className="truncate font-semibold text-xs text-ink" title={title}>
                    <bdi>{title}</bdi>
                  </span>
                  {onRenameTitle && (
                    <button
                      type="button"
                      onClick={onStartRenaming}
                      className="opacity-50 hover:opacity-100 p-0.5 text-ink-muted hover:text-ink shrink-0"
                      title={ar ? 'إعادة تسمية العرض' : 'Rename title'}
                    >
                      <Edit2 className="w-2.5 h-2.5" />
                    </button>
                  )}
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={onCloseInspector}
              className="toolbar-icon h-6 w-6 shrink-0"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="mt-2.5 space-y-2 text-[11px] font-mono">
            <div className="flex items-center justify-between text-ink-muted">
              <span className="font-sans font-medium">{ar ? 'تقدّم القراءة:' : 'Progress:'}</span>
              <span className="text-accent font-semibold">
                {Math.min(100, Math.round((currentPage / Math.max(1, totalPages)) * 100))}%
              </span>
            </div>

            <div className="h-1.5 w-full overflow-hidden rounded-full bg-hover">
              <div
                className="h-full bg-accent transition-all duration-300 rounded-full"
                style={{ width: `${Math.min(100, Math.round((currentPage / Math.max(1, totalPages)) * 100))}%` }}
              />
            </div>

            <div className="flex items-center justify-between text-ink-muted pt-1">
              <span className="font-sans">{ar ? 'الصفحات:' : 'Pages:'}</span>
              <span>{currentPage} / {totalPages}</span>
            </div>

            {fileSizeBytes ? (
              <div className="flex items-center justify-between text-ink-muted">
                <span className="font-sans">{ar ? 'حجم الملف:' : 'File size:'}</span>
                <span dir="ltr">
                  {fileSizeBytes < 1024 * 1024
                    ? `${Math.round(fileSizeBytes / 1024)} KB`
                    : `${(fileSizeBytes / (1024 * 1024)).toFixed(1)} MB`}
                </span>
              </div>
            ) : null}

            {pageDimensions ? (
              <div className="flex items-center justify-between text-ink-muted">
                <span className="font-sans">{ar ? 'أبعاد الصفحة:' : 'Dimensions:'}</span>
                <span dir="ltr">{Math.round(pageDimensions.width)} × {Math.round(pageDimensions.height)} pt</span>
              </div>
            ) : null}

            {typeof annotationsCount === 'number' ? (
              <div className="flex items-center justify-between text-ink-muted">
                <span className="font-sans">{ar ? 'الملاحظات والتظليلات:' : 'Notes & Highlights:'}</span>
                <span>{annotationsCount}</span>
              </div>
            ) : null}

            {typeof bookmarksCount === 'number' ? (
              <div className="flex items-center justify-between text-ink-muted">
                <span className="font-sans">{ar ? 'الإشارات المرجعية:' : 'Bookmarks:'}</span>
                <span>{bookmarksCount}</span>
              </div>
            ) : null}

            <div className="flex items-center justify-between text-ink-muted">
              <span className="font-sans">{ar ? 'نسبة العرض:' : 'Zoom:'}</span>
              <span>{Math.round(zoom * 100)}%</span>
            </div>

            <div className="flex items-center justify-between text-ink-muted">
              <span className="font-sans">{ar ? 'الثيم النشط:' : 'Theme:'}</span>
              <span className="font-sans">{t.themes[theme]}</span>
            </div>
          </div>
        </div>
      </>
    )}
  </div>
);
