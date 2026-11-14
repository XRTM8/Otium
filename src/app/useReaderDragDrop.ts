import type React from 'react';
import { useEffect } from 'react';
import type { Language } from '../core/i18n/translations';

interface UseReaderDragDropOptions {
  enabled: boolean;
  langRef: React.MutableRefObject<Language>;
  openFileRef: React.MutableRefObject<(file: File) => Promise<boolean>>;
  setDocumentError: React.Dispatch<React.SetStateAction<string | null>>;
}

export function useReaderDragDrop({
  enabled,
  langRef,
  openFileRef,
  setDocumentError,
}: UseReaderDragDropOptions) {
  useEffect(() => {
    if (!enabled) return;

    const handleDragOver = (event: DragEvent) => event.preventDefault();
    const handleDrop = (event: DragEvent) => {
      event.preventDefault();
      const file = event.dataTransfer?.files?.[0];
      if (!file) return;
      if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
        void openFileRef.current(file);
      } else {
        setDocumentError(langRef.current === 'ar' ? 'يرجى اختيار ملف PDF صالح.' : 'Please select a valid PDF file.');
      }
    };

    window.addEventListener('dragover', handleDragOver);
    window.addEventListener('drop', handleDrop);
    return () => {
      window.removeEventListener('dragover', handleDragOver);
      window.removeEventListener('drop', handleDrop);
    };
  }, [enabled, langRef, openFileRef, setDocumentError]);
}
