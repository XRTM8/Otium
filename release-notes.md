# Otium 1.9.5 — Restored whiteboard and reliable cloud

- Restore a clear Smart Whiteboard switch inside Settings → Reading. It is saved per device and reveals the board button only on the computer/smartboard, keeping phones focused on remote reading controls.
- Preserve the existing cloud provider while strengthening automatic polling, reconnect, retry, and explicit failure recovery for unstable school Wi-Fi and older Android WebViews.

Validation: production build, shared-version guard, and automated tests for whiteboard visibility, stalled SSE, polling recovery, retry, and real cloud-failure states.
