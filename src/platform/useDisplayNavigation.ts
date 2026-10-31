import { useEffect, useState } from 'react';
import { detectDeviceRole, useDeviceUsage } from './deviceUsage';
export function nextRemoteTarget(elements: HTMLElement[], current: HTMLElement | null, key: string): HTMLElement | undefined {
  if (!current || !elements.includes(current)) return elements[0];
  const origin = current.getBoundingClientRect();
  const x = origin.left + origin.width / 2, y = origin.top + origin.height / 2;
  return elements.filter(element => element !== current).map(element => {
    const rect = element.getBoundingClientRect();
    const dx = rect.left + rect.width / 2 - x, dy = rect.top + rect.height / 2 - y;
    const primary = key === 'ArrowRight' ? dx : key === 'ArrowLeft' ? -dx : key === 'ArrowDown' ? dy : -dy;
    const cross = key === 'ArrowLeft' || key === 'ArrowRight' ? Math.abs(dy) : Math.abs(dx);
    return { element, primary, score: Math.hypot(dx, dy) + cross * 2 };
  }).filter(candidate => candidate.primary > 1).sort((a, b) => a.score - b.score)[0]?.element;
}
export function useDisplayNavigation() {
  const { role } = useDeviceUsage();
  const [television] = useState(() => detectDeviceRole() === 'display');
  useEffect(() => {
    document.documentElement.dataset.deviceRole = role;
    const remote = role === 'display' || television;
    document.documentElement.dataset.remoteNavigation = String(remote);
    if (!remote) return;
    const handle = (event: KeyboardEvent) => {
      const active = document.activeElement as HTMLElement | null;
      if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || active?.closest('textarea, [contenteditable="true"], .textLayer')) return;
      if (active?.matches('input') && ['ArrowLeft', 'ArrowRight', 'Enter'].includes(event.key)) return;
      if (active?.matches('select') && ['ArrowUp', 'ArrowDown', 'Enter'].includes(event.key)) return;
      if (event.key === 'Enter' && active?.matches('button, a, [role="button"]')) {
        event.preventDefault(); event.stopPropagation(); if (!event.repeat) active.click(); return;
      }
      if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)) return;
      const dialogs = [...document.querySelectorAll<HTMLElement>('[role="dialog"][aria-modal="true"]')].filter(el => el.getClientRects().length);
      const scope = dialogs.at(-1) ?? document;
      const elements = [...scope.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), [tabindex="0"]')]
        .filter(el => !el.closest('[hidden], [inert], [aria-hidden="true"]') && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden');
      const next = nextRemoteTarget(elements, active, event.key);
      if (next) { event.preventDefault(); event.stopPropagation(); next.focus(); next.scrollIntoView({ block: 'nearest', inline: 'nearest' }); }
    };
    document.addEventListener('keydown', handle, true);
    return () => document.removeEventListener('keydown', handle, true);
  }, [role, television]);
}
