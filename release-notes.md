# Otium 1.9.3 — Stable teaching controls

- Preserve a true 16:9 whiteboard stage, so handwriting and highlights keep their proportions when the board or split pane changes size.
- Whiteboard is now disabled by default on both computer and phone. Enable it from the teacher dock settings on a device only when a lesson needs it; the choice is remembered.
- Keep the document reader mounted while the board is disabled, remove board shortcuts and clip actions, and prevent stale keyboard shortcuts from reopening it.
- Put export, clear-with-confirmation, and a one-tap “hide all controls” student view directly on the teaching dock.
- Start every single or dual-page change from the page top after PDF rendering settles. Paged side arrows now appear only after opening reader controls, preventing accidental page turns while touching or scrolling.

Validation: production build, shared-version guard, and 162 automated tests. Test pen and touch behavior on the target smartboard after updating both linked devices.
