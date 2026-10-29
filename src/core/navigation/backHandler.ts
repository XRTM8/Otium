export type BackHandler = () => boolean;

const backHandlers: BackHandler[] = [];

/**
 * Registers a back handler in LIFO order (last in, first out).
 * Handlers should return `true` if they handled the back event,
 * or `false` to pass it down to the next handler in the stack.
 *
 * Returns an unregister cleanup function.
 */
export function registerBackHandler(handler: BackHandler): () => void {
  backHandlers.push(handler);
  return () => {
    const idx = backHandlers.lastIndexOf(handler);
    if (idx !== -1) {
      backHandlers.splice(idx, 1);
    }
  };
}

/**
 * Executes registered back handlers starting from the most recently registered.
 * Returns `true` if any handler handled the event, `false` otherwise.
 */
export function executeBackStep(): boolean {
  for (let i = backHandlers.length - 1; i >= 0; i--) {
    const handler = backHandlers[i];
    try {
      if (handler()) {
        return true;
      }
    } catch (err) {
      console.error('Error during back handler execution:', err);
    }
  }
  return false;
}

/**
 * Test helper: returns the current count of registered back handlers.
 */
export function getRegisteredBackHandlerCount(): number {
  return backHandlers.length;
}

/**
 * Test helper: clears all registered handlers.
 */
export function clearBackHandlers(): void {
  backHandlers.length = 0;
}
