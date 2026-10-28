<div align="center">

<img src="./public/favicon.svg" width="88" height="88" alt="Otium Logo" />

# Otium

<p align="center">
  <strong>The sovereign, distraction-free document reader & studio scanner.</strong><br/>
  <em>قارئ هادئ وماسح مستندات حر بدون تتبع أو إعلانات أو سحابة</em>
</p>

<p align="center">
  <a href="https://github.com/XRTM8/Otium/releases/latest">
    <img src="https://img.shields.io/github/v/release/XRTM8/Otium?style=flat-square&color=10B981&label=Release" alt="Release" />
  </a>
  &nbsp;
  <img src="https://img.shields.io/badge/Platform-Windows%20·%20Android-10B981?style=flat-square" alt="Platform" />
  &nbsp;
  <img src="https://img.shields.io/badge/Engine-Rust%20·%20Tauri%20v2%20·%20React%2019-111827?style=flat-square" alt="Engine" />
  &nbsp;
  <img src="https://img.shields.io/badge/Privacy-100%25%20Offline-10B981?style=flat-square" alt="Offline" />
  &nbsp;
  <a href="LICENSE">
    <img src="https://img.shields.io/badge/License-GPL--3.0-111827?style=flat-square" alt="License" />
  </a>
</p>

<p align="center">
  <a href="#overview">Overview</a> &nbsp;·&nbsp;
  <a href="#features">Features</a> &nbsp;·&nbsp;
  <a href="#downloads">Downloads</a> &nbsp;·&nbsp;
  <a href="#shortcuts">Shortcuts</a> &nbsp;·&nbsp;
  <a href="#build">Build</a>
</p>

</div>

---

<div align="center">
  <img src="./assets/screen-library.png" width="82%" alt="Otium Library" />
  <br/><br/>
  <img src="./assets/screen-reader-dark.png" width="48%" alt="Dual-page spread — Dark" />
  &nbsp;
  <img src="./assets/screen-reader-light.png" width="48%" alt="Dual-page spread — Light" />
</div>

---

## Overview

> **Otium** /ˈoː.ti.um/ *(noun, Latin)*: The deliberate time set aside for reading, contemplation, and study — tranquil freedom from *negotium* (commerce, obligation, and noise).

Most modern document software has become *negotium*: subscription walls, intrusive telemetry, cloud lock-in, and visual clutter. **Otium** is designed to reclaim that quiet, undisturbed space.

Unified in version 1.6.0, Otium brings together a distraction-free long-form reading environment and an on-device document capture studio into a single sovereign application for Windows and Android. Everything runs strictly on your machine — zero accounts, zero analytics, zero external network requests.

---

## Features

### 📖 Calm Reader
- **Fluid View Modes** — Seamlessly toggle between single-page view, smooth continuous scroll, and dual-page book spread with a subtle spine divider.
- **Bilingual Typography** — Native bidirectional RTL and LTR support with first-class Arabic (Amiri, Almarai, Cairo, Tajawal) and Latin (Plus Jakarta Sans, Lora) typefaces.
- **8 OLED Themes** — Obsidian Black, Midnight Azure, Warm Amber, Pure Amethyst, Ruby Crimson, Natural Paper, Crystal Diamond, and high-contrast E-Ink.
- **Local Annotations** — In-document full-text search, highlights, underlines, and bookmarks stored locally in IndexedDB.

### 📷 Studio Scanner
- **120 FPS Viewfinder** — Hardware-accelerated camera stream with instant tap-to-focus and flash controls.
- **Intelligent Processing** — Real-time corner detection, 4-point perspective warp, and high-contrast document clean filters.
- **On-Device OCR** — 100% offline text recognition powered by local Tesseract WASM — your captured documents never leave your device.
- **Batch & ID Cards** — Multi-page batch document capture and automated dual-sided ID card merging onto standard A4 format.

### 🛡️ Sovereign & Private
- **Zero Telemetry** — No tracking scripts, no third-party APIs, no cloud sync requirements.
- **Encrypted Local Vault** — Secure local document storage with optional PIN/password protection.
- **State Preservation** — Automatically remembers reading progress, zoom scale, and page layout per document across sessions.

---

## Downloads

Official binary releases are available on [**GitHub Releases →**](https://github.com/XRTM8/Otium/releases/latest)

| Platform | Format | Description |
| :--- | :--- | :--- |
| **Windows** | `Otium_<version>_x64-setup.exe` | Standard Windows installer with integrated auto-updater |
| **Windows** | `Otium_<version>_x64-portable.exe` | Portable standalone executable (no installation required) |
| **Android** | `Otium_<version>_universal.apk` | Universal APK supporting ARM64, ARMv7, and x86_64 devices |

> Every release is signed and includes `SHA256SUMS.txt` for cryptographic integrity verification.

---

## Shortcuts

| Shortcut | Action |
| :---: | :--- |
| `Space` / `J` / `↓` | Next page |
| `K` / `↑` | Previous page |
| `Ctrl + F` | Search in document |
| `Ctrl + Shift + S` | Open Studio Scanner |
| `T` | Cycle visual themes |
| `M` | Cycle view modes |
| `F` | Toggle fullscreen |
| `S` | Toggle sidebar / bookmarks |
| `Esc` | Back / Close modal |

---

## Build

**Prerequisites:** Node.js (≥ 18) and Rust (latest stable).

```bash
# Clone repository
git clone https://github.com/XRTM8/Otium.git
cd Otium

# Install dependencies
npm install

# Run Desktop in development
npm run tauri:dev

# Build Windows (NSIS Installer + Portable EXE)
npm run tauri:build -- --bundles nsis

# Build Android (Universal APK)
npm run tauri:android

# Verify test suite & version integrity
npm test
npm run version:check
```

---

<div align="center">
  <br/>
  <sub>Crafted by <a href="https://github.com/XRTM8">XRTM8</a> &nbsp;·&nbsp; Instagram: <a href="https://instagram.com/ma.xrt">@MA.XRT</a></sub>
  <br/>
  <sub>Licensed under <a href="LICENSE">GPL-3.0</a></sub>
  <br/><br/>
</div>
