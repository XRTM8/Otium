# Otium 1.2.0 — Windows + Android

One reader, two editions, one release.

## العربية

- هذا هو أول إصدار موحّد من Otium: تطبيق Windows بتثبيت وتحديث تلقائي، وتطبيق Android بتحديث داخل التطبيق.
- الإصدار نفسه وملاحظات الإصدار نفسها تصلان إلى المنصتين معًا من مصدر واحد.
- محرّك PDF والبحث والتظليل والعلامات المرجعية والإعدادات مشتركة بالكامل بين المنصتين؛ يختلف شكل الواجهة فقط.
- إصدار Windows المثبّت يتحدّث تلقائيًا عبر مثبّت موقّع؛ النسخة المحمولة تنزّل ملف EXE الجديد يدويًا ولا تستبدل نفسها.
- تطبيق Android ينزّل ملف APK ويتحقق من بصمة SHA-256 ثم يفتح مثبّت النظام. لا يوجد تثبيت صامت.
- يصل هذا الإصدار فوق نسخ Android السابقة مباشرة لأن شهادة التوقيع لم تتغير. إن منع النظام التثبيت، فأزل النسخة القديمة ثم ثبّت هذه النسخة.
- يستبدل هذا الإصدار إصداري 1.0 و1.1 السابقين. يمكن لمستخدمي نسخة Windows المحمولة القديمة الانتقال إلى المثبّت للحصول على التحديث التلقائي، أو الاستمرار بالنسخة المحمولة الجديدة.
- ينظّف هذا الإصدار ذاكرة التخزين المؤقت القديمة للتطبيق تلقائيًا، حتى لا تبقى واجهة إصدار سابق ظاهرة بعد التحديث.
- تحسين فتح ملفات PDF الكبيرة، والبحث في الخلفية، والخطوط، وواجهة القراءة على الشاشات الصغيرة.

## English

- This is Otium's first unified release: an auto-updating Windows app and an Android app with in-app updates.
- Both platforms receive the same version and the same release notes from one release feed.
- The PDF engine, search, annotations, bookmarks and settings are fully shared; only the interface shell differs.
- The installed Windows build updates itself through a signed installer; the portable build downloads the new EXE and never replaces itself.
- The Android build downloads the APK, verifies its SHA-256, then opens the system installer. There is no silent sideloading.
- This Android build installs over earlier releases because the signing certificate is unchanged. If the system blocks installation, uninstall the old build and install this one.
- This release replaces the earlier 1.0 and 1.1 releases. Windows users of the old portable EXE can switch to the installer for automatic updates, or keep using the new portable EXE.
- This release clears the app's legacy offline cache automatically, so an older interface can no longer remain on screen after an update.
- Improved large-PDF opening, background search, typography and the reading surface on small screens.
