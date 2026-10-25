# Otium 1.5.0 — كتبك وملاحظاتك أينما ذهبت

إصدار كبير يركز على ملكية بياناتك وعلى راحة القراءة العربية. أصبح لكل كتاب هوية ثابتة، ويمكن نسخ المكتبة احتياطيًا واستعادتها، مع تحسين البحث والتخطيط للعربية والتنقل السريع بين الصفحات. يعمل التحديث على Windows وAndroid.

## العربية

- **الكتاب يُعرَف بمحتواه لا باسمه.** يحصل كل ملف PDF على بصمة SHA-256 من بايتاته، لذا تبقى الاقتباسات والملاحظات والإشارات وتقدّم القراءة مرتبطة بالكتاب حتى لو غيّرت اسم الملف أو وصل إليك باسم آخر. كما يمكن أن يحمل كتابان الاسم نفسه دون أن تختلط بياناتهما.
- **نسخة احتياطية كاملة للبيانات.** من الإعدادات ← البيانات صدّر ملف JSON صغيرًا يحتوي على تقدّم القراءة والاقتباسات والملاحظات والإشارات وتفضيلات الخط والمظهر واللغة. لا يتضمن الملف كتب PDF نفسها، لذلك يسهل حفظه ونقله. عند الاستعادة تُدمج البيانات مع الحالية؛ الاقتباسات والإشارات المتطابقة تُحدَّث ولا تتكرر.
- **الكتب القديمة لا تختفي.** يحتفظ Otium بأحدث ١٢ كتابًا داخل مساحة ١ جيجابايت. عندما يخرج كتاب من هذه المساحة تبقى ملاحظاته وتقدّم القراءة محفوظة كسجل خفيف، وبمجرد إعادة فتح ملف PDF الأصلي تُستعاد بياناته تلقائيًا عبر البصمة. تنتقل مكتبتك من 1.4.2 تلقائيًا دون فقدان الاقتباسات أو مواضع القراءة.
- **ملاحظاتك قابلة للتحرير والتصدير.** أضف ملاحظة إلى أي اقتباس أو عدّلها من لوحة الملاحظات، ثم صدّرها مع الاقتباسات كملف Markdown. على Android يُفتح منتقي الملفات في النظام لاختيار مكان الحفظ، وعلى Windows والمتصفح يتم التنزيل مباشرة.
- **بحث عربي أكثر ذكاءً.** يتجاهل البحث التشكيل والتطويل ويوحّد الألف والهمزة والتاء المربوطة والألف المقصورة، ويحوّل الأرقام العربية والفارسية. لذلك يجد «محمد» النص المكتوب «مُحَمَّد»، وتعمل العبارات نفسها بصرف النظر عن طريقة كتابتها.
- **تخطيط عربي حقيقي للصفحات المتجاورة.** في وضع الكتاب المفتوح تُعرض الصفحة الفردية على اليمين والزوجية على اليسار، وتنعكس الأسهم والتمرير والتنقل بلوحة المفاتيح مع اتجاه القراءة. كما يعمل الانتقال إلى الصفحة الزوجية بتخطيط الصفحتين الصحيح.
- **الانتقال إلى صفحة برقمها.** انقر رقم الصفحة في شريط الهاتف السفلي، اكتب الصفحة المطلوبة، ثم اضغط «انتقال». لم تعد بحاجة إلى تمرير طويل للوصول إلى صفحة بعيدة.
- **وصول أفضل.** منطقة القراءة صارت معلمًا واضحًا لقارئات الشاشة، وشريط التقدّم يُعلن الصفحة الحالية وإجمالي الصفحات عند تغيّرها. كما تحسّنت التسميات العربية في أدوات التحكم.
- **اختبارات موثوقة.** أضفنا اختبارات Vitest مع قاعدة بيانات وهمية للتحقق من البصمة والتخزين والنسخ الاحتياطي والدمج والبحث العربي، إضافة إلى اختبارات ترقية بيانات الإصدارات السابقة.

## English

- **Books are identified by content, not filename.** Every PDF gets a SHA-256 fingerprint from its bytes, so highlights, notes, bookmarks and reading progress follow the book when a file is renamed or arrives under a different title. Two books with the same filename also stay separate.
- **Complete metadata backup.** Settings → Data exports a small JSON file containing reading progress, highlights, notes, bookmarks, and font, theme and language preferences. PDFs are not included, which keeps the file portable. Restoring merges the backup into the current library; matching highlights and bookmarks are updated instead of duplicated.
- **Evicted books do not lose their notes.** Otium keeps the 12 most recent PDFs within a 1 GB budget. When a book moves out of that budget, its notes and last page remain as a lightweight record. Opening the original PDF again reconnects it through the fingerprint. Existing 1.4.2 libraries migrate automatically without losing highlights or progress.
- **Notes can be edited and exported.** Add or edit a note on any quote from the notes panel, then export the quotes and notes as Markdown. Android opens the system file picker; Windows and the browser download the file directly.
- **Smarter Arabic search.** Search ignores vocalisation and tatweel, folds alef, hamza, taa-marbuta and alef-maqsura variants, and converts Arabic-Indic and Persian digits. A plain query such as «محمد» finds «مُحَمَّد», regardless of how the text was typed.
- **Proper RTL spreads.** In dual-page mode odd pages sit on the right and even pages on the left. Arrows, swipe direction and paged keyboard navigation mirror with the reading direction, and jumping to an even page keeps the spread correctly aligned.
- **Jump to a page.** Tap the page counter in the mobile bottom bar, type the page number and press Go. Distant pages no longer require a long scroll.
- **Better accessibility.** The reading area is now a named landmark, the progress bar reports the current page, and a polite live region announces page changes. Arabic control labels were also tightened.
- **Tested storage and backup logic.** New Vitest coverage uses a fake IndexedDB to verify fingerprints, document storage, backup merging and Arabic normalisation, plus migration of data written by previous versions.

Download `Otium_1.5.0_arm64-v8a.apk` for modern Android phones.
