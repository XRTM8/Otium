-keep class app.tauri.** { *; }
-keep class com.otium.reader.** { *; }
-keep class org.chromium.** { *; }
-keepattributes *Annotation*
-keepattributes JavascriptInterface
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}
