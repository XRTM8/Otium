import { useState, useSyncExternalStore } from 'react';
export type DeviceUsage = 'auto' | 'handheld' | 'display' | 'board';
export type DeviceRole = Exclude<DeviceUsage, 'auto'> | 'computer';
const KEY = 'otium-device-usage-v1';
const EVENT = 'otium:device-usage';
export function readDeviceUsage(): DeviceUsage {
  try { const value = localStorage.getItem(KEY); return value === 'handheld' || value === 'display' || value === 'board' ? value : 'auto'; }
  catch { return 'auto'; }
}
export function saveDeviceUsage(value: DeviceUsage) {
  try { localStorage.setItem(KEY, value); } catch { return false; }
  window.dispatchEvent(new Event(EVENT)); return true;
}
export function detectDeviceRole(): DeviceRole {
  if (typeof navigator === 'undefined') return 'computer';
  try {
    const bridge = (window as Window & { OtiumUi?: { getDeviceType?: () => string } }).OtiumUi;
    const hint = bridge?.getDeviceType?.();
    if (hint === 'television') return 'display';
    if (hint === 'handheld') return 'handheld';
  } catch { /* Browsers and old APKs have no native hint. */ }
  const ua = navigator.userAgent || '';
  if (/Android TV|GoogleTV|Google TV|SmartTV|SMART-TV|HbbTV|\bAFT[A-Z0-9]*\b/i.test(ua)) return 'display';
  const ipad = /Macintosh/i.test(ua) && navigator.maxTouchPoints > 1;
  return /Android|iPhone|iPad|iPod|Mobile|Windows Phone/i.test(ua) || ipad ? 'handheld' : 'computer';
}
const subscribe = (callback: () => void) => {
  window.addEventListener(EVENT, callback); window.addEventListener('storage', callback);
  return () => { window.removeEventListener(EVENT, callback); window.removeEventListener('storage', callback); };
};
export function useDeviceUsage() {
  const usage = useSyncExternalStore(subscribe, readDeviceUsage, () => 'auto' as DeviceUsage);
  // Rotation must never change roles or remount the controller.
  const [detected] = useState(detectDeviceRole);
  const role: DeviceRole = usage === 'auto' ? detected : usage;
  return { usage, role, compact: role === 'handheld', receiver: role === 'display' || role === 'board' };
}
