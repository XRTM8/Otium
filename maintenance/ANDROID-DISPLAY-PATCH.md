# Android display patch — 1.9.15

## User-facing setup

Open Settings → Reading → **Use this device as**:

- **Automatic:** recognizes native Android TV and common TV browser hints. Ordinary Android devices keep personal-reader defaults.
- **Display / television:** defaults to receiving when opening a new Beam session, with directional remote navigation.
- **Interactive whiteboard:** expands teacher controls and defaults to receiving; touch and stylus remain supported.
- **Personal reader / controller:** retains compact study controls and sender defaults.

Enable **Smart whiteboard** separately to expose its button and the split workspace. Both choices are stored on this device. A role change does not replace the mounted reader, reset its document, or disconnect an existing Beam session. Generic Android boards that identify as a tablet should be configured manually once.

The browser home page now has a fullscreen toggle. Browser support and user activation rules still apply; an unsupported/blocked request produces a visible message. Native Android remains immersive through its existing system-bar bridge.

## Implementation boundaries

- Android's existing shell now mounts the actual shared BoardSplitWorkspace and can route toolbar/Beam actions into it. This is not just a settings toggle fix.
- Role preferences are independent of Android/Windows/Web platform detection and viewport width. Native Android is recognized by its bridge even with a desktop user agent.
- TV detection reads Android configuration through the local OtiumUi bridge. Touchscreen is optional in the manifest.
- Beam defaults respect existing sessions and QR launch roles. Ordinary desktop documents still default to sending.
- Remote direction follows physical screen coordinates, stays inside visible modal dialogs, and avoids intercepting text editing. Enter repeat is ignored.
- The main source tree and release contain no experimental media viewer or Office integration.

## Verification

Automated regression checks cover saved/invalid device roles, native TV hints, desktop-UA Android, role changes and resize without remount, Android whiteboard opt-in and persistence, physical remote direction/modal boundaries/Enter repeat, Beam defaults, and homepage fullscreen/escape/error handling. Production build, version consistency, and npm audit are checked before release.

Real hardware acceptance remains: install the APK on Android TV and a touch board; choose the role, enable the board, pair by QR, receive a PDF, draw and erase, change pages from the phone, rotate the phone, hide/restore controls, operate TV menus by D-pad and Back, and restart to verify persistence. CI packaging and DOM tests do not prove hardware-specific remote or WebView behaviour.
