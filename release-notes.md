# Otium 1.4.2 — إصلاحات القراءة على الهاتف

إصدار تصحيحي للهاتف. يعالج المشاكل الأربع التي ظهرت بعد 1.4.1، مع لمسات سلاسة إضافية. نفس القارئ ما زال يعمل على Windows وAndroid.

## العربية

- **شريط التحديد يظهر فورًا.** كان الشريط ينتظر رفع الإصبع أو تمرير الصفحة، لذلك بدا وكأنه لا يعمل حتى تنتقل إلى صفحة أخرى. أصبح التطبيق يراقب تغيّر التحديد مباشرة، ويعيد المحاولة بسرعة بعد ضغطة طويلة، مع فحص خفيف لا يستمر إلا ثوانٍ قليلة. يظهر شريط النسخ والتظليل والملاحظة والبحث والاستماع الآن مباشرة بعد تحديد النص، دون تمرير.
- **إغلاق لوحة الصفحات بالسحب.** يمكن سحب المقبض العلوي للوحة إلى الأسفل لإغلاقها. يتبع المقبض إصبعك بحركة مرنة، ثم تعود اللوحة إلى مكانها إذا كانت السحبة قصيرة، وتُغلق عند تجاوز الحد أو السحب السريع. يبقى التمرير داخل قائمة الصفحات مستقلًا عن سحب المقبض.
- **الاستماع يعمل على Android.** اعتمد التطبيق سابقًا على محرك النطق داخل WebView، وهو غير متاح أو بلا أصوات على كثير من الهواتف. أصبح للاستماع محرك Android أصلي: يقرأ النص المحدد، ويجرب العربية الفصحى ثم العربية العامة ثم المصرية، ويستخدم السرعة المناسبة. إذا لم يكن هناك صوت عربي مثبّت يعرض التطبيق رسالة واضحة وزرًا لفتح إعدادات الصوت. تبقى نسخة المتصفح وWindows على Web Speech.
- **لمسة واحدة تخفي الواجهة.** انقر على صفحة القراءة مرة واحدة لتختفي أشرطة التطبيق وأشرطة Android العلوية والسفلية معًا، ثم انقر مرة أخرى لاستعادتها. ما زال النقر المزدوج يكبّر الصفحة، والنقر أثناء تحديد النص لا يخفي الواجهة. زر الرجوع يعيد الأشرطة أولًا.
- **سلاسة إضافية.** انتقالات قصيرة لأشرطة الواجهة وشريط التحديد، واحترام إعداد تقليل الحركة في النظام. تحسّن أيضًا تسجيل منطقة التحديد حتى لا تتكرر إعادة الرسم أثناء تحريك مقابض التحديد.

## English

- **Selection bar appears immediately.** The bar used to wait for pointer-up or a page scroll, which made it look broken until you moved to another page. Otium now reacts to `selectionchange` directly, retries quickly after a long press, and runs a short watchdog instead of a single delayed timer. Copy, highlight, note, search and listen are available as soon as text is selected, with no scrolling.
- **Drag the pages sheet closed.** Pull the sheet's top handle downward to dismiss it. The sheet follows your finger with a rubber-band feel, snaps back after a short drag, and closes after a longer or faster one. Scrolling inside the page list remains independent of the handle gesture.
- **Listening works on Android.** The old implementation relied on WebView speech synthesis, which is missing or voiceless on many phones. The listen action now uses a native Android `TextToSpeech` engine, tries Modern Standard Arabic, then generic Arabic, then Egyptian Arabic, and applies a comfortable rate. If no Arabic voice is installed, Otium shows a clear message and a button that opens the system voice settings. Browser previews and Windows keep the Web Speech path.
- **One tap hides the interface.** Tap the reading page once to hide the app chrome together with the Android status and navigation bars, then tap again to bring everything back. Double-tap zoom still works, and a tap that adjusts a text selection never hides the interface. Back restores the bars first.
- **Extra polish.** Short, eased transitions for the chrome and selection bar, plus support for the system reduced-motion setting. Selection geometry is deduplicated so dragging the native selection handles no longer redraws the menu unnecessarily.

Download `Otium_1.4.2_arm64-v8a.apk` for modern Android phones.
