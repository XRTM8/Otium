export type UpdatePhase =
  | 'idle'
  | 'checking'
  | 'up-to-date'
  | 'available'
  | 'downloading'
  | 'ready'
  | 'unsupported'
  | 'error';

export interface UpdateProgress {
  downloaded: number;
  total?: number;
  percent?: number;
}

export interface UpdateSnapshot {
  phase: UpdatePhase;
  currentVersion: string;
  latestVersion?: string;
  notes?: string;
  publishedAt?: string;
  progress?: UpdateProgress;
  canAutoInstall: boolean;
  manualDownloadUrl?: string;
  /** Expected SHA-256 of the downloadable artifact, when the feed provides one. */
  downloadSha256?: string;
  message?: string;
}

export interface UpdateAdapter {
  check(signal?: AbortSignal): Promise<UpdateSnapshot>;
  install(
    snapshot: UpdateSnapshot,
    onProgress: (progress: UpdateProgress) => void,
    signal?: AbortSignal
  ): Promise<UpdateSnapshot>;
  openManualDownload(snapshot: UpdateSnapshot): Promise<void>;
}
