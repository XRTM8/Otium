import type React from 'react';
import { useCallback, useEffect, useRef } from 'react';
import type { Language } from '../core/i18n/translations';
import type { RecentDocItem } from '../core/storage/documents';
import { describeDocumentError, SAMPLE_DOCUMENT_NAME } from './readerControllerHelpers';
import { readRecentDocumentBytes } from './readerDocumentLoaderHelpers';
import { useReaderDragDrop } from './useReaderDragDrop';

interface UseReaderFileOpenersOptions {
  dragDropEnabled: boolean;
  lang: Language;
  langRef: React.MutableRefObject<Language>;
  fileReadGenerationRef: React.MutableRefObject<number>;
  loadDocumentRef: React.MutableRefObject<(data: ArrayBuffer, title: string, startPage?: number, reportFailure?: boolean) => Promise<boolean>>;
  setIsLoading: React.Dispatch<React.SetStateAction<boolean>>;
  setDocumentError: React.Dispatch<React.SetStateAction<string | null>>;
}

export function useReaderFileOpeners({
  dragDropEnabled,
  lang,
  langRef,
  fileReadGenerationRef,
  loadDocumentRef,
  setIsLoading,
  setDocumentError,
}: UseReaderFileOpenersOptions) {
  const openFile = useCallback(
    async (file: File) => {
      const fileGeneration = ++fileReadGenerationRef.current;
      try {
        const buffer = await file.arrayBuffer();
        if (fileGeneration !== fileReadGenerationRef.current) return false;
        return await loadDocumentRef.current(buffer, file.name);
      } catch (error) {
        if (fileGeneration !== fileReadGenerationRef.current) return false;
        setIsLoading(false);
        setDocumentError(describeDocumentError(error, lang));
        console.error('Error reading file:', error);
        return false;
      }
    },
    [fileReadGenerationRef, lang, loadDocumentRef, setDocumentError, setIsLoading]
  );

  const openFileRef = useRef(openFile);
  useEffect(() => {
    openFileRef.current = openFile;
  });

  useReaderDragDrop({
    enabled: dragDropEnabled,
    langRef,
    openFileRef,
    setDocumentError,
  });

  const openSample = useCallback(async () => {
    const fileGeneration = ++fileReadGenerationRef.current;
    setIsLoading(true);
    setDocumentError(null);
    try {
      const response = await fetch(`${import.meta.env.BASE_URL}sample.pdf`);
      if (!response.ok) throw new Error(`Sample document returned ${response.status}`);
      const buffer = await response.arrayBuffer();
      if (fileGeneration !== fileReadGenerationRef.current) return false;
      return await loadDocumentRef.current(buffer, SAMPLE_DOCUMENT_NAME);
    } catch (error) {
      if (fileGeneration !== fileReadGenerationRef.current) return false;
      setDocumentError(describeDocumentError(error, lang));
      setIsLoading(false);
      console.error('Error loading sample:', error);
      return false;
    }
  }, [fileReadGenerationRef, lang, loadDocumentRef, setDocumentError, setIsLoading]);

  const loadDocumentBytes = useCallback(
    async (data: ArrayBuffer, name: string) => {
      return await loadDocumentRef.current(data, name);
    },
    [loadDocumentRef]
  );

  const openRecent = useCallback(
    async (recent: RecentDocItem) => {
      if (recent.name === SAMPLE_DOCUMENT_NAME) {
        return await openSample();
      }
      const fileGeneration = ++fileReadGenerationRef.current;
      setIsLoading(true);
      setDocumentError(null);
      const result = await readRecentDocumentBytes(recent, lang);
      if (fileGeneration !== fileReadGenerationRef.current) return false;
      if (!result.ok) {
        setIsLoading(false);
        setDocumentError(result.error);
        return false;
      }
      return await loadDocumentRef.current(result.data, recent.name);
    },
    [fileReadGenerationRef, lang, loadDocumentRef, openSample, setDocumentError, setIsLoading]
  );

  return {
    openFile,
    openSample,
    loadDocumentBytes,
    openRecent,
  };
}
