# Otium 2.0.9 — تبسيط الواجهة وإزالة الفوضى، وأيقونة الكاست الدائرية، والقضاء على الشاشة السوداء

- تصميم فائق التبسيط والنقاء (Zero-Clutter Architecture): إزالة الازدحام البصري والتكرار في الواجهة الرئيسية بحصر إجراء "فتح ملف" في الزر البارز داخل الشريط السفلي وإلغاء الأزرار العلوية المكررة بجوار العناوين في الرئيسية والمكتبة.
- أيقونة الكاست الدائرية العلوية (Header Circular Cast Action): نقل ميزة "بث واستقبال السبورة" (Smart Beam & Cast) لتصبح زراً دائرياً زجاجياً مصنفراً وموحداً في الشريط العلوي بجوار تبديل اللغة والإعدادات والمظهر، بما يتيح الوصول السريع إليها من أي مكان دون أن تشغل بطاقة ضخمة تعيق تصفح الملفات.
- حصر الماسح في الشريط السفلي: إزالة بطاقات الأدوات الضخمة من مساحة القراءة، ليصبح الماسح متاحاً بنقرة واحدة مباشرة من كبسولة الشريط السفلي العائم.
- توسيع بطاقة متابعة القراءة (Full-Width Hero Resume): أصبحت بطاقة آخر مستند مفتوح تمتد بعرض الشاشة بجمالية طباعية فاخرة تعرض غلاف الكتاب ونسبة التقدم الحقيقية مع زر متابعة دائري مرن.
- القضاء النهائي على الشاشة السوداء عند فتح التطبيق: معالجة الإلغاء المبكر لشاشة البداية، وربط إشارة الجاهزية `notifyAppReady` بإنهاء رسم الإطار الأول للواجهة عبر إطارين متتاليين من `requestAnimationFrame`، مع إضافة شعار Otium الذهبي النابض في حالة الانتظار.
- حل تداخل الشريط السفلي العائم مع الملفات الأخيرة: توسيع هامش التمرير السفلي في الهواتف (`padding-bottom: calc(max(1.5rem, env(safe-area-inset-bottom)) + 7.5rem)`) لتمرير كامل القائمة بحرية تامة وظهور آخر ملف وأزرار الحذف واضحة فوق الشريط.
- شريط تنقل سفلي عائم متناسق (Harmonious Mobile Dock): كبسولة زجاجية مصنفرة متوازنة 25% لكل عنصر (الرئيسية · المكتبة · فتح ملف · الماسح) مع مؤشر انزلاق زنبركي انسيابي مدعوم بالاهتزاز اللمسي الميكروي (Tactile Haptics).
- إصلاح إيماءة وزر الرجوع في نظام أندرويد (Hardware Back Button Fix): ربط مكدس التنقل الداخلي LIFO بجسر أندرويد الأصلي `__OTIUM_HANDLE_BACK__`.
- سلاسة القلم الرقمي والكتابة بتردد 120Hz/240Hz: تفعيل التقاط الأحداث المتزامنة (Coalesced Pointer Events) لأقلام S-Pen و Apple Pencil.

# Otium 2.0.5 — الأوفرهول الشامل للأناقة والملمس الواقعي (Premium Editorial & Tactile Overhaul)

- رفّ مكتبة كامل المساحة (Full-Bleed Covers): إزالة الصناديق الرمادية ذات الحواف الفارغة حول أغلفة الكتب، لتقف الكتب مباشرة على الرف بأبعاد الكتب الطبيعية (1:1.414) مع ثنية الكعب الواقعية وتدرج الإضاءة والظلال متعددة التدرجات.
- معالجة فاخرة لتجليد المجلدات الكلاسيكية (Hardcover Buckram): أغلفة أنيقة للمستندات والكتب الخالية من الصور بألوان مكتبية هادئة (الأخضر الكتاني العميق، الأزرق الداكن، الجلد البني)، مع إطار ذهبي محفور وعنوان واضح.
- تنظيف شامل لبطاقات الكتب: تحويل زر الحذف إلى كبسولة زجاجية عائمة ومصنفرة في الزاوية العلوية للغلاف، مما حرر المساحة أسفل الكتاب للعنوان ومعلومات التقدم دون تشويش بصري.
- تحسين بطاقة "متابعة القراءة": واجهة عصرية تتضمن شارة حالة القراءة ومؤشر تقدم أنيق (Progress Capsule) مع زر تنقل دائري مرن.
- شريط بحث وفلاتر مطور: تصميم كبسولي موحد مستوحى من نظام iOS و Material 3 مع حقول بحث انسيابية وزوايا دائرية بالكامل.
- حماية الخط العربي: تثبيت قاعدة صارمة لمنع تباعد الأحرف في النصوص العربية لمنع تقطع الحروف والكلمات، مع عزل الأرقام وحجوم الملفات في بيئة RTL.
- إصلاح تبويبات الإعدادات: معالجة مشكلة اقتطاع اسم تبويب "حول التطبيق" على الشاشات الصغيرة، وجعل التبويبات مرنة وسلسة التمرير.
- تسريع استجابة اللمس: تقليص وقت الضغط الفعلي إلى 65ms وتطبيق منحنى ارتداد هيدروليكي زنبركي (Hydraulic Spring Physics) على جميع أزرار وتفاعلات التطبيق.

# Otium 2.0.4 — تحسينات رفّ المكتبة والماسح والواجهة العربية

- حفظ حالة البحث والترتيب وموضع التمرير في رفّ المكتبة عند فتح كتاب وإغلاقه للعودة إلى الموضع نفسه تلقائياً.
- تصحيح اتجاه أسهم الرجوع في واجهة RTL العربية وضبط أرقام الصفحات وأحجام الملفات لحماية الأرقام من الانعكاس.
- تنبيه ذكي في شريط البحث عند فتح مستندات مصورة خالية من النصوص مع توجيه مباشر لتشغيل التعرّف الضوئي (OCR).
- دعم زر الهروب Escape وزر الرجوع LIFO في الماسح لإغلاق النوافذ المنبثقة وقوائم الخيارات تدريجياً قبل الخروج من الكاميرا.
- تمييز حالات خطأ قراءة التخزين وتوضيح إعادة استيراد الملف عند فقدان النسخة المحلية، ومنع تداخل أحداث الحذف في رفّ الكتب.

# Otium 2.0.3 — المكتبة والماسح بالكاميرا

- تصفّح الكتب والملفات من زر المكتبة، وابحث بالاسم أو رتّب حسب آخر فتح أو الاسم أو الحجم.
- تعرض المكتبة الصفحة الأولى من ملف PDF كاملة، وتتيح الرئيسية متابعة القراءة والوصول إلى آخر أربعة ملفات.
- افتح الماسح من رئيسية Windows أو الهاتف، وبدّل بين تصوير المستند والهوية مباشرة. تعرض الكاميرا إرشادات لتأطير الصفحة وتثبيتها والانتقال إلى الصفحة التالية.

# Otium 2.0.2 — استقرار وسلاسة وعرض أغلفة الكتب

- عرض صورة غلاف الكتاب (الصفحة الأولى) بجانب اسمه في شريط الأدوات العلوي، وقائمة تفاصيل المستند، وقائمة الكتب الأخيرة وشاشة البداية، وبطاقة متابعة القراءة.
- تحسين استقرار وسلاسة تجربة القراءة وتفاعل سحب الصفحة بمؤشر اليد (Hand Tool) دون تعليق مؤشر الماوس.
- حماية مؤقتات الارتداد عند حدود الصفحات وتأمين تنظيف مستمعي أحداث سطح المكتب بالكامل عند الإغلاق.
- استخراج مصغرات الأغلفة في الخلفية وتخزينها محلياً في الذاكرة وقاعدة البيانات لتصفح فوري وسريع.

# Otium 2.0.1

- دعم المسح العتادي في السبورة التفاعلية: التبديل التلقائي إلى الممحاة عند الضغط على الزر الجانبي للأقلام الرقمية (Stylus) أو استخدام الطرف المقلوب دون الحاجة لتغيير الأداة يدوياً.
- تصحيح ميتاداتا مستودع Rust ومسارات البناء في بيئة العمل المستقرة.

# Otium 2.0.0

- بث ملفات PDF والصور والفيديو وعروض PowerPoint. يدعم الربط شبكة محلية بدون إنترنت، والربط عبر الإنترنت بكود Beam.
- تقليب الصفحات والشرائح بأزرار الصوت على Android، مع إصلاح التكبير بإصبعين والحفاظ على موضع القراءة عند تدوير الشاشة.
- تحسين اكتشاف الورقة ومراجعة القص وفلتر الأبيض والأسود واستيراد دفعات المسح.
- تصدير شروحات PDF كمتجهات، وتحسين ممحاة السبورة والاتصال بالشاشات المحلية الأخيرة.
- تبسيط شاشة البداية وخيارات البث والتحديث.

# Otium 1.9.15 — Android displays and interactive boards

- Allow Android devices to enable and use the complete whiteboard and split workspace; keep it opt-in and remember the setting.
- Add a saved device role: automatic, personal reader/controller, display/TV, or interactive whiteboard. Changing the role keeps the reader and current connection mounted.
- Detect Android televisions through the native UI mode, with browser hints and a manual choice for generic Android boards.
- Make display/board roles default to receiving, while preserving connected sessions, QR launch roles, and existing desktop sending behaviour.
- Add directional remote navigation with visible focus, modal boundaries, and single-action Enter handling. Touch input is optional on Android TV.
- Add a fullscreen toggle to the browser home page, including external Escape state updates and a clear blocked/unsupported message.
- Keep experimental media work out of this patch. Real-device television, touch-board, and remote-control validation remains recommended.

# Otium 1.9.14 — Mobile focus and stability hardening

- Keep Android system bars hidden independently of reader tools; request browser fullscreen on an eligible user gesture without consuming file-picker controls.
- A short stationary page tap hides or restores mobile chrome; scroll, pinch, long press, controls, and native selection do not toggle it. Hidden reading keeps only the page number and removes the floating restore dock.
- Replace weak default pairing codes with 12 cryptographically random characters. Re-pair by QR after upgrading; manual legacy codes remain compatible.
- Restrict relay attachment URLs and redirects, cap actual streamed bytes and manifest sizes, and reject replacement handshakes while a presenter is connected.
- Align native relay CSP with production, restrict web connection destinations, move startup theme code to a local file, and render QR images without HTML insertion.
- Correct offline cache application paths and stop deleting unrelated application caches.
- Remove inactive swipe/double-tap state and scope linting to application source instead of generated/vendor assets.
- Gate desktop/mobile release builds on regression tests, source checks, and dependency advisories.
- Document audit findings and remaining LTS requirements in maintenance/LTS-READINESS.md. This is a preparatory hardening patch, not an LTS certification.

# Otium 1.9.13 — Automatic classroom files and smoother annotation tools

- Automatically transfer a newly opened PDF from the paired presenter to the board, even with the Beam dialog closed; queue the latest opened file and expose progress and retry.
- Share one transfer queue between pairing, file picking, and explicit retry instead of competing manual and automatic send paths.
- Drag saved page notes directly, tap to edit text and color, and keep a move as one undoable action.
- Recognize squares, rectangles, rotated rectangles, triangles in either direction, circles, ellipses, and lines on draw-and-hold; preserve sharp polygon corners in live ink and exports.
- Keep native text-selection handles active through dragging and scrolling, debounce geometry capture, and use a compact two-row selection menu on phones.
- Preserve the selected annotation tool when a Beam peer reconnects.
- Include clipped images in whiteboard PDF/PNG exports and report incomplete image encoding.
- Synchronize view-mode changes from settings as well as toolbars; keep the board canvas fitted when a large viewport reaches the raster memory limit.

# Otium 1.9.12 — Clearer whiteboard ink and dependable note controls

- Supersample whiteboard ink on standard displays with a bounded backing store, and stop resetting canvas dimensions on every stroke update.
- Share smooth curve rendering between the live board and higher-resolution PDF/PNG exports.
- Follow the app theme by default, with a direct Background control for pure black, white, or a saved independent color; retain dots and ruled patterns.
- Adapt neutral ink to the background so it stays legible when the theme changes.
- Close note placement completely after Cancel or Save; edit or delete existing notes directly, with undo available for deletion.
- Honor Hide reader controls on mobile and keep the dock restore action reachable.

# Otium 1.9.11 — Consistent document navigation

- Use document direction for both desktop toolbar and in-page navigation arrows, independently of interface language.
- Detect document direction from up to three content pages, without Arabic filenames reversing English books.
- Keep Redo available in More while using the compact phone study dock.
- Regression checks cover mobile reader state across rotation, hide/restore actions, and expanded controls for a live paired device.

# Otium 1.9.10 — Stable rotation and focused study controls

- Keep the mobile shell stable across orientation changes so rotating a phone does not unmount the open document or reset the connected reading session.
- Keep the X action visible on recent files in landscape, with an accessible remove label.
- Make the phone teacher dock context-aware: a compact study bar when no live peer is connected, and full controls while paired for Smart Beam.
- Make Hide collapse the dock to a single restore control on mobile as well as desktop.
- Orient the phone dock page controls from the document direction, independent of interface language.

# Otium 1.9.9 — Mobile controls and paired reading fixes

- Keep mobile reader controls available while teacher presentation mode is active; the toolbar hides only for explicit immersive reading.
- Use the PDF's detected reading direction for phone page-turn arrows, independent of interface language.
- Synchronize single, spread, and continuous page modes between paired devices.
- Preserve Smart Beam sessions when Android WebView fires `pagehide` during orientation changes; explicit disconnect and peer timeout still end sessions.

# Otium 1.9.8 — Reliable cloud pairing

- Smart Beam now uses a verified, compatible cloud relay after the previous relay timed out on the classroom network.
- The replacement was tested with publish, long-poll receive, and real-time SSE receive before release.
- Update both the phone and the computer to this version so they use the same pairing relay.

# Otium 1.9.7 — Complete teaching workspace

- The top reader toolbar remains available while the whiteboard is open, so navigation, pairing, and settings do not disappear.
- The whiteboard now occupies its entire panel; the teacher dock overlays it instead of reserving an unused strip beneath it.

# Otium 1.9.6 — Calm reading, full whiteboard

- The reader now opens cleanly with the top toolbar only. The lower teacher dock appears only after opening the whiteboard.
- The whiteboard now fills its allocated split-screen area instead of being confined to a small 16:9 frame.
- Removed the intrusive teacher-mode card above the workspace.
- Stopped the idle laser animation loop, reducing unnecessary whiteboard redraws and lag.
- Returning from the whiteboard restores the reader toolbar reliably.

# Otium 1.9.5 — Restored whiteboard and reliable cloud

- Restore a clear Smart Whiteboard switch inside Settings → Reading. It is saved per device and reveals the board button only on the computer/smartboard, keeping phones focused on remote reading controls.
- Preserve the existing cloud provider while strengthening automatic polling, reconnect, retry, and explicit failure recovery for unstable school Wi-Fi and older Android WebViews.

Validation: production build, shared-version guard, and automated tests for whiteboard visibility, stalled SSE, polling recovery, retry, and real cloud-failure states.
