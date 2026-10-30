# Otium 1.9.1 — Calm navigation and synchronized text selection

- Remove the redundant Document / Split / Board control from the middle of the screen; keep the draggable divider.
- Open received PDFs in the document view instead of automatically showing an empty whiteboard beside them.
- Separate Navigate, Select text, and annotation tools. Native text selection is disabled during ordinary scrolling and drawing.
- Single-finger touch scrolls; two-finger pinch zooms. Touch gestures no longer hide controls, double-tap zoom, or flip pages at scroll boundaries. Explicit page controls remain available.
- Coalesce pinch updates to animation frames and prevent simultaneous native pan during a pinch.
- Fit using the actual document pane width, including after split resizing, without responding to scrollbar-width changes.
- Synchronize temporary text selection, saved highlights, underlines, notes, and deletion between paired devices. The receiving board follows the selected paragraph.
- Include saved text highlights and underlines in annotated PDF exports.
- Use short, subtle panel/page transitions and honor reduced-motion preferences.
- Send explicit disconnect through both direct and relay paths, including a keepalive request when leaving the page.

Update both linked devices. Temporary selection is a short-lived blue spotlight; use the highlight action to save a persistent mark.
