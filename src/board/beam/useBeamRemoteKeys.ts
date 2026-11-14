import { useEffect, useState } from 'react';
import type { ReaderController } from '../../app/useReaderController';
import { useVolumePageKeys } from '../../platform/useVolumePageKeys';
import { beamService } from './beamService';

export function useBeamRemoteKeys(reader: ReaderController, mediaOpen: boolean, blocked: boolean) {
  const [remotePages, setRemotePages] = useState(() => beamService.getPeerState().totalPages ?? 0);
  useEffect(() => beamService.onPeerChange(peer => setRemotePages(peer.totalPages ?? 0)), []);
  const localPdf = Boolean(!mediaOpen && reader.doc && reader.numPages > 1);
  const remote = !reader.doc && !mediaOpen && reader.beamRole === 'sender' && reader.beamPeerConnected && remotePages > 1;
  useVolumePageKeys(!blocked && (localPdf || remote), direction => {
    if (remote) beamService.sendStep(direction);
    else if (direction === 'next') reader.goToNextPage();
    else reader.goToPrevPage();
  });
}
