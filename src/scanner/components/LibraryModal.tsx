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
import { nativeSharePdf, nativeSavePdf, nativeOpenInOtium, nativeOpenUrl, nativeInstallApk } from '../core/nativeBridge';
import type { UpdateCheckResult } from '../core/updater';
import {
  checkForAppUpdates,
  APP_CURRENT_VERSION,
  detectDeviceArchitecture,
} from '../core/updater';
import { OtiumLogo } from './OtiumLogo';
import {
  X,
  Trash2,
  Share2,
  BookOpen,
  Clock,
  Search,
  DownloadCloud,
  UploadCloud,
  CheckCircle2,
  Camera,
  Download,
  Info,
  RefreshCw,
  ExternalLink,
  Sparkles,
  AlertCircle,
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

  // About & On-demand Update states
  const [showAboutModal, setShowAboutModal] = useState<boolean>(false);
  const [isCheckingUpdate, setIsCheckingUpdate] = useState<boolean>(false);
  const [updateResult, setUpdateResult] = useState<UpdateCheckResult | null>(null);
  const [updateError, setUpdateError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      loadDocs();
    }
  }, [isOpen]);

  const triggerHaptic = (duration = 15) => {
    if ('vibrate' in navigator) {
      try {
        navigator.vibrate(duration);
      } catch {}
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
    await nativeSavePdf(doc.pdfBlob, `${doc.title}.pdf`);
    setToastMsg('✓ تم حفظ المستند في مجلد التنزيلات');
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
    } catch (err: any) {
      console.warn('Backup restore error:', err);
      setToastMsg('Corrupted or invalid backup file');
      setTimeout(() => setToastMsg(''), 2500);
    } finally {
      if (backupInputRef.current) backupInputRef.current.value = '';
    }
  };

  const handleCheckUpdate = async () => {
    triggerHaptic(15);
    setIsCheckingUpdate(true);
    setUpdateError(null);
    try {
      const res = await checkForAppUpdates();
      setUpdateResult(res);
      triggerHaptic(25);
    } catch (err: any) {
      setUpdateError(err.message || 'تعذر الاتصال بـ GitHub للتحقق من التحديثات');
      triggerHaptic(40);
    } finally {
      setIsCheckingUpdate(false);
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
      {/* Top Header Bar with Safe Area Inset */}
      <div
        style={{
          paddingTop: 'max(env(safe-area-inset-top, 0px) + 10px, 48px)',
        }}
        className="flex items-center justify-between px-5 pb-3.5 otium-chrome border-b border-white/[0.08]"
      >
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 px-2.5 py-1 rounded-full bg-white/[0.06] border border-white/[0.08]">
            <OtiumLogo size={20} theme={theme} />
            <span className="text-xs font-black tracking-widest text-white">OTIUM</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-sm font-bold text-gray-200">{lang === 'ar' ? 'مكتبة المستندات' : 'Document Library'}</span>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-accent/15 text-accent font-black border border-accent/25">
              {documents.length}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          {/* Backup Vault Archive */}
          {documents.length > 0 && (
            <button
              onClick={handleExportBackup}
              className="fluid-press p-2 rounded-full glass-button text-gray-300 active:text-accent cursor-pointer"
              title={lang === 'ar' ? 'نسخ احتياطي للمستندات (.otiumvault)' : 'Backup documents (.otiumvault)'}
            >
              <DownloadCloud className="w-4 h-4" />
            </button>
          )}

          {/* Restore Vault Archive */}
          <button
            onClick={() => backupInputRef.current?.click()}
            className="fluid-press p-2 rounded-full glass-button text-gray-300 active:text-accent cursor-pointer"
            title={lang === 'ar' ? 'استرجاع من نسخة احتياطية (.otiumvault)' : 'Restore from backup (.otiumvault)'}
          >
            <UploadCloud className="w-4 h-4" />
          </button>

          {/* About & Updates Modal Trigger */}
          <button
            onClick={() => {
              triggerHaptic(15);
              if (onOpenSettings) {
                onOpenSettings();
              } else {
                setShowAboutModal(true);
              }
            }}
            className="fluid-press p-2 rounded-full glass-button text-gray-300 active:text-accent cursor-pointer"
            title={lang === 'ar' ? 'الإعدادات والتحقق من التحديثات' : 'Settings & Updates'}
          >
            <Info className="w-4 h-4" />
          </button>

          <button
            onClick={onClose}
            className="fluid-press p-2 rounded-full glass-button text-gray-300 active:text-white cursor-pointer"
            title={lang === 'ar' ? 'إغلاق' : 'Close'}
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

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
            <div
              key={doc.id}
              className="fluid-press otium-card p-3.5 rounded-2xl flex items-center justify-between gap-3 border border-white/[0.08] hover:border-accent/35 shadow-md group cursor-pointer"
            >
              {/* Thumbnail */}
              <div className="w-14 h-18 rounded-xl bg-black/60 border border-white/10 overflow-hidden flex-shrink-0 relative shadow-inner">
                <img src={doc.thumbnail} alt="" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                <span className="absolute bottom-1 right-1 px-1.5 py-0.5 rounded bg-black/80 text-[9px] font-bold text-white border border-white/10">
                  {doc.pageCount}p
                </span>
              </div>

              {/* Meta */}
              <div className="flex-1 min-w-0 text-start">
                <h4 className="text-sm font-bold text-gray-100 truncate group-hover:text-accent transition-colors">
                  {doc.title}
                </h4>
                <div className="flex items-center gap-3 mt-1.5 text-[11px] text-gray-400">
                  <span className="flex items-center gap-1">
                    <BookOpen className="w-3 h-3 text-accent" />
                    <span>{doc.pageCount} {lang === 'ar' ? (doc.pageCount === 1 ? 'صفحة' : 'صفحات') : 'pages'}</span>
                  </span>
                  <span className="flex items-center gap-1">
                    <Clock className="w-3 h-3 text-gray-500" />
                    <span>
                      {new Date(doc.createdAt).toLocaleDateString([], {
                        month: 'short',
                        day: 'numeric',
                      })}
                    </span>
                  </span>
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-1.5 flex-shrink-0">
                <button
                  onClick={() => handleOpenInOtium(doc)}
                  className="fluid-press p-2 rounded-xl glass-button text-accent hover:border-accent/40 cursor-pointer"
                  title={lang === 'ar' ? 'فتح في قارئ أو تيوم' : 'Open in Otium Reader'}
                >
                  <BookOpen className="w-4 h-4" />
                </button>

                <button
                  onClick={() => handleSaveToDownloads(doc)}
                  className="fluid-press p-2 rounded-xl glass-button text-gray-300 active:text-accent hover:border-accent/40 cursor-pointer"
                  title={lang === 'ar' ? 'حفظ في التنزيلات' : 'Save to Downloads'}
                >
                  <Download className="w-4 h-4" />
                </button>

                <button
                  onClick={() => handleShare(doc)}
                  className="p-2 rounded-xl glass-button text-gray-300 active:text-emerald-400 hover:border-emerald-500/40"
                  title="مشاركة المستند PDF"
                >
                  <Share2 className="w-4 h-4" />
                </button>

                <button
                  onClick={() => handleDelete(doc.id)}
                  className="p-2 rounded-xl glass-button text-gray-400 active:text-red-400 hover:border-red-500/40"
                  title="حذف"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Luxury Footer Card */}
      <div className="px-5 py-3.5 otium-chrome border-t border-white/[0.08] flex items-center justify-between text-xs text-gray-400">
        <button
          onClick={() => {
            triggerHaptic(15);
            setShowAboutModal(true);
          }}
          className="fluid-press flex items-center gap-2 hover:text-white text-right cursor-pointer"
        >
          <OtiumLogo size={14} theme={theme} />
          <span className="text-[11px] text-gray-300 font-medium">{lang === 'ar' ? 'رفيق قارئ أو تيوم • Otium Ecosystem' : 'Otium Companion • Ecosystem'}</span>
        </button>
        <button
          onClick={() => {
            triggerHaptic(15);
            setShowAboutModal(true);
          }}
          className="fluid-press text-[11px] text-accent font-bold px-2.5 py-0.5 rounded-full bg-accent/10 border border-accent/20 hover:bg-accent/20 flex items-center gap-1.5 cursor-pointer"
          title={lang === 'ar' ? 'معلومات التطبيق والتحقق من التحديثات' : 'App info & updates'}
        >
          <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse"></span>
          <span>{lang === 'ar' ? `أحدث إصدار: v${APP_CURRENT_VERSION}` : `Latest: v${APP_CURRENT_VERSION}`}</span>
        </button>
      </div>

      <input
        ref={backupInputRef}
        type="file"
        accept=".otiumvault,application/json"
        onChange={handleRestoreFile}
        className="hidden"
      />

      {/* About & Updates Modal Overlay */}
      {showAboutModal && (
        <div className="fixed inset-0 z-[60] bg-black/85 backdrop-blur-xl flex items-center justify-center p-4 fluid-fade">
          <div className="w-full max-w-sm max-h-[90vh] bg-[#0c1017]/95 border border-white/[0.12] rounded-3xl shadow-2xl flex flex-col overflow-hidden fluid-pop">
            {/* Modal Header */}
            <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-white/[0.08]">
              <div className="flex items-center gap-2">
                <Info className="w-4 h-4 text-accent" />
                <span className="text-sm font-bold text-white">{lang === 'ar' ? 'حول التطبيق والتحديثات' : 'About & Updates'}</span>
              </div>
              <button
                onClick={() => setShowAboutModal(false)}
                className="fluid-press p-1.5 rounded-full glass-button text-gray-400 active:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Body (Scrollable) */}
            <div className="p-5 overflow-y-auto space-y-4 text-center">
              {/* Logo & Identity */}
              <div className="flex flex-col items-center">
                <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-accent/20 to-teal-500/5 border border-accent/30 flex items-center justify-center shadow-lg mb-3">
                  <OtiumLogo size={34} theme={theme} />
                </div>
                <h3 className="text-lg font-black tracking-wide text-white">Otium</h3>
                <p className="text-xs text-gray-400 mt-0.5">
                  {lang === 'ar' ? 'الماسح الضوئي الذكي • بيئة عمل أوتيوم المتكاملة' : 'Companion Scanner • Otium Ecosystem'}
                </p>
                <div className="flex items-center gap-2 mt-2">
                  <span className="text-[11px] font-mono px-2.5 py-0.5 rounded-full bg-accent/15 text-accent border border-accent/30 font-semibold">
                    v{APP_CURRENT_VERSION}
                  </span>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-white/[0.06] text-gray-400 border border-white/[0.08]">
                    {detectDeviceArchitecture()}
                  </span>
                </div>
              </div>

              {/* Updates Status Box */}
              <div className="bg-white/[0.03] border border-white/[0.08] rounded-2xl p-4 text-right">
                {/* Initial State (Before Check) */}
                {!updateResult && !isCheckingUpdate && !updateError && (
                  <div className="text-center space-y-3">
                    <p className="text-xs text-gray-300 leading-relaxed">
                      {lang === 'ar' ? 'احتراماً لخصوصيتك المطلقة، لا يتصل التطبيق بالإنترنت في الخلفية نهائياً. يتم فحص الإصدارات فقط عند طلبك.' : 'Complete privacy: Otium never phones home or checks the network in the background. Updates are checked strictly upon user request.'}
                    </p>
                    <button
                      onClick={handleCheckUpdate}
                      className="fluid-press w-full py-2.5 px-4 rounded-xl bg-accent hover:opacity-90 text-on-accent font-bold text-xs flex items-center justify-center gap-2 shadow-lg shadow-accent/20 cursor-pointer"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      <span>{lang === 'ar' ? 'التحقق من وجود تحديثات' : 'Check for Updates'}</span>
                    </button>
                  </div>
                )}

                {/* Loading State */}
                {isCheckingUpdate && (
                  <div className="text-center py-4 space-y-2">
                    <RefreshCw className="w-6 h-6 text-accent animate-spin mx-auto" />
                    <p className="text-xs text-gray-300">جاري الاتصال بـ GitHub Releases...</p>
                  </div>
                )}

                {/* Error State */}
                {updateError && (
                  <div className="space-y-3">
                    <div className="flex items-start gap-2 text-rose-400 text-xs bg-rose-500/10 p-2.5 rounded-xl border border-rose-500/20 leading-relaxed">
                      <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                      <span>{updateError}</span>
                    </div>
                    <button
                      onClick={() => nativeOpenUrl('https://github.com/XRTM8/Otium/releases/latest')}
                      className="fluid-press w-full py-2.5 px-3 rounded-xl bg-accent hover:opacity-90 text-on-accent text-xs font-bold flex items-center justify-center gap-2 shadow-md shadow-accent/20 cursor-pointer"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      <span>{lang === 'ar' ? 'تنزيل التحديث مباشرة عبر المتصفح' : 'Download via Browser'}</span>
                    </button>
                    <button
                      onClick={handleCheckUpdate}
                      className="fluid-press w-full py-2 px-3 rounded-xl bg-white/[0.06] hover:bg-white/[0.1] text-white text-xs font-semibold flex items-center justify-center gap-2 border border-white/[0.1] cursor-pointer"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      <span>{lang === 'ar' ? 'إعادة المحاولة' : 'Retry'}</span>
                    </button>
                  </div>
                )}

                {/* Update Available State */}
                {updateResult && updateResult.hasUpdate && (
                  <div className="space-y-3 text-right">
                    <div className="flex items-center gap-2 text-accent font-bold text-xs bg-accent/15 p-2.5 rounded-xl border border-accent/30">
                      <Sparkles className="w-4 h-4 shrink-0 text-accent animate-pulse" />
                      <span>{lang === 'ar' ? `يتوفر إصدار جديد: v${updateResult.latestVersion}` : `New update available: v${updateResult.latestVersion}`}</span>
                    </div>

                    {updateResult.releaseNotes && (
                      <div className="text-[11px] text-gray-300 bg-black/40 p-2.5 rounded-xl max-h-32 overflow-y-auto whitespace-pre-wrap font-sans border border-white/[0.05] leading-relaxed">
                        {updateResult.releaseNotes}
                      </div>
                    )}

                    {updateResult.matchedAsset ? (
                      <button
                        onClick={() => {
                          nativeInstallApk(
                            updateResult.matchedAsset!.downloadUrl,
                            updateResult.matchedAsset!.name
                          );
                        }}
                        className="fluid-press w-full py-2.5 px-3 rounded-xl bg-accent hover:opacity-90 text-on-accent font-bold text-xs flex items-center justify-center gap-2 shadow-lg shadow-accent/20 font-arabic cursor-pointer"
                      >
                        <Download className="w-3.5 h-3.5" />
                        <span>
                          {lang === 'ar' ? `تنزيل وتثبيت التحديث مباشرة (${updateResult.matchedAsset.name.includes('arm64') ? 'arm64' : 'APK'} • ${(updateResult.matchedAsset.size / (1024 * 1024)).toFixed(1)} MB)` : `Download & Install Update (${(updateResult.matchedAsset.size / (1024 * 1024)).toFixed(1)} MB)`}
                        </span>
                      </button>
                    ) : (
                      <button
                        onClick={() => nativeOpenUrl(updateResult.releaseUrl)}
                        className="fluid-press w-full py-2.5 px-3 rounded-xl bg-accent hover:opacity-90 text-on-accent font-bold text-xs flex items-center justify-center gap-2 cursor-pointer"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                        <span>{lang === 'ar' ? 'فتح صفحة الإصدار على GitHub' : 'Open Release on GitHub'}</span>
                      </button>
                    )}

                    <button
                      onClick={() => nativeOpenUrl(updateResult.releaseUrl)}
                      className="w-full text-center text-[10px] text-gray-400 hover:text-emerald-400 flex items-center justify-center gap-1 py-1"
                    >
                      <span>عرض تفاصيل الإصدار بالكامل على GitHub</span>
                      <ExternalLink className="w-3 h-3" />
                    </button>
                  </div>
                )}

                {/* Already Up to Date State */}
                {updateResult && !updateResult.hasUpdate && (
                  <div className="text-center space-y-3">
                    <div className="flex items-center justify-center gap-2 text-emerald-400 font-bold text-xs bg-emerald-500/10 p-2.5 rounded-xl border border-emerald-500/20">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                      <span>أنت على أحدث إصدار (v{updateResult.currentVersion})</span>
                    </div>
                    <p className="text-[11px] text-gray-400">
                      تطبيقك محدث بالكامل ويمتلك كافة مزايا الاستقرار والأداء العالي.
                    </p>
                    <div className="flex gap-2 pt-1">
                      <button
                        onClick={handleCheckUpdate}
                        className="flex-1 py-1.5 px-3 rounded-xl bg-white/[0.05] hover:bg-white/[0.08] text-gray-300 text-[11px] font-semibold flex items-center justify-center gap-1.5 border border-white/[0.08]"
                      >
                        <RefreshCw className="w-3 h-3" />
                        <span>فحص مجدداً</span>
                      </button>
                      <button
                        onClick={() => nativeOpenUrl(updateResult.releaseUrl)}
                        className="flex-1 py-1.5 px-3 rounded-xl bg-white/[0.05] hover:bg-white/[0.08] text-gray-300 text-[11px] font-semibold flex items-center justify-center gap-1.5 border border-white/[0.08]"
                      >
                        <ExternalLink className="w-3 h-3" />
                        <span>سجل الإصدارات</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Ecosystem & Privacy Pledge */}
              <div className="text-[11px] text-gray-400 space-y-1.5 pt-1 border-t border-white/[0.06]">
                <p className="font-semibold text-gray-300">مبادئ أو تيوم (Otium Principles)</p>
                <p className="text-[10px] text-gray-400 leading-relaxed">
                  خصوصية 100% دون خوادم وسيطة • دون تتبع أو إعلانات • مفتوح المصدر ومصمم ليدوم لسنوات باستقرار تام.
                </p>
              </div>

              {/* GitHub Link */}
              <button
                onClick={() => nativeOpenUrl('https://github.com/XRTM8/Otium')}
                className="w-full py-2 px-3 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] text-gray-300 text-[11px] font-medium flex items-center justify-center gap-2 border border-white/[0.08] transition-colors"
              >
                <span>مستودع المشروع على GitHub</span>
                <ExternalLink className="w-3 h-3 text-gray-400" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
