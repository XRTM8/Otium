<div align="center">

<a href="https://github.com/XRTM8/Otium">
  <img src="./assets/banner.png" width="100%" alt="Otium" />
</a>

<br/><br/>

# Otium

<p align="center">
  <em>otium</em> &nbsp;/ˈoː.ti.um/&nbsp; <sup>Latin</sup> — the time one reserves for reading, thought, and rest.<br/>
  As opposed to <em>negotium</em>: business, obligation, noise.
</p>

<br/>

<p align="center">
  <a href="https://github.com/XRTM8/Otium/releases/latest">
    <img src="https://img.shields.io/github/v/release/XRTM8/Otium?style=flat-square&color=10B981&label=release" alt="Release" />
  </a>
  &nbsp;
  <img src="https://img.shields.io/badge/platform-Windows%20·%20Android-10B981?style=flat-square" alt="Platform" />
  &nbsp;
  <img src="https://img.shields.io/badge/stack-Rust%20·%20Tauri%20v2%20·%20React%2019-111827?style=flat-square" alt="Stack" />
  &nbsp;
  <a href="LICENSE">
    <img src="https://img.shields.io/badge/license-GPL--3.0-blue?style=flat-square" alt="License" />
  </a>
</p>

<p align="center">
  <a href="#downloads">Downloads</a> &nbsp;·&nbsp;
  <a href="#features">Features</a> &nbsp;·&nbsp;
  <a href="#shortcuts">Shortcuts</a> &nbsp;·&nbsp;
  <a href="#build">Build</a>
</p>

</div>

---

A PDF reader for Windows and Android. No accounts, no telemetry, no internet required. Reading state is stored locally and persists across sessions.

---

## Screenshots

<table>
  <tr>
    <td><img src="./assets/screen-library.png" alt="Library" /></td>
    <td><img src="./assets/screen-reader-dark.png" alt="Reader — dark theme" /></td>
  </tr>
  <tr>
    <td align="center"><sub>Library</sub></td>
    <td align="center"><sub>Dual-page spread — dark theme</sub></td>
  </tr>
  <tr>
    <td colspan="2"><img src="./assets/screen-reader-light.png" alt="Reader — light theme" /></td>
  </tr>
  <tr>
    <td colspan="2" align="center"><sub>Dual-page spread — light theme</sub></td>
  </tr>
</table>

---

## Downloads

Latest stable release: [**GitHub Releases →**](https://github.com/XRTM8/Otium/releases/latest)

| Platform | File | Notes |
| :--- | :--- | :--- |
| Windows — Installer | `Otium_<version>_x64-setup.exe` | Signed; updates automatically |
| Windows — Portable | `Otium_<version>_x64-portable.exe` | No installation required |
| Android | `Otium_<version>_universal.apk` | ARM64, ARMv7, x86\_64 |

Each release includes `latest.json`, the version feed used by both updaters. The Android APK is SHA-256 verified before the system installer is invoked.

---

## Features

**Dual-page spread** — side-by-side layout with a centre spine divider. Switch between Continuous Scroll, Dual Spread, and Single Page at any time.

**Eight reading themes** — each theme colours every surface consistently: toolbars, menus, sidebars, and the page canvas. Includes AMOLED black, paper tones, and E-Ink simulation.

**Display sync** — detects the screen refresh rate (60–240 Hz) and renders at the full native pixel ratio. No blurry text, no throttling.

**Mobile** — hardware back button navigates in steps (closes modal → closes document → exits). Safe-area insets clear the status bar and notch. Pinch-to-zoom scales the canvas; UI chrome stays fixed. `.pdf` files open directly from the file manager or messaging apps.

**Local-first** — no telemetry, no cloud. Bookmarks, annotations, and reading position stored in IndexedDB.

**One codebase, two platforms:**
```
src/core/       engine, search, annotations, bookmarks, i18n, settings
src/platform/   platform transports (file I/O, updater, runtime)
src/app/        shared reader controller
src/shells/     DesktopShell · MobileShell
src-tauri/      Rust backend
```

---

## Shortcuts

| Key | Action |
| :---: | :--- |
| `J` / `↓` / `Space` | Next page |
| `K` / `↑` | Previous page |
| `Ctrl+F` | Search |
| `Ctrl+Wheel` | Zoom |
| `T` | Cycle themes |
| `M` | Cycle view modes |
| `F` | Fullscreen |
| `S` | Sidebar |
| `Esc` | Back / close |

---

## Build

**Requirements:** Node.js ≥ 18, Rust (stable). Android builds additionally require JDK 17 and Android SDK + NDK.

```bash
git clone https://github.com/XRTM8/Otium.git
cd Otium
npm install

# Desktop (dev)
npm run tauri:dev

# Windows — NSIS installer + portable EXE
# Requires TAURI_SIGNING_PRIVATE_KEY
npm run tauri:build -- --bundles nsis

# Android — universal APK
# Requires app/keystore.properties
npm run tauri:android

# Verify version consistency across all build inputs
npm run version:check

# Generate latest.json from release-notes.md
npm run release:feed

# Verify hashes and updater signature
node scripts/verify-release.mjs
```

Pushing a `v<version>` tag runs `.github/workflows/release.yml`, which produces the Windows installer, portable EXE, and Android APK in a single pipeline.

---

## Contributing

Open an issue before submitting a significant pull request. For bugs, include the OS version, app version, and reproduction steps.

---

## License

GNU General Public License v3.0 — see [`LICENSE`](LICENSE).

<div align="center">
  <br/>
  <sub><a href="https://github.com/XRTM8">XRTM8</a> · GPL-3.0 · 2024–2026</sub>
</div>
