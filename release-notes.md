# Otium 1.8.14 — Smart Beam pairing and confirmed PDF opening

- Fix PDF font, CMap and image-decoder resource paths on GitHub Pages under /Otium/. Origin-root paths returned 404.
- Wait for the receiving reader to open the document before reporting transfer success, for direct and cloud transfers.
- Report receiver PDF-opening failures to the sender and keep the receiver error visible.
- Close the receiving dialog only after opening succeeds.
- Preserve early WebRTC candidates and use cursor-based short polling when streaming signaling stalls.
- Deliver disconnect directly and ignore stale callbacks after cancellation.
- Distinguish signaling readiness from an actually paired phone.

Both devices must load the new web version or update their application. Pairing still depends on ntfy.sh availability and quotas; no independent signaling or TURN service is provisioned. Physical phone-to-PC acceptance remains required.
