# Otium 1.9.2 — Reachable teacher workspace

- Replace floating corner buttons and separate drawing toolbars with one reachable bottom dock. Switch between document and whiteboard from the same place.
- Clearly identify whether tools affect the document or whiteboard; start navigation safely and reveal pen options only when needed.
- Remember dock position, height, button size, pen color, width, and stylus-only preference on each device.
- Save whiteboard pages, undo/redo history, backgrounds, and pinned clips by document identity. Switching views keeps both workspaces mounted.
- Confirm clear-all and restore cleared or erased board strokes with Undo. Flush pending text highlights when leaving a document.
- Distinguish local saving from peer delivery. Show delivery only after a receipt from the paired reader; older clients without receipts remain in the waiting state.
- Add a student presentation view with reachable page navigation and a restore-tools button. Offer fullscreen and page reach/fit actions from More.
- Adapt the unified dock for narrow phone screens, reserve space below the content, and respect reduced-motion preferences.

Update both linked devices. Whiteboard pages are saved on the device; synchronized PDF annotations continue to use the paired connection.

Validation: production build, shared-version guard, storage and session tests, and React interaction tests for target switching, clear/undo/remount, presentation, phone controls, stylus-only input, and delivery receipts. Physical smartboard reach, pen hardware, and phone pinch gestures still need device acceptance testing; automated browser inspection was stopped by the Computer Use URL policy check.
