import { useEffect, useEffectEvent } from 'react';

export function useVolumePageKeys(enabled: boolean, onTurn: (direction: 'next' | 'prev') => void) {
  const turn = useEffectEvent(onTurn);
  useEffect(() => {
    if (!enabled) return;
    const ui = (window as Window & { OtiumUi?: { setVolumePageKeys?: (enabled: boolean) => void } }).OtiumUi;
    const onVolume = (event: Event) => {
      const direction = (event as CustomEvent<unknown>).detail;
      if (direction === 'next' || direction === 'prev') turn(direction);
    };
    window.addEventListener('otium:volume-page', onVolume);
    ui?.setVolumePageKeys?.(true);
    return () => {
      window.removeEventListener('otium:volume-page', onVolume);
      ui?.setVolumePageKeys?.(false);
    };
  }, [enabled]);
}
