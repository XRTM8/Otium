import { useEffect, useRef, type ReactNode } from 'react';
import { registerBackHandler } from '../core/navigation/backHandler';
export function ConfirmDialog({ title, children, confirmLabel, cancelLabel, busy, onConfirm, onClose }: {
  title: string; children: ReactNode; confirmLabel: string; cancelLabel: string; busy?: boolean; onConfirm: () => void; onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null), close = useRef(onClose);
  useEffect(() => { close.current = () => { if (!busy) onClose(); }; });
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const element = dialog.current;
    element?.showModal();
    const unregister = registerBackHandler(() => { close.current(); return true; });
    return () => { unregister(); element?.close(); previous?.focus(); };
  }, []);
  return <dialog ref={dialog} role="dialog" aria-modal="true" className="lab-confirm" aria-labelledby="lab-confirm-title" onCancel={event => { event.preventDefault(); if (!busy) onClose(); }}>
    <h2 id="lab-confirm-title">{title}</h2><div>{children}</div>
    <div className="lab-confirm-actions"><button autoFocus disabled={busy} onClick={onClose}>{cancelLabel}</button><button className="lab-danger" disabled={busy} onClick={onConfirm}>{confirmLabel}</button></div>
  </dialog>;
}
