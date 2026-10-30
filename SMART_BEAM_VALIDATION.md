# Smart Beam and PDF ink 1.9.0 acceptance

Automated: run npm test, npm run build, and npm run version:check -- v1.9.0.

Physical device validation is still required:

- Install the new Android and Windows versions, and open a fresh web tab.
- On the same router, pair Android to web and Android to Windows. Send a small and a large PDF; confirm document content and page controls.
- Cancel while connecting and while sending, from each side. No cancelled operation should report success or change the next session.
- Interrupt streaming while permitting ordinary HTTPS; verify polling fallback, retry, and cleanup.
- Interrupt and restore the network, then retry pairing.
- After disconnect, the board retains its room but clears the phone name and paired indicator. Delayed handshakes from the closed session must not restore it.
- Draw, highlight, add/edit/delete a note, erase, undo and redo over a PDF page. Zoom, change pages, and reopen the file; annotations must stay on the correct page and position.
- Pair two updated devices and verify annotations synchronize. Local undo must preserve marks from the other device.
- Export a PDF copy and verify marks, original page content, page count, rotation, crop boxes, and source preservation.

Pairing and attachment fallback still use ntfy.sh, including its availability and quotas. A separately hosted signaling service and authenticated TURN relay would be required to eliminate that dependency and support restrictive networks. Those services are not provisioned in this release.

Reference: https://docs.ntfy.sh/subscribe/api/#poll-for-messages
