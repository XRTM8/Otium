# Otium 1.9.6 — Calm reading, full whiteboard

- The reader now opens cleanly with the top toolbar only. The lower teacher dock appears only after opening the whiteboard.
- The whiteboard now fills its allocated split-screen area instead of being confined to a small 16:9 frame.
- Removed the intrusive teacher-mode card above the workspace.
- Stopped the idle laser animation loop, reducing unnecessary whiteboard redraws and lag.
- Returning from the whiteboard restores the reader toolbar reliably.

# Otium 1.9.5 — Restored whiteboard and reliable cloud

- Restore a clear Smart Whiteboard switch inside Settings → Reading. It is saved per device and reveals the board button only on the computer/smartboard, keeping phones focused on remote reading controls.
- Preserve the existing cloud provider while strengthening automatic polling, reconnect, retry, and explicit failure recovery for unstable school Wi-Fi and older Android WebViews.

Validation: production build, shared-version guard, and automated tests for whiteboard visibility, stalled SSE, polling recovery, retry, and real cloud-failure states.
