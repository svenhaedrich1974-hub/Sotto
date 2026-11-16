# Methoden der JavaScript-Bruecke nicht entfernen oder umbenennen
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}
-keepattributes JavascriptInterface
