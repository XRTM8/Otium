import { useCallback, useEffect, useRef, useState } from 'react';
import { getCurrentVersion } from './currentVersion';
import type { UpdateAdapter, UpdateProgress, UpdateSnapshot } from './types';

interface UpdateChecker {
  snapshot: UpdateSnapshot | null;
  isChecking: boolean;
  isInstalling: boolean;
  check: () => Promise<void>;
  install: () => Promise<void>;
  openManualDownload: () => Promise<void>;
}

const EMPTY_PROGRESS: UpdateProgress = { downloaded: 0 };

function errorSnapshot(error: unknown): UpdateSnapshot {
  return {
    phase: 'error',
    currentVersion: getCurrentVersion(),
    canAutoInstall: false,
    message: error instanceof Error ? error.message : 'Could not check for updates.'
  };
}

/**
 * Shared update state machine. Platform adapters only implement transport:
 * how to check, how to download, and whether the operating system can install.
 */
export function useUpdateChecker(adapter: UpdateAdapter | null): UpdateChecker {
  const [snapshot, setSnapshot] = useState<UpdateSnapshot | null>(null);
  const [isChecking, setIsChecking] = useState(false);
  const [isInstalling, setIsInstalling] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => abortRef.current?.abort();
  }, []);

  const check = useCallback(async () => {
    if (!adapter) {
      setSnapshot({
        phase: 'unsupported',
        currentVersion: getCurrentVersion(),
        canAutoInstall: false,
        message: 'Updates are managed by the installed Otium app.'
      });
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setIsChecking(true);

    try {
      const next = await adapter.check(controller.signal);
      if (!controller.signal.aborted) setSnapshot(next);
    } catch (error) {
      if (!controller.signal.aborted) setSnapshot(errorSnapshot(error));
    } finally {
      if (abortRef.current === controller) {
        abortRef.current = null;
        setIsChecking(false);
      }
    }
  }, [adapter]);

  const install = useCallback(async () => {
    if (!adapter || !snapshot || snapshot.phase !== 'available') return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setIsChecking(false);
    setIsInstalling(true);
    setSnapshot({ ...snapshot, phase: 'downloading', progress: EMPTY_PROGRESS });

    try {
      const next = await adapter.install(
        snapshot,
        (progress) => {
          if (controller.signal.aborted) return;
          setSnapshot((current) =>
            current ? { ...current, phase: 'downloading', progress } : current
          );
        },
        controller.signal
      );
      if (!controller.signal.aborted) setSnapshot(next);
    } catch (error) {
      if (!controller.signal.aborted) setSnapshot(errorSnapshot(error));
    } finally {
      if (abortRef.current === controller) {
        abortRef.current = null;
        setIsInstalling(false);
      }
    }
  }, [adapter, snapshot]);

  const openManualDownload = useCallback(async () => {
    if (!adapter || !snapshot) return;
    try {
      await adapter.openManualDownload(snapshot);
    } catch (error) {
      setSnapshot(errorSnapshot(error));
    }
  }, [adapter, snapshot]);

  return { snapshot, isChecking, isInstalling, check, install, openManualDownload };
}
