# Otium 1.4.1 — إصلاحات الهاتف

إصدار تصحيحي صغير للهاتف، مع نفس القارئ على Windows وAndroid.

## العربية

- **لوحة الصفحات من الأسفل.** لم تعد اللوحة تمتد من الحافة العلوية. تفتح الآن كورقة سفلية بارتفاع مريح، بمقبض سحب، وشبكة من ثلاثة أعمدة، وزر «إغلاق اللوحة» ثابت في الأسفل داخل متناول الإبهام. بقي زر الإغلاق العلوي، لكنه لم يعد الطريق الوحيد للإغلاق.
- **إصلاح تحديد النص.** لم يعد التطبيق يلغي التحديد الأصلي فور رفع الإصبع، وهو ما كان يجعل قائمة النسخ والتظليل تختفي قبل أن تظهر. يظهر الآن شريط إجراءات ثابت أسفل الشاشة: تظليل بعدة ألوان، تسطير، نسخ، ملاحظة، بحث، واستماع. يبقى التحديد الأصلي ظاهرًا أثناء استخدام الشريط.
- **شريط التنقل السفلي اختياري.** من «الإعدادات ← نمط القراءة» يمكن إخفاء شريط أرقام الصفحات والأزرار السريعة أو إظهاره. يُحفظ الاختيار بين الجلسات، وتبقى لوحة الصفحات متاحة من قائمة الأدوات.
- **تمرير وتقليب أنعم.** أصبحت إزاحة السحب تُكتب مباشرة في متغيّر CSS عبر `requestAnimationFrame` بدل تحديث حالة React مع كل حركة إصبع. هذا يقلّل إعادة رسم سطح القراءة على شاشات 90/120Hz.
- **تخفيف زخرفة الهاتف.** على الشاشات الصغيرة أصبحت أسطح الواجهة معتمة بلا ضباب خلفي مباشر، وتوقفت حركات التوهج المحيطة، مع احترام إعداد تقليل الحركة في النظام.
- **APK أصغر بنحو 74%.** تُنشر الآن نسخ منفصلة حسب معمارية المعالج إلى جانب الحزمة الشاملة الاحتياطية. نسخة `arm64-v8a` لهاتفك تزن نحو ‎16MB بدل ‎62MB للحزمة الشاملة السابقة، وتُثبَّت أسرع. حتى الحزمة الشاملة انخفضت إلى نحو ‎46MB. نزّل `Otium_1.4.1_arm64-v8a.apk` من صفحة الإصدار. تحديث التطبيق من داخله ما زال يستخدم الحزمة الشاملة احتياطًا؛ سيختار التطبيق النسخة المناسبة تلقائيًا في 1.5.
- **ملاحظة صريحة.** التحديد ما زال يعتمد على WebView في Android. قد تظهر قائمة Android الأصلية (نسخ/مشاركة) مع الشريط المخصص في بعض إصدارات WebView؛ الإجراءات في الشريطين تعمل، وسيُزال التكرار بعد تثبيت السلوك على جهاز فعلي.

## English

- **Pages panel from the bottom.** The panel no longer runs from the top edge. It is now a comfortable bottom sheet with a drag handle, a three-column page grid, and a fixed “Close panel” button within thumb reach. The top close button remains, but is no longer the only way out.
- **Text selection fixed.** The app no longer clears the native selection immediately on pointer-up, which was hiding the copy/highlight menu before it could appear. A fixed bottom action bar now offers highlight colours, underline, copy, note, search, and listen while the native selection stays visible.
- **Optional bottom navigation bar.** Settings → Reading can hide or show the page-number and quick-action bar. The choice persists between sessions, and the pages panel remains available from the tools menu.
- **Smoother scrolling and page turns.** Swipe offset is written to a CSS variable through `requestAnimationFrame` instead of updating React state on every finger movement. This removes a full reading-surface re-render at 90/120Hz.
- **Lighter phone chrome.** Small screens use opaque interface surfaces without live blur, ambient glow animations are disabled, and the system reduced-motion preference is respected.
- **About 74% smaller APK.** Separate per-ABI packages now ship alongside a universal fallback. The `arm64-v8a` package for modern phones is about 16 MB instead of the previous 62 MB universal APK, and installs much faster. Even the universal fallback dropped to about 46 MB. Download `Otium_1.4.1_arm64-v8a.apk` from the release page. In-app updates still fetch the universal APK as a safe fallback; 1.5 will pick the matching ABI automatically.
- **Honest note.** Selection still relies on Android’s WebView. Some WebView versions may show Android’s native copy/share menu alongside the in-app bar; both work, and the duplication will be removed once the behaviour is confirmed on a physical device.
