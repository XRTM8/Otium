<div align="center">

  <a href="https://github.com/XRTM8/Otium">
    <img src="./assets/banner.png" width="100%" alt="Otium - The Quiet Reader" style="border-radius: 18px; box-shadow: 0 16px 50px rgba(0, 0, 0, 0.7); margin-bottom: 24px;" />
  </a>

  # Otium (أوتيوم)
  ### The Quiet Reader • قارئ المستندات الهادئ

  <p align="center">
    <b>A high-performance, distraction-free document reader crafted with Rust, Tauri v2, and React 19.</b><br>
    <i>Designed for deep focus, tactile book reading, and ultra-smooth 120Hz–240Hz displays.</i>
  </p>

  <p align="center">
    <a href="https://github.com/XRTM8/Otium/releases/latest">
      <img src="https://img.shields.io/github/v/release/XRTM8/Otium?style=for-the-badge&logo=github&logoColor=white&color=10B981" alt="Latest Release" />
    </a>
    <a href="https://github.com/XRTM8/Otium/releases/latest">
      <img src="https://img.shields.io/badge/Platform-Windows%20%7C%20Android-047857?style=for-the-badge&logo=windows&logoColor=white" alt="Platform" />
    </a>
    <img src="https://img.shields.io/badge/Rust-Tauri_v2-black?style=for-the-badge&logo=rust&logoColor=white" alt="Rust Tauri" />
    <img src="https://img.shields.io/badge/Display-120Hz--240Hz_Native-emerald?style=for-the-badge" alt="High Refresh Rate" />
    <img src="https://img.shields.io/badge/Privacy-100%25_Offline-000000?style=for-the-badge&logo=shield" alt="Local First" />
    <img src="https://img.shields.io/badge/License-MIT-blue?style=for-the-badge" alt="License" />
  </p>

  <p align="center">
    <a href="#-downloads--التحميل-المباشر">📥 Downloads</a> •
    <a href="#-features--الميزات-الرئيسية">✨ Features</a> •
    <a href="#-shortcuts--اختصارات-لوحة-المفاتيح">⌨️ Shortcuts</a> •
    <a href="#-building-from-source--البناء-من-المصدر">🛠️ Building</a> •
    <a href="#-دليل-الاستخدام-بالعربية"> دليل بالعربية</a>
  </p>

</div>

---

## 📥 Downloads • التحميل المباشر

Get the latest release from [**GitHub Releases**](https://github.com/XRTM8/Otium/releases/latest). Windows and Android share the same version and release notes; only the interface differs.

| Platform | Asset | Description |
| :--- | :--- | :--- |
| **Windows** | `Otium_<version>_x64-setup.exe` | Signed installer with automatic updates |
| **Windows (Portable)** | `Otium_<version>_x64-portable.exe` | Standalone executable; download the new file to update |
| **Android** | `Otium_<version>_universal.apk` | Universal APK for ARM64, ARMv7 and x86_64 devices |

Each release also publishes `latest.json`, the shared version feed used by both updaters.

---

## ✨ Features • الميزات الرئيسية

### 📖 Dual-Page Book Spread (عرض الكتاب الحقيقي)
Experience authentic reading with a **two-page side-by-side spread** (`N` & `N+1`) featuring a subtle center spine divider and instant zero-lag page flips. Easily switch between Continuous Scroll, Dual Book, or Single Page modes.

### 💎 Ultra-HD Dynamic Glass Visual Identity (الهوية البصرية المتكاملة)
A signature **3D Frosted Glass Book** with razor-sharp glowing neon rims and ambient radiance that dynamically transforms its colors across reading themes:
* 🟢 **AMOLED Emerald:** Pitch black (`#000000`) with emerald neon rim for battery preservation.
* 🌌 **Midnight Azure:** Deep cosmic navy with soothing electric cyan radiance.
* 🍯 **Warm Amber:** Blue-light filtered golden glow for evening reading.
* 🔮 **Pure Amethyst:** Royal violet and indigo atmosphere.
* 🌹 **Ruby Crimson:** High-energy ruby glow for critical document review.
* 📜 **Natural Paper & Parchment:** Warm, organic cream & historic manuscript tones.
* 💎 **Crystal Diamond:** Pure arctic crystal clarity with zero chromatic distortion.
* 🖨️ **E-Ink Paperwhite:** High-contrast monochrome simulation for outdoor readability.

### ⚡ 120Hz – 240Hz Hardware Sync & Razor-Sharp DPI
* **Dynamic Refresh Calibration:** Automatically detects your display's refresh rate (60Hz, 75Hz, 90Hz, 120Hz, 144Hz, 165Hz, 240Hz) for fluid scrolling.
* **True Native Resolution:** Completely unthrottled `devicePixelRatio` canvas pipeline with high-precision subpixel antialiasing. No blurry text, ever.

### 📱 Tailored Mobile & Desktop Experience
* **Smart Back Navigation:** Hardware Android back button steps back gracefully (closes modals/search/doc first) instead of abruptly quitting.
* **Safe-Area Notch Inset:** Top navigation bar and controls gracefully clear the phone status bar and camera notch.
* **Vector Pinch-to-Zoom:** Zooming pinches the document vector canvas directly while toolbars, buttons, and menus stay fixed, sharp, and proportional.
* **1-Click System Associations:** Associate `.pdf` files on Windows and Android to launch directly into Otium.
* **Native Text Selection:** Long-press or click-drag to select, copy, highlight, or underline text.

### 🔒 100% Offline & Local-First
* Zero telemetry, zero tracking, zero cloud dependencies.
* All reading progress, bookmarks, and annotations are stored locally via IndexedDB.

---

## 🧱 One Core, Two Editions • نواة واحدة وإصداران

The repository contains one product, not two forks:

```
src/core/       PDF engine, search, storage, annotations, bookmarks, i18n, settings, update rules
src/platform/   Windows and Android transports (files, updates, runtime detection)
src/app/        Shared reader controller used by both shells
src/shells/     DesktopShell and MobileShell — the only platform-specific UI
src-tauri/      One Rust backend with desktop and Android entry points
```

Both shells read the same version from `package.json`, the same notes from `release-notes.md`, and the same feed from `latest.json`. A release tag builds the Windows installer, the portable EXE and the Android APK together.

---

## ⌨️ Shortcuts • اختصارات لوحة المفاتيح

| Shortcut | Action |
| :---: | :--- |
| `J` / `↓` / `Space` | Next Page / Scroll Down (+2 pages in Dual Mode) |
| `K` / `↑` | Previous Page / Scroll Up (-2 pages in Dual Mode) |
| `Ctrl + F` | Live Search with animated pulse highlights |
| `Ctrl + Mouse Wheel` | Smooth Vector Zoom In / Zoom Out |
| `+` / `-` | Zoom In / Out |
| `T` | Cycle through reading themes |
| `M` | Cycle View Modes (Continuous ➔ Dual Spread ➔ Single) |
| `F` | Toggle Fullscreen |
| `S` | Toggle Page Thumbnails & Bookmarks Sidebar |
| `Esc` | Back step / Close dialogs / Return to Library |

---

##  دليل الاستخدام بالعربية

**Otium (أوتيوم)** هو قارئ كتب ومستندات إلكتروني فائق السرعة، صُمم خصيصاً للقراءة المتأملة والمطالعة العميقة دون أي مشتتات، مبني بالكامل بأحدث تقنيات Rust و Tauri v2 و React 19.

### 🌟 أبرز ما يميز التطبيق:
1. **عرض صفحتين متجاورتين (Dual-Page Spread):** محاكاة واقعية ورائعة لفتح كتاب حقيقي وتقليب صفحتين في آن واحد دون أي تأخير أو حركات بطيئة.
2. **السبورة الذكية وأدوات الشرح (Smart Board):** الكتابة والتظليل المباشر فوق صفحات المستند، مع ممحاة ذكية، ومؤشر ليزر نابض للمحاضرات والشروحات، ومسودة جانبية (Scratchpad) للعمليات السريعة.
3. **هوية بصرية متكاملة وثيمات متغيرة (Dynamic Frosted Glass):** أيقونة ورمز كتاب من الزجاج المصنفر ثلاثي الأبعاد بحواف ليزرية متوهجة تتغير ألوانها ديناميكياً مع ثيم القراءة النشط (الزمردي، الأزرق السماوي، العنبر، الأرجواني، الورق العتيق، الألماسي، والحبر الإلكتروني).
4. **دعم الشاشات السريعة (120Hz - 240Hz):** يتزامن التطبيق تلقائياً مع تردد شاشتك ويعرض النصوص بأعلى دقة فيزيائية (Full DPR) لمنع أي تشويش أو تغبيش.
5. **تجربة هاتف ذكية ومتكاملة:**
   - زر الرجوع في الهاتف يعود خطوة واحدة إلى الوراء بدلاً من إغلاق التطبيق.
   - شريط الأدوات العلوي يبتعد تلقائياً عن شريط الإشعارات (البردة) وفتحة الكاميرا.
   - تكبير متجهي ذكي (Pinch-to-zoom) يُكبّر صفحة الكتاب فقط مع الحفاظ على صغر وأناقة القوائم والأزرار.
   - تحديد ونسخ وتظليل النصوص بالضغط المطول.
   - فتح أي ملف PDF تلقائياً بمجرد النقر عليه من مدير الملفات أو واتساب.
6. **خصوصية مطلقة (100% Local-First):** لا يحتاج إلى إنترنت، لا يحتوي على أي تتبّع، ويحفظ آخر صفحة وصلت إليها في كل كتاب تلقائياً.

---

## 🛠️ Building from Source • البناء من المصدر

### Prerequisites
- [Node.js](https://nodejs.org/) (v18+)
- [Rust](https://www.rust-lang.org/) (latest stable)
- For Android: JDK 17, Android SDK & NDK

```bash
# 1. Clone the repository
git clone https://github.com/XRTM8/Otium.git
cd Otium

# 2. Install dependencies
npm install

# 3. Run development mode (Desktop)
npm run tauri:dev

# 4. Build the signed Windows installer + portable EXE
#    Requires TAURI_SIGNING_PRIVATE_KEY for updater artifacts.
npm run tauri:build -- --bundles nsis

# 5. Build the signed Android Universal APK
#    Requires app/keystore.properties and the release keystore.
npm run tauri:android

# 6. Verify that every build input shares one version
npm run version:check

# 7. Stage artifacts and generate latest.json from release-notes.md
npm run release:feed
```

Pushing a `v<version>` tag runs `.github/workflows/release.yml`, which builds both editions and publishes them with the same release notes and `latest.json`. The workflow needs the updater signing key and Android keystore secrets listed in that file.

---

## 📄 License

Distributed under the **MIT License**. Crafted with passion by [XRTM8](https://github.com/XRTM8).
