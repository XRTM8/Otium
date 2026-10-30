# Otium 1.9.4 — Resilient cloud pairing

- Recover automatically when a school router or Android WebView blocks the long-lived cloud connection: Smart Beam switches to short HTTPS polling without losing the room or pairing role.
- Keep showing “connecting” through early recovery attempts instead of a false cloud failure; report a problem only after repeated polling failures.
- Reconnect immediately when the device returns online, and make the visible retry button restart cloud signaling without resetting the session.
- Surface failed cloud posts instead of silently leaving the other device waiting.

Validation: production build, shared-version guard, and 164 automated tests, including stalled SSE, polling recovery, retry, and real cloud-failure states.
