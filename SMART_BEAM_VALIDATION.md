# Teacher workspace, Smart Beam and PDF ink 1.9.2 acceptance

Automated: run npm test, npm run build, and npm run version:check -- v1.9.2.

Teacher workspace checks:

- Check the bottom dock at 320px phone width and on a large physical board. No overlapping touch targets or hidden restore button.
- Move the dock left/right, adjust height and size, select pen width/color/stylus-only, reload and verify device preferences.
- Toggle document/whiteboard repeatedly and use the split divider. Marks, pages and clips must remain intact and the active writing target must be clear.
- Clear a board page, cancel the confirmation, then confirm it. Undo must restore erased and cleared ink; redo must repeat the action.
- Close/reopen a document and reload the app. Its own saved board pages, backgrounds, history and clips must return without another document's data.
- Enter student presentation and restore tools from the reachable bottom button; test fullscreen separately.
- Pair two updated devices. Delivery status must wait for a receipt rather than a successful local send. Disconnect, reconnect and repeat.
- Test stylus and palm input on actual hardware. Automated DOM tests verify filtered input but cannot establish hardware palm rejection or physical reach.

React interaction tests cover target switching, confirmation/undo/remount, presentation, phone tools, stylus-only input, and delivery receipts. Computer Use browser inspection was stopped because the tool could not establish the current URL; this release has not been visually inspected through that tool.

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
- In Navigate mode, scrolling must not select text, hide controls, or turn a paged document. Pinch should zoom without a subsequent tap/page action.
- Choose Select text explicitly on the phone; verify the temporary spotlight and persistent highlight/underline appear on the receiving board.
- Verify text highlights survive export and selection updates from old sessions or different documents are ignored.
- Check the split pane fits at its own width and reduced-motion mode disables decorative transitions.

Pairing and attachment fallback still use ntfy.sh, including its availability and quotas. A separately hosted signaling service and authenticated TURN relay would be required to eliminate that dependency and support restrictive networks. Those services are not provisioned in this release.

Reference: https://docs.ntfy.sh/subscribe/api/#poll-for-messages
