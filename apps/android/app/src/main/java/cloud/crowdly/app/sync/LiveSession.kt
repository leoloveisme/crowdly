package cloud.crowdly.app.sync

import android.annotation.SuppressLint
import android.content.Context
import android.os.Handler
import android.os.Looper
import android.util.Log
import android.webkit.CookieManager
import android.webkit.JavascriptInterface
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import cloud.crowdly.app.data.Prefs
import cloud.crowdly.app.net.JsonCodec
import cloud.crowdly.app.net.asObject
import cloud.crowdly.app.net.asObjects
import cloud.crowdly.app.net.int
import cloud.crowdly.app.net.jsonOf
import cloud.crowdly.app.net.s
import cloud.crowdly.app.net.strings
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.serialization.json.JsonPrimitive

/** Someone else with the same chapter open (lib/live.ts Presence). */
data class LivePeer(val peer: String, val name: String, val color: Long, val paragraph: Int?)

data class LiveChapter(val title: String, val paragraphs: List<String>)

/**
 * Real-time co-editing of one chapter, as on the platform and in the web app:
 * the automerge-repo client from apps/android/live/bridge.ts runs in a hidden
 * WebView whose page origin is the API server, so its /crdt-sync WebSocket
 * carries the session cookie set here. (docs/mobile-crdt-spec.md §2b: there
 * is no native Automerge build for Android.) One chapter is live at a time.
 */
@SuppressLint("SetJavaScriptEnabled")
class LiveSession(private val context: Context, private val prefs: Prefs) {
    private val main = Handler(Looper.getMainLooper())
    private var web: WebView? = null
    private var ready = false
    private val pending = mutableListOf<String>()
    private var openKey: String? = null

    private val _connected = MutableStateFlow(false)
    val connected: StateFlow<Boolean> = _connected
    private val _peers = MutableStateFlow<List<LivePeer>>(emptyList())
    val peers: StateFlow<List<LivePeer>> = _peers
    private val _remote = MutableSharedFlow<Pair<String, LiveChapter>>(extraBufferCapacity = 16)
    /** Merged values after someone else's edit, tagged with the doc key they belong to. */
    val remote: SharedFlow<Pair<String, LiveChapter>> = _remote

    private inner class Bridge {
        @JavascriptInterface fun onRemote(json: String) {
            val o = JsonCodec.parseToJsonElement(json).asObject()
            val key = openKey ?: return
            _remote.tryEmit(key to LiveChapter(o.s("title"), o.strings("paragraphs")))
        }
        @JavascriptInterface fun onPeers(json: String) {
            _peers.value = JsonCodec.parseToJsonElement(json).asObjects().map {
                LivePeer(it.s("peer"), it.s("name"), parseColor(it.s("color")), it.int("paragraph"))
            }
        }
        @JavascriptInterface fun onState(connected: Boolean) { _connected.value = connected }
        @JavascriptInterface fun log(msg: String) {
            Log.i("CrowdlyLive", msg)
            if (msg == "bridge ready") main.post { ready = true; pending.forEach { web?.evaluateJavascript(it, null) }; pending.clear() }
        }
    }

    private fun ensureWeb(): WebView {
        web?.let { return it }
        val server = prefs.server.trimEnd('/')
        prefs.token?.let { t ->
            CookieManager.getInstance().apply {
                setAcceptCookie(true)
                setCookie(server, "crowdly_session=$t; Path=/")
                flush()
            }
        }
        val w = WebView(context.applicationContext)
        w.settings.javaScriptEnabled = true
        w.addJavascriptInterface(Bridge(), "CrowdlyAndroid")
        w.webViewClient = object : WebViewClient() {
            // The bridge script is served from the app's assets under the server's origin.
            override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest): WebResourceResponse? {
                if (request.url.path == "/__android_live__/bridge.js")
                    return WebResourceResponse("application/javascript", "utf-8", context.assets.open("live/bridge.js"))
                return null
            }
        }
        w.loadDataWithBaseURL("$server/", "<!doctype html><html><body><script src=\"/__android_live__/bridge.js\"></script></body></html>", "text/html", "utf-8", null)
        web = w
        return w
    }

    private fun call(js: String) = main.post {
        val w = ensureWeb()
        if (ready) w.evaluateJavascript(js, null) else pending += js
    }

    private fun q(s: String) = JsonPrimitive(s).toString()

    fun open(docKey: String, userId: String, name: String) {
        if (openKey == docKey && _connected.value) return
        openKey = docKey
        val user = jsonOf("id" to userId, "name" to name, "color" to colorFor(userId)).toString()
        call("crowdlyLive.open(${q(prefs.server.trimEnd('/'))}, ${q(docKey)}, ${q(user)})")
    }

    fun push(value: LiveChapter) {
        if (openKey == null) return
        call("crowdlyLive.push(${q(jsonOf("title" to value.title, "paragraphs" to value.paragraphs).toString())})")
    }

    fun presence(paragraph: Int?) = call("crowdlyLive.presence(${paragraph ?: "null"})")

    fun close() {
        openKey = null
        _connected.value = false
        _peers.value = emptyList()
        if (web != null) call("crowdlyLive.close()")
    }

    /** After signing out or changing server: drop the WebView (and its socket and cookie). */
    fun reset() = main.post {
        web?.destroy(); web = null; ready = false; pending.clear(); openKey = null
        _connected.value = false; _peers.value = emptyList()
        CookieManager.getInstance().removeAllCookies(null)
    }

    companion object {
        private val COLORS = listOf("#e11d48", "#2563eb", "#16a34a", "#9333ea", "#ea580c", "#0891b2", "#ca8a04")
        fun colorFor(s: String) = COLORS[s.sumOf { it.code } % COLORS.size]
        fun parseColor(hex: String): Long = runCatching { 0xFF000000 or hex.removePrefix("#").toLong(16) }.getOrDefault(0xFF888888)
    }
}
