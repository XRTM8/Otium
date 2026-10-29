/**
 * Global Screen Reader & Web Accessibility Utilities (WCAG 2.1 AA Compliant).
 */

let announcerElement: HTMLElement | null = null;

/**
 * Announces a message to assistive technology screen readers (VoiceOver, TalkBack, NVDA, JAWS).
 */
export function announceToScreenReader(
  message: string,
  priority: 'polite' | 'assertive' = 'polite'
): void {
  if (typeof document === 'undefined') return;

  if (!announcerElement) {
    announcerElement = document.getElementById('a11y-live-announcer');
    if (!announcerElement) {
      announcerElement = document.createElement('div');
      announcerElement.id = 'a11y-live-announcer';
      announcerElement.setAttribute('aria-atomic', 'true');
      announcerElement.className = 'sr-only';
      announcerElement.style.cssText =
        'position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0;';
      document.body.appendChild(announcerElement);
    }
  }

  announcerElement.setAttribute('aria-live', priority);
  // Clear and update on next tick to trigger screen reader announcement reliably
  announcerElement.textContent = '';
  setTimeout(() => {
    if (announcerElement) {
      announcerElement.textContent = message;
    }
  }, 50);
}

/**
 * Traps Tab and Shift-Tab keyboard focus inside a modal dialog container
 * so keyboard users cannot navigate behind active modals.
 */
export function trapModalFocus(container: HTMLElement, event: KeyboardEvent): void {
  if (event.key !== 'Tab') return;

  const focusableElements = container.querySelectorAll<HTMLElement>(
    'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
  );

  if (focusableElements.length === 0) return;

  const firstElement = focusableElements[0];
  const lastElement = focusableElements[focusableElements.length - 1];

  if (event.shiftKey) {
    if (document.activeElement === firstElement) {
      lastElement.focus();
      event.preventDefault();
    }
  } else {
    if (document.activeElement === lastElement) {
      firstElement.focus();
      event.preventDefault();
    }
  }
}
