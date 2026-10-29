# Smart Beam 1.8.14 acceptance

Automated: run npm test, npm run build, and npm run version:check -- v1.8.14.

Physical device validation is still required:

- Install the new Android and Windows versions, and open a fresh web tab.
- On the same router, pair Android to web and Android to Windows. Send a small and a large PDF; confirm document content and page controls.
- Cancel while connecting and while sending, from each side. No cancelled operation should report success or change the next session.
- Interrupt streaming while permitting ordinary HTTPS; verify polling fallback, retry, and cleanup.
- Interrupt and restore the network, then retry pairing.

Pairing and attachment fallback still use ntfy.sh, including its availability and quotas. A separately hosted signaling service and authenticated TURN relay would be required to eliminate that dependency and support restrictive networks. Those services are not provisioned in this release.

Reference: https://docs.ntfy.sh/subscribe/api/#poll-for-messages
