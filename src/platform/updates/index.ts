import type { UpdateAdapter } from '../../core/updates/types';
import { getPlatformId } from '../runtime';
import { androidUpdateAdapter } from './android';
import { desktopUpdateAdapter } from './desktop';

/**
 * Returns the update transport for the current platform. Browser previews have
 * no installer, so the UI reports that updates belong to the installed app.
 */
export function getUpdateAdapter(): UpdateAdapter | null {
  switch (getPlatformId()) {
    case 'windows':
      return desktopUpdateAdapter;
    case 'android':
      return androidUpdateAdapter;
    default:
      return null;
  }
}
