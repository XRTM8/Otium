<div align="center">

  <a href="https://github.com/XRTM8/Otium">
    <img src="./assets/banner.png" width="100%" alt="Otium — The Quiet Reader" />
  </a>

  <br/>
  <br/>

  # Otium &nbsp;·&nbsp; أوتيوم
  #### The Quiet Reader &nbsp;—&nbsp; قارئ المستندات الهادئ

  <p align="center">
    A high-performance, distraction-free document reader<br/>
    crafted with <strong>Rust · Tauri v2 · React 19</strong><br/>
    <em>Built for deep focus, book-style reading, and ultra-smooth 120 Hz – 240 Hz displays.</em>
  </p>

  <br/>

  <!-- Badges row 1 -->
  <p align="center">
    <a href="https://github.com/XRTM8/Otium/releases/latest">
      <img src="https://img.shields.io/github/v/release/XRTM8/Otium?style=for-the-badge&logo=github&logoColor=white&color=10B981" alt="Latest Release" />
    </a>
    <a href="https://github.com/XRTM8/Otium/releases/latest">
      <img src="https://img.shields.io/github/downloads/XRTM8/Otium/total?style=for-the-badge&logo=github&logoColor=white&color=059669" alt="Total Downloads" />
    </a>
    <a href="https://github.com/XRTM8/Otium/blob/main/LICENSE">
      <img src="https://img.shields.io/badge/License-GPL--3.0-blue?style=for-the-badge&logo=gnu&logoColor=white" alt="License GPLv3" />
    </a>
  </p>

  <!-- Badges row 2 -->
  <p align="center">
    <img src="https://img.shields.io/badge/Platform-Windows%20%7C%20Android-047857?style=for-the-badge&logo=windows&logoColor=white" alt="Platform" />
    <img src="https://img.shields.io/badge/Backend-Rust%20%2B%20Tauri%20v2-000000?style=for-the-badge&logo=rust&logoColor=white" alt="Rust Tauri" />
    <img src="https://img.shields.io/badge/Frontend-React%2019-61DAFB?style=for-the-badge&logo=react&logoColor=black" alt="React 19" />
    <img src="https://img.shields.io/badge/Display-120Hz–240Hz_Native-10B981?style=for-the-badge" alt="High Refresh Rate" />
    <img src="https://img.shields.io/badge/Privacy-100%25_Offline-111827?style=for-the-badge&logo=shieldsdotio&logoColor=white" alt="Local First" />
  </p>

  <br/>

  <!-- Navigation -->
  <p align="center">
    <a href="#-downloads--التحميل-المباشر"><strong>📥 Downloads</strong></a>
    &nbsp;·&nbsp;
    <a href="#-features--الميزات-الرئيسية"><strong>✨ Features</strong></a>
    &nbsp;·&nbsp;
    <a href="#-shortcuts--اختصارات-لوحة-المفاتيح"><strong>⌨️ Shortcuts</strong></a>
    &nbsp;·&nbsp;
    <a href="#-building-from-source--البناء-من-المصدر"><strong>🛠️ Build</strong></a>
    &nbsp;·&nbsp;
    <a href="#-دليل-الاستخدام-بالعربية"><strong>🇸🇦 عربي</strong></a>

  </p>

</div>

---

## 📥 Downloads &nbsp;·&nbsp; التحميل المباشر

Download the latest stable release directly from [**GitHub Releases**](https://github.com/XRTM8/Otium/releases/latest).  
Windows and Android editions share the same version number and release notes — only the shell differs.

| Platform | File | Notes |
| :--- | :--- | :--- |
| **Windows — Installer** | `Otium_<version>_x64-setup.exe` | Signed NSIS installer; updates automatically |
| **Windows — Portable** | `Otium_<version>_x64-portable.exe` | Single executable; replace the file to update |
| **Android — Universal APK** | `Otium_<version>_universal.apk` | ARM64 · ARMv7 · x86\_64; SHA-256 verified |

> **Verification:** Each release publishes a `latest.json` version feed consumed by both the Windows updater and the Android in-app updater. The Android APK download is verified against a SHA-256 hash before the system installer is invoked — no silent sideloading.

---

## ✨ Features &nbsp;·&nbsp; الميزات الرئيسية

### 📖 &nbsp;Dual-Page Book Spread
Authentic book-style reading with a **two-page side-by-side layout** (page `N` and `N+1`) separated by a hairline centre spine divider. Page flips are instantaneous with zero rendering lag. Switch seamlessly between **Continuous Scroll**, **Dual-Book Spread**, and **Single Page** view modes.

### 💎 &nbsp;Dynamic Glass Visual System
Eight hand-crafted reading themes, each expressed through a coherent 3D Frosted-Glass icon with laser-sharp neon rims that adapt every surface — menus, toolbars, sidebars, dialogs, and the page canvas itself.

| Theme | Character |
| :--- | :--- |
| 🟢 **AMOLED Emerald** | Pitch black `#000000` with emerald neon rim — maximum battery saving on OLED |
| 🌌 **Midnight Azure** | Deep cosmic navy with electric cyan radiance |
| 🍯 **Warm Amber** | Blue-light-filtered golden glow — ideal for evening sessions |
| 🔮 **Pure Amethyst** | Royal violet and indigo atmosphere |
| 🌹 **Ruby Crimson** | High-energy ruby glow for critical document review |
| 📜 **Natural Paper & Parchment** | Warm organic cream and historic manuscript tones |
| 💎 **Crystal Diamond** | Pure arctic crystal clarity with zero chromatic distortion |
| 🖨️ **E-Ink Paperwhite** | High-contrast monochrome simulation for outdoor readability |

### ⚡ &nbsp;120 Hz – 240 Hz Hardware Sync & Native DPI
- **Automatic Refresh Calibration:** Detects the display refresh rate (60 / 75 / 90 / 120 / 144 / 165 / 240 Hz) and synchronises scrolling and animations accordingly.
- **Unthrottled Canvas Pipeline:** Full `devicePixelRatio` rendering with high-precision sub-pixel antialiasing. Text is sharp at every zoom level, on every screen.

### 📱 &nbsp;Tailored Mobile & Desktop Experience
- **Smart Back Navigation:** The Android hardware back button closes modals, search, or the open document before exiting — never abruptly terminates the app.
- **Safe-Area Insets:** Toolbars and controls respect the status bar, navigation bar, and camera notch on every device.
- **Vector Pinch-to-Zoom:** Pinch zooms the document canvas directly while all UI chrome remains fixed, sharp, and proportional.
- **1-Click File Associations:** Register `.pdf` files on Windows and Android to open directly in Otium.
- **Native Text Selection:** Long-press or click-drag to select, copy, highlight, or underline text.

### 🔒 &nbsp;100 % Offline & Local-First
- Zero telemetry · Zero tracking · Zero cloud dependencies
- All reading progress, bookmarks, and annotations stored locally via IndexedDB
- The application functions completely without an internet connection after installation

---

## 🧱 One Core, Two Editions &nbsp;·&nbsp; نواة واحدة وإصداران

The repository ships one product with two platform shells, not two independent forks.

```
src/
├── core/        PDF engine · search · storage · annotations · bookmarks · i18n · settings · update rules
├── platform/    Windows and Android transports (file system · updater · runtime detection)
├── app/         Shared reader controller consumed by both shells
└── shells/      DesktopShell and MobileShell — the only platform-specific UI layer

src-tauri/       Single Rust backend with desktop and Android entry points
```

Both shells read the same version from `package.json`, the same release notes from `release-notes.md`, and the same update feed from `latest.json`. A single `v<version>` tag triggers the CI workflow that produces the Windows installer, portable EXE, and Android APK together.

---

## ⌨️ Shortcuts &nbsp;·&nbsp; اختصارات لوحة المفاتيح

| Key | Action |
| :---: | :--- |
| `J` &nbsp;/&nbsp; `↓` &nbsp;/&nbsp; `Space` | Next page / Scroll down (+2 pages in Dual mode) |
| `K` &nbsp;/&nbsp; `↑` | Previous page / Scroll up (−2 pages in Dual mode) |
| `Ctrl + F` | Live search with animated pulse highlights |
| `Ctrl + Mouse Wheel` | Smooth vector zoom in / out |
| `+` &nbsp;/&nbsp; `−` | Zoom in / out |
| `T` | Cycle reading themes |
| `M` | Cycle view modes: Continuous → Dual Spread → Single |
| `F` | Toggle fullscreen |
| `S` | Toggle thumbnails & bookmarks sidebar |
| `Esc` | Step back / Close dialogs / Return to library |

---

## 🇸🇦 دليل الاستخدام بالعربية

**Otium (أوتيوم)** هو قارئ مستندات إلكتروني فائق السرعة، مبني بالكامل على Rust و Tauri v2 و React 19، صُمِّم للقراءة المتأملة والمطالعة العميقة بعيداً عن أي مشتتات.

### 🌟 أبرز الميزات

1. **عرض صفحتين متجاورتين (Dual-Page Book Spread):** محاكاة واقعية لفتح كتاب حقيقي مع عرض صفحتين في آن واحد وانتقال فوري بلا أي تأخير.
2. **هوية بصرية متكاملة (Dynamic Frosted Glass):** ثمانية ثيمات مصممة يدوياً مع أيقونة كتاب زجاجي ثلاثي الأبعاد بحواف نيون متوهجة تلوِّن كل سطح في التطبيق ديناميكياً.
3. **دعم شاشات 120Hz – 240Hz:** يكتشف التطبيق تردد شاشتك تلقائياً ويعرض النصوص بأعلى دقة فيزيائية ممكنة دون أي تغبيش.
4. **تجربة هاتفية متكاملة:**
   - زر الرجوع يعود خطوة بخطوة بدلاً من إغلاق التطبيق مباشرة.
   - التصميم يحترم مساحة شريط الحالة وفتحة الكاميرا.
   - تكبير متجهي دقيق (Pinch-to-Zoom) يُكبِّر الصفحة وحدها مع بقاء الأزرار بنفس الحجم والوضوح.
   - تحديد ونسخ وتظليل النصوص بالضغط المطوَّل.
   - فتح ملفات PDF تلقائياً عند النقر عليها في مدير الملفات أو تطبيقات المراسلة.
5. **خصوصية مطلقة (100% Local-First):** لا يتطلب اتصالاً بالإنترنت، لا تتبع، لا تحليلات، ويحفظ آخر صفحة في كل كتاب تلقائياً.

---

## 🛠️ Building from Source &nbsp;·&nbsp; البناء من المصدر

### Prerequisites

| Tool | Version |
| :--- | :--- |
| [Node.js](https://nodejs.org/) | v18 or later |
| [Rust](https://www.rust-lang.org/) | latest stable |
| JDK | 17 (Android only) |
| Android SDK & NDK | Latest (Android only) |

```bash
# 1. Clone
git clone https://github.com/XRTM8/Otium.git
cd Otium

# 2. Install dependencies
npm install

# 3. Development (Desktop)
npm run tauri:dev

# 4. Build — signed Windows installer + portable EXE
#    Requires TAURI_SIGNING_PRIVATE_KEY for updater artifacts.
npm run tauri:build -- --bundles nsis

# 5. Build — signed Android Universal APK
#    Requires app/keystore.properties and the release keystore.
npm run tauri:android

# 6. Verify all build inputs share one version
npm run version:check

# 7. Stage artifacts and generate latest.json from release-notes.md
npm run release:feed

# 8. Verify published feed, hashes, and updater signature
node scripts/verify-release.mjs
```

> Pushing a `v<version>` tag triggers `.github/workflows/release.yml`, which builds both editions and publishes them with shared release notes and a `latest.json` update feed. The workflow requires the updater signing key and Android keystore secrets declared in that file.

---

## 🤝 Contributing

Contributions are welcome. Please open an issue to discuss significant changes before submitting a pull request. For bug reports, include your OS version, app version, and steps to reproduce.

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/your-feature`
3. Commit your changes with clear messages
4. Push to your fork and open a Pull Request

---

## 📄 License

```
Otium — The Quiet Reader
Copyright (C) 2024 – 2026  XRTM8

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU General Public License for more details.

You should have received a copy of the GNU General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.
```

See [`LICENSE`](LICENSE) for the full text.

---

<div align="center">
  <sub>Built with care by <a href="https://github.com/XRTM8">XRTM8</a> &nbsp;·&nbsp; Released under the GNU GPL v3 &nbsp;·&nbsp; 2024 – 2026</sub>
</div>
