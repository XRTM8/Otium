# Otium 1.4.0 — Windows + Android

One reader, two editions, one release.

## العربية

- واجهة جديدة بالكامل مبنية على نواة قارئ واحدة بين Windows وAndroid: إيقاع بصري منتظم، حدود ناعمة، وأسطح زجاجية شفافة، مع شريط أدوات يتكيّف مع عرض النافذة من دون فيض أو أزرار مخفية.
- أيقونة واضحة في كل السِّمات: لوحة داكنة صلبة على سطح المكتب، وخلفية شفافة على Android مع لون أساسي `#0B0906`، فلا قصّ ولا تشوّه بكسلي ولا أثر باقٍ بعد تبديل السمة.
- تقليب الصفحات أصبح فوريًا: لا تمرير ثم قفزة، ولا انحراف عمودي قبل القلب. نمط الصفحة الواحدة والكتاب المفتوح يقلبان أفقيًا فقط، حتى عند التكبير اليدوي يتحرك المحتوى يمينًا ويسارًا أولًا ثم يقلب الصفحة عند الحافة.
- التمرير المستمر أنعم: تُرسم الصفحة الأقرب إليك أولًا عبر مسار رسم واحد، وتؤجَّل الصفحات البعيدة حتى تقترب، مع الحفاظ على موضعك عند العودة من وضع الصفحات.
- محرك تحديد وتظليل أدق: إحداثيات مأخوذة من طبقة النص نفسها، تظليل متعدد الأسطر والمواضع في الصفحة الواحدة، زوايا دائرية 2px، ومزج `multiply` على الأسطح الفاتحة و`screen` على الداكنة. التحديد المؤقت منفصل عن التظليل المحفوظ.
- شريط إجراءات نص مخصص على الهاتف: تظليل بألوان، تسطير، نسخ، ملاحظة، بحث، واستماع. تختفي قائمة النظام الأصلية، ويحترم الشريط الحواف الآمنة وينقلب أسفل التحديد عند اقترابه من أعلى الشاشة.
- تبديل الخطوط يعمل فورًا في القارئ والواجهة معًا، بخطوط مضمّنة تعمل دون اتصال، ومتغيّرات `--font-ui` و`--font-reader` على جذر التطبيق.
- الحفظ الخلفي للتظليلات والملاحظات لا يعيد رسم الصفحة: تُكتب التعليقات في IndexedDB بشكل متسلسل مع ترحيل تلقائي من التخزين القديم، وتُحدَّث الطبقات فوق الصفحة وحدها.
- على الهاتف يحجز وضع الصفحات مساحة للشريطين العائمين، فلا تختفي الصفحة تحت شريط التنقل. النسخة نفسها تشمل مثبّت Windows والنسخة المحمولة وAPK Android، برقم إصدار وتغذية تحديث واحدة.

## English

- A rebuilt interface on one shared reader core for Windows and Android: a consistent 8px rhythm, soft borders, frosted glass surfaces, and a toolbar that adapts to the window width without overflow or hidden actions.
- Crisp icons in every theme: a solid dark plate on desktop and a transparent adaptive foreground on `#0B0906` for Android, with no clipping, pixelation, or burn-in after theme changes.
- Immediate page turns: no scroll-then-jump and no vertical drift before a flip. Single page and dual spread turn horizontally only; when manually zoomed, content pans left and right first and the page turns only at the horizontal edge.
- Smoother continuous scrolling: the page nearest you is rendered first through a single render lane, distant pages are deferred until they approach, and your place is preserved when returning to paged mode.
- A more precise selection and highlight engine: rects come from the real text layer, multiple lines and multiple highlights can share a page, corners are rounded to 2px, and blending uses `multiply` on light surfaces and `screen` on dark ones. The transient selection overlay is decoupled from saved highlights.
- A custom mobile text action bar: highlight colours, underline, copy, note, search, and listen. The native context menu is suppressed, safe areas are respected, and the bar flips below the selection near the top of the screen.
- Font switching applies instantly across both the reader and the interface, using bundled offline fonts and root-level `--font-ui` and `--font-reader` tokens.
- Background annotation writes never redraw the page: highlights and notes persist to IndexedDB in order, migrate legacy storage automatically, and only the overlay layers update.
- On mobile, paged mode reserves room for both floating bars so a page never hides beneath the bottom navigation. The same release covers the Windows installer, the portable build, and the Android APK under one version and one update feed.
