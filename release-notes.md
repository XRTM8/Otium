# Otium 1.8.14 — Smart Beam reliability

- Preserve WebRTC candidates received before the offer.
- Use short polling with a replay cursor when streaming signaling stalls or fails.
- Deliver disconnect over the direct and local channels before teardown.
- Ignore stale signaling downloads and old peer callbacks after cancellation.
- Prevent cancelled transfers from reporting success or falling back to cloud upload.
- Send control traffic directly once WebRTC opens to reduce public relay usage.
- Distinguish signaling readiness from a paired phone; force a fresh connection on retry.

Update both devices. The web version deploys separately via GitHub Pages. Pairing still depends on ntfy.sh availability and quotas. Physical Android/Windows interoperability must be verified on the target network.
