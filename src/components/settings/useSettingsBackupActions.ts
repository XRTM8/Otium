import { useEffect, useRef, useState } from 'react';
import type { RestoreSummary } from '../../core/storage/backupFormat';
import { getStorageSummary, type StorageSummary } from '../../core/storage/documents';
import type { SaveTextOutcome } from '../../platform/saveFile';

interface UseSettingsBackupActionsOptions {
  isOpen: boolean;
  isDataTab: boolean;
  ar: boolean;
  onExportBackup?: () => Promise<SaveTextOutcome>;
  onImportBackup?: (text: string) => Promise<RestoreSummary>;
}

export function useSettingsBackupActions({
  isOpen,
  isDataTab,
  ar,
  onExportBackup,
  onImportBackup,
}: UseSettingsBackupActionsOptions) {
  const [storage, setStorage] = useState<StorageSummary | null>(null);
  const [dataBusy, setDataBusy] = useState<'export' | 'import' | null>(null);
  const [dataNotice, setDataNotice] = useState<{
    tone: 'success' | 'error';
    text: string;
  } | null>(null);
  const importInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isOpen || !isDataTab) return;
    let alive = true;
    void getStorageSummary().then((summary) => {
      if (alive) setStorage(summary);
    });
    return () => {
      alive = false;
    };
  }, [isDataTab, isOpen]);

  const handleExport = async () => {
    if (!onExportBackup || dataBusy) return;
    setDataBusy('export');
    setDataNotice(null);
    try {
      const outcome = await onExportBackup();
      if (outcome === 'unavailable') {
        setDataNotice({
          tone: 'error',
          text: ar ? 'تعذر حفظ الملف على هذا الجهاز.' : 'Could not save the file on this device.',
        });
      } else {
        setDataNotice({
          tone: 'success',
          text:
            outcome === 'native-picker'
              ? ar
                ? 'اختر مجلد الحفظ لإكمال التصدير.'
                : 'Choose a folder to finish exporting.'
              : ar
                ? 'تم تنزيل نسخة احتياطية بصيغة JSON.'
                : 'JSON backup downloaded.',
        });
      }
    } catch (error) {
      setDataNotice({
        tone: 'error',
        text: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setDataBusy(null);
    }
  };

  const handleImport = async (file: File) => {
    if (!onImportBackup || dataBusy) return;
    if (file.size > 15 * 1024 * 1024) {
      setDataNotice({
        tone: 'error',
        text: ar
          ? 'حجم ملف النسخة الاحتياطية كبير جداً (الحد الأقصى 15 ميجابايت).'
          : 'Backup file exceeds maximum permitted size (15MB).',
      });
      return;
    }
    setDataBusy('import');
    setDataNotice(null);
    try {
      const text = await file.text();
      const summary = await onImportBackup(text);
      const nextStorage = await getStorageSummary();
      setStorage(nextStorage);
      setDataNotice({
        tone: 'success',
        text: ar
          ? `تمت الاستعادة: ${summary.documents} مستند، ${summary.annotations} اقتباس، ${summary.bookmarks} إشارة.`
          : `Restored ${summary.documents} documents, ${summary.annotations} highlights and ${summary.bookmarks} bookmarks.`,
      });
    } catch (error) {
      setDataNotice({
        tone: 'error',
        text: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setDataBusy(null);
    }
  };

  return {
    storage,
    dataBusy,
    dataNotice,
    importInputRef,
    handleExport,
    handleImport,
  };
}
