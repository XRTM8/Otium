<div align="center">

# Otium

<p align="center">
  <em>otium</em> &nbsp;/ˈoː.ti.um/&nbsp; <sup>n. Latin</sup><br/>
  The time set aside for reading, thought, and rest —<br/>
  as opposed to <em>negotium</em>: work, obligation, noise.
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
  <a href="#about-the-name--فلسفة-الاسم">About the Name</a> &nbsp;·&nbsp;
  <a href="#companion-app-otium-scan--التطبيق-المرافق">Companion App</a> &nbsp;·&nbsp;
  <a href="#project-status--حالة-المشروع">Project Status</a> &nbsp;·&nbsp;
  <a href="#screenshots">Screenshots</a> &nbsp;·&nbsp;
  <a href="#features">Features</a> &nbsp;·&nbsp;
  <a href="#shortcuts">Shortcuts</a> &nbsp;·&nbsp;
  <a href="#build">Build</a>
</p>

</div>

---

https://github.com/user-attachments/assets/1e179513-55d3-469c-a7c8-b31ee67e65fd

A PDF reader for Windows and Android. No accounts, no telemetry, no internet required after installation. Reading state persists locally across sessions.

The interface is available in **English and Arabic** (RTL layout, full right-to-left navigation).

---

## About the Name · فلسفة الاسم

> **Otium** /ˈoː.ti.um/ *(noun, Latin)*: In Roman philosophy, *otium* was the deliberate time dedicated to study, reading, reflection, and quiet intellectual contemplation — the state of tranquil freedom from worldly obligations. Its direct opposite was **negotium** (*nec-otium*), meaning commerce, business, noise, and constant daily bustle.

Most modern document software has become *negotium*: subscription barriers, intrusive analytics, cloud sync accounts, and visual clutter. Otium is built to reclaim that quiet, undisturbed space. Everything runs locally on your machine, your reading habits stay yours, and the interface stays out of your way.

**باللغة العربية:**  
اسم **أوتيوم (Otium)** مستوحى من المفهوم الفلسفي اللاتيني القديم الذي يعبر عن الوقت المخصص للقراءة المتأنية، التفكير الهادئ، والبحث المعرفي بعيداً عن صخب الحياة والالتزامات اليومية (*Negotium*). جاء التطبيق ليعيد تجربة القراءة إلى بساطتها وجوهرها الأصلي: تطبيق محلي بالكامل، بدون إعلانات، وبدون تتبع أو خوادم وسيطة.

---

## Companion App: Otium Scan · التطبيق المرافق

Otium Reader has a dedicated sister application: [**Otium Scan**](https://github.com/XRTM8/Otium-Scan) — an offline, privacy-first mobile document scanner.

```
  [ Physical Book / Notes ] 
             │
             ▼
      Otium Scan          ─── (Direct Export) ───►      Otium Reader
  • Edge detection & crop                           • Dual-page spread mode
  • Document clean filters                          • Annotations & highlights
  • Offline PDF generation                          • Distraction-free reading
```

If you study from physical textbooks or lecture handouts, use **Otium Scan** to photograph and clean your pages into high-contrast PDFs, then open them immediately inside **Otium Reader** with a single tap.

---

## Project Status & Honesty · حالة المشروع

> [!NOTE]
> **Active Development / المشروع قيد التطوير النشط:**  
> This project is a personal, independent open-source endeavor. While it is stable enough for daily reading and academic presentations, **it is still under active development**.  
>  
> You might encounter visual quirks, unhandled PDF formatting edge cases, or platform-specific glitches depending on your hardware, screen aspect ratio, or Android ROM. We do not pretend this is a finished corporate product. If you find a bug, please [open an issue on GitHub](https://github.com/XRTM8/Otium/issues) with your device details and steps to reproduce — your feedback directly shapes the next release.
>  
> **ملاحظة للمستخدمين باللغة العربية:**  
> هذا المشروع عمل شخصي ومفتوح المصدر (FOSS) نابع من الحاجة لقارئ كتب هادئ ومحترم لخصوصية القارئ، وهو قيد التطوير والتحسين المستمر. نظراً لتنوع أجهزة أندرويد واختلاف دقة الشاشات وتفاوت ملفات الـ PDF، قد تواجه بعض الأخطاء أو عدم التناسق في بعض الواجهات. لا ندّعي الكمال التجاري؛ بدلاً من ذلك نرحب بكل ملاحظة أو بلاغ خطأ على صفحة الـ Issues للمساعدة في سد الثغرات وتحسين التجربة للجميع.

---

## Screenshots

<div align="center">
  <img src="./assets/screen-library.png" width="80%" alt="Library" />
  <br/><sub>Library</sub>
  <br/><br/>
  <img src="./assets/screen-reader-dark.png" width="49%" alt="Dual-page — dark" />
  &nbsp;
  <img src="./assets/screen-reader-light.png" width="49%" alt="Dual-page — light" />
  <br/><sub>Dual-page spread — dark theme &nbsp;·&nbsp; light theme</sub>
</div>

---

## Downloads

[**GitHub Releases →**](https://github.com/XRTM8/Otium/releases/latest)

| Platform | File | Notes |
| :--- | :--- | :--- |
| Windows — Installer | `Otium_<version>_x64-setup.exe` | Signed; updates automatically |
| Windows — Portable | `Otium_<version>_x64-portable.exe` | No installation required |
| Android | `Otium_<version>_universal.apk` | ARM64, ARMv7, x86\_64 |

**System requirements**

| | Minimum |
| :--- | :--- |
| Windows | 10 (x64) |
| Android | 7.0 (API 24) |

Each release includes `latest.json`, the version feed used by both updaters. The Android APK is SHA-256 verified before the system installer is invoked — no silent sideloading.

---

## Features

**View modes** — Single page, continuous scroll, or dual-page spread with a centre spine divider. Switch modes at any time without reloading the document.

**Themes** — Eight themes (AMOLED black, Midnight Azure, Warm Amber, Pure Amethyst, Ruby Crimson, Natural Paper, Crystal Diamond, E-Ink). Each theme applies consistently to every surface: toolbars, menus, sidebars, dialogs, and the canvas.

**Display** — Detects screen refresh rate (60–240 Hz) automatically. Renders at the full native pixel ratio with sub-pixel antialiasing.

**Android** — Hardware back button navigates step by step (closes modal → closes document → exits library). Safe-area insets clear the status bar and camera notch. Pinch-to-zoom scales the canvas while UI chrome stays fixed. `.pdf` files open directly from the file manager or any sharing source. Text selection, copy, highlight, and underline via long-press.

**Local-first** — No telemetry, no cloud. Bookmarks, annotations, and reading position stored in IndexedDB.

**Architecture** — One codebase, two platform shells:

```
src/core/       engine · search · annotations · bookmarks · i18n · settings
src/platform/   file I/O · updater · runtime detection
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

**Requirements**

| Tool | Version |
| :--- | :--- |
| Node.js | ≥ 18 |
| Rust | latest stable |
| JDK | 17 *(Android only)* |
| Android SDK + NDK | latest *(Android only)* |

```bash
git clone https://github.com/XRTM8/Otium.git
cd Otium
npm install

# Desktop — development
npm run tauri:dev

# Windows — NSIS installer + portable EXE
# Requires: TAURI_SIGNING_PRIVATE_KEY
npm run tauri:build -- --bundles nsis

# Android — universal APK
# Requires: app/keystore.properties + release keystore
npm run tauri:android

# Verify version consistency across all build inputs
npm run version:check

# Generate latest.json from release-notes.md
npm run release:feed

# Verify hashes and updater signature
node scripts/verify-release.mjs
```

Pushing a `v<version>` tag runs `.github/workflows/release.yml` and produces the Windows installer, portable EXE, and Android APK in a single pipeline.

---

## Contributing

Open an issue before submitting a significant pull request. For bugs, include OS version, app version, and steps to reproduce.

---

## License

GNU General Public License v3.0 — see [`LICENSE`](LICENSE).

<div align="center">
  <br/>
  <sub>Built by <a href="https://github.com/XRTM8">XRTM8</a> &nbsp;·&nbsp; Instagram: <a href="https://instagram.com/ma.xrt">@MA.XRT</a> &nbsp;·&nbsp; GPL-3.0</sub>
</div>
