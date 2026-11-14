import React, { useEffect, useState, useRef } from 'react';
import type { ThemeMode } from '../../core/types';
import type { Language } from '../../core/i18n/translations';
import type { LibraryDocument } from '../core/storage/documentLibrary';
import {
  getAllLibraryDocuments,
  deleteDocumentFromLibrary,
  exportVaultBackup,
  restoreVaultBackup,
} from '../core/storage/documentLibrary';
import type { DocumentCategory } from '../core/types';
import { nativeSharePdf, nativeSavePdf, nativeOpenInOtium } from '../core/nativeBridge';
import { LibraryDocumentCard } from './LibraryDocumentCard';
import { LibraryHeaderBar } from './LibraryHeaderBar';
import { OtiumLogo } from './OtiumLogo';
import {
  Search,
  CheckCircle2,
  Camera,
} from 'lucide-react';

interface LibraryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenSettings?: () => void;
  onOpenDocument?: (doc: LibraryDocument) => void;
  theme?: ThemeMode;
  lang?: Language;
}

export const LibraryModal: React.FC<LibraryModalProps> = ({
  isOpen,
  onClose,
  onOpenSettings,
  onOpenDocument,
  theme = 'paper',
  lang = 'ar',
}) => {
  const [documents, setDocuments] = useState<LibraryDocument[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<DocumentCategory>('all');

  const [toastMsg, setToastMsg] = useState<string>('');
  const backupInputRef = useRef<HTMLInputElement>(null);

  const triggerHaptic = (duration = 15) => {
    if ('vibrate' in navigator) {
      try {
        navigator.vibrate(duration);
      } catch (err) {
        console.debug('[LibraryModal] Haptic vibrate skipped:', err);
      }
    }
  };

  const loadDocs = async () => {
    try {
      const docs = await getAllLibraryDocuments();
      setDocuments(docs);
    } catch (e) {
      console.warn('Failed to load library:', e);
    }
  };

  useEffect(() => {
    if (!isOpen) return;
    let active = true;
    void getAllLibraryDocuments()
      .then((docs) => {
        if (active) setDocuments(docs);
      })
      .catch((e) => {
        console.warn('Failed to load library:', e);
      });
    return () => {
      active = false;
    };
  }, [isOpen]);

  const handleDelete = async (id: string) => {
    triggerHaptic(15);
    await deleteDocumentFromLibrary(id);
    setDocuments((prev) => prev.filter((d) => d.id !== id));
  };

  const handleShare = async (doc: LibraryDocument) => {
    triggerHaptic(15);
    await nativeSharePdf(doc.pdfBlob, `${doc.title}.pdf`, doc.title);
  };

  const handleSaveToDownloads = async (doc: LibraryDocument) => {
    triggerHaptic(15);
    const saved = await nativeSavePdf(doc.pdfBlob, `${doc.title}.pdf`);
    setToastMsg(saved
      ? (lang === 'ar' ? 'حُفظ المستند في التنزيلات' : 'Document saved to Downloads')
      : (lang === 'ar' ? 'تعذّر حفظ المستند' : 'Could not save the document'));
    setTimeout(() => setToastMsg(''), 2200);
  };

  const handleOpenInOtium = async (doc: LibraryDocument) => {
    triggerHaptic(20);
    if (onOpenDocument) {
      onOpenDocument(doc);
      return;
    }
    await nativeOpenInOtium(doc.pdfBlob, `${doc.title}.pdf`);
  };

  const handleExportBackup = async () => {
    triggerHaptic(20);
    try {
      const backupBlob = await exportVaultBackup();
      const filename = `Otium_Vault_Backup_${new Date().toISOString().slice(0, 10)}.otiumvault`;
      await nativeSharePdf(backupBlob, filename, 'Otium Vault Backup');
      setToastMsg('Vault backup exported successfully');
      setTimeout(() => setToastMsg(''), 2500);
    } catch (e) {
      console.warn('Backup export failed:', e);
    }
  };

  const handleRestoreFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    triggerHaptic(20);
    try {
      const count = await restoreVaultBackup(file);
      await loadDocs();
      setToastMsg(`Restored ${count} documents from backup!`);
      setTimeout(() => setToastMsg(''), 3000);
    } catch (err: unknown) {
      console.warn('Backup restore error:', err);
      setToastMsg('Corrupted or invalid backup file');
      setTimeout(() => setToastMsg(''), 2500);
    } finally {
      if (backupInputRef.current) backupInputRef.current.value = '';
    }
  };

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const filteredDocs = documents.filter((doc) => {
    const matchesCategory = selectedCategory === 'all' || doc.category === selectedCategory;
    const q = searchQuery.toLowerCase().trim();
    if (!q) return matchesCategory;
    const matchesTitle = doc.title.toLowerCase().includes(q);
    const matchesOcr = doc.ocrText && doc.ocrText.toLowerCase().includes(q);
    return matchesCategory && (matchesTitle || matchesOcr);
  });

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={lang === 'ar' ? 'مكتبة المستندات' : 'Document Library'}
      className="fixed inset-0 z-50 bg-[#07090e]/95 backdrop-blur-2xl flex flex-col justify-between select-none animate-in fade-in duration-200"
    >
      <LibraryHeaderBar
        theme={theme}
        lang={lang}
        documentCount={documents.length}
        onExportBackup={handleExportBackup}
        onTriggerRestore={() => backupInputRef.current?.click()}
        onOpenSettings={onOpenSettings}
        onClose={onClose}
      />

      {/* Floating Status Notification */}
      {toastMsg && (
        <div className="absolute top-24 inset-x-0 flex justify-center z-50 pointer-events-none fluid-pop">
          <span className="px-4 py-1.5 rounded-full bg-accent text-on-accent font-semibold text-xs shadow-2xl flex items-center gap-1.5 border border-white/20">
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>{toastMsg}</span>
          </span>
        </div>
      )}

      {/* Realtime Search Bar */}
      {documents.length > 0 && (
        <div className="px-5 py-2.5">
          <div className="relative flex items-center">
            <Search className="w-4 h-4 text-gray-400 absolute start-3.5 pointer-events-none" />
            <input
              type="text"
              placeholder={lang === 'ar' ? 'البحث في المستندات بالاسم أو التاريخ...' : 'Search documents...'}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-white/[0.05] border border-white/[0.1] rounded-xl py-2 ps-10 pe-8 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-accent/50 transition-colors font-arabic"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute end-3 text-gray-400 text-xs hover:text-white cursor-pointer"
              >
                ✕
              </button>
            )}
          </div>

          {/* Category Filter Tabs */}
          <div className="flex items-center gap-1.5 pt-2.5 overflow-x-auto scrollbar-none">
            {(
              lang === 'ar'
                ? [
                    { id: 'all', label: 'الكل' },
                    { id: 'bills', label: 'فواتير' },
                    { id: 'work', label: 'عقود' },
                    { id: 'ids', label: 'هويات' },
                    { id: 'personal', label: 'شخصي' },
                    { id: 'study', label: 'دراسة' },
                  ]
                : [
                    { id: 'all', label: 'All' },
                    { id: 'bills', label: 'Bills' },
                    { id: 'work', label: 'Contracts' },
                    { id: 'ids', label: 'IDs' },
                    { id: 'personal', label: 'Personal' },
                    { id: 'study', label: 'Study' },
                  ]
            ).map((cat) => (
              <button
                key={cat.id}
                onClick={() => {
                  triggerHaptic(10);
                  setSelectedCategory(cat.id as DocumentCategory);
                }}
                className={`fluid-press px-3 py-1 rounded-full text-[11px] font-bold whitespace-nowrap cursor-pointer ${
                  selectedCategory === cat.id
                    ? 'bg-accent text-on-accent shadow-md shadow-accent/20'
                    : 'bg-white/5 text-gray-400 hover:text-white border border-white/5'
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Document List / Empty Vault Showcase */}
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
        {filteredDocs.length === 0 ? (
          <div className="h-full min-h-[300px] flex flex-col items-center justify-center text-center px-4">
            <div className="w-16 h-16 rounded-2xl bg-accent/10 border border-accent/20 flex items-center justify-center mb-4">
              <OtiumLogo size={32} theme={theme} />
            </div>

            <h3 className="text-base font-bold text-white font-arabic">
              {searchQuery ? (lang === 'ar' ? 'لا توجد نتائج مطابقة' : 'No matching documents') : (lang === 'ar' ? 'لا توجد مستندات محفوظة بعد' : 'No documents saved yet')}
            </h3>
            <p className="text-xs text-gray-400 mt-1.5 max-w-xs leading-relaxed font-arabic">
              {searchQuery
                ? (lang === 'ar' ? 'جرب البحث بكلمة أخرى أو اسم مختلف.' : 'Try a different search keyword.')
                : (lang === 'ar' ? 'عند مسح المستندات وتصديرها كملف PDF، سيتم حفظها تلقائياً هنا في مكتبة المستندات للوصول السريع والمشاركة.' : 'Scanned documents exported as PDF will be safely saved in this library for quick access.')}
            </p>

            <button
              onClick={() => {
                triggerHaptic(20);
                onClose();
              }}
              className="fluid-press mt-5 flex items-center gap-2 px-5 py-2.5 rounded-xl bg-accent text-on-accent font-bold text-xs shadow-lg shadow-accent/20 font-arabic cursor-pointer"
            >
              <Camera className="w-4 h-4" />
              <span>{lang === 'ar' ? 'مسح مستند جديد' : 'Scan New Document'}</span>
            </button>
          </div>
        ) : (
          filteredDocs.map((doc) => (
            <LibraryDocumentCard
              key={doc.id}
              doc={doc}
              lang={lang}
              onOpen={handleOpenInOtium}
              onSave={handleSaveToDownloads}
              onShare={handleShare}
              onDelete={handleDelete}
            />
          ))
        )}
      </div>

      <input
        ref={backupInputRef}
        type="file"
        accept=".otiumvault,application/json"
        onChange={handleRestoreFile}
        className="hidden"
      />

    </div>
  );
};
