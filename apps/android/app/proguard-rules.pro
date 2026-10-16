# The live co-editing bridge (sync/LiveSession.kt) is called from JavaScript.
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}
-keepattributes JavascriptInterface
