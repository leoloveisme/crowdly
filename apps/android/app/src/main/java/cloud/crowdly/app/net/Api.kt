package cloud.crowdly.app.net

import cloud.crowdly.app.data.Db
import cloud.crowdly.app.data.Outbox
import cloud.crowdly.app.data.Prefs
import java.io.IOException
import java.net.URLEncoder
import java.util.concurrent.TimeUnit
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import okhttp3.Interceptor
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.MultipartBody
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.Response

class ApiError(val status: Int, message: String) : Exception(message)

/** True for "couldn't reach the server" (as opposed to the server saying no). */
fun Throwable.isNetwork(): Boolean = this is IOException && this !is ApiError

/**
 * The one way the app talks to the backend, the counterpart of
 * apps/web/src/lib/api.ts. Every request carries the session as
 * `Authorization: Bearer <token>` (backend/src/sessions.js sessionTokenFrom);
 * writes given an [offlineKey] go to the outbox when the network is down.
 */
class Api(private val prefs: Prefs, private val outbox: Outbox, private val db: Db) {
    val base: String get() = prefs.server.trimEnd('/')

    private val _unauthorized = MutableStateFlow(0)
    /** Bumps when a signed-in request comes back 401: the session ended elsewhere or expired. */
    val unauthorized: StateFlow<Int> = _unauthorized

    private val auth = Interceptor { chain ->
        val token = prefs.token
        val req = chain.request()
        val sameHost = req.url.toString().startsWith(base)
        chain.proceed(if (token != null && sameHost) req.newBuilder().header("Authorization", "Bearer $token").build() else req)
    }

    val http: OkHttpClient = OkHttpClient.Builder()
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(90, TimeUnit.SECONDS)
        .writeTimeout(120, TimeUnit.SECONDS)
        .addInterceptor(auth)
        .build()

    fun url(path: String): String = if (path.startsWith("http://") || path.startsWith("https://")) path else "$base$path"

    /** Resolves backend-relative upload URLs (/uploads/…) against the API origin (lib/api.ts mediaUrl). */
    fun mediaUrl(u: String?): String = when {
        u.isNullOrBlank() -> ""
        Regex("^(https?:|data:|content:|file:)").containsMatchIn(u) -> u
        else -> "$base$u"
    }

    suspend fun request(method: String, path: String, body: Any? = null, offlineKey: String? = null): JsonElement {
        val (rb, text, type) = encode(body)
        val req = Request.Builder().url(url(path)).method(method, rb ?: if (method in setOf("POST", "PUT", "PATCH")) ByteArray(0).toRequestBody(null) else null).build()
        return try {
            withContext(Dispatchers.IO) { parse(http.newCall(req).execute()) }
        } catch (e: IOException) {
            if (offlineKey != null && (rb == null || text != null)) {
                outbox.enqueue(offlineKey, method, path, text, type)
                return JsonObject(mapOf("queued" to JsonPrimitive(true)))
            }
            throw e
        }
    }

    suspend fun get(path: String) = request("GET", path)

    /**
     * GET that remembers its last answer, so what was opened once still opens
     * offline. Falls back to the cached copy only when the server can't be
     * reached; a real error from the server is still an error.
     */
    suspend fun getCached(path: String, prefix: String = "work:"): JsonElement {
        val key = prefix + path
        return try {
            request("GET", path).also { db.cachePut(key, it.toString()) }
        } catch (e: IOException) {
            db.cacheGet(key)?.let { JsonCodec.parseToJsonElement(it) } ?: throw e
        }
    }
    suspend fun post(path: String, body: Any? = JsonObject(emptyMap())) = request("POST", path, body)
    suspend fun patch(path: String, body: Any? = JsonObject(emptyMap())) = request("PATCH", path, body)
    suspend fun put(path: String, body: Any? = JsonObject(emptyMap())) = request("PUT", path, body)
    suspend fun delete(path: String, body: Any? = null) = request("DELETE", path, body)

    /** Plain-text GET; null on 404 (lib/spaces.ts readText). */
    suspend fun text(path: String): String? = withContext(Dispatchers.IO) {
        http.newCall(Request.Builder().url(url(path)).build()).execute().use { res ->
            if (res.code == 404) return@use null
            if (!res.isSuccessful) throw ApiError(res.code, "Couldn't load (${res.code})")
            res.body.string()
        }
    }

    suspend fun bytes(path: String): ByteArray = withContext(Dispatchers.IO) {
        http.newCall(Request.Builder().url(url(path)).build()).execute().use { res ->
            if (!res.isSuccessful) throw ApiError(res.code, "Couldn't download (${res.code})")
            res.body.bytes()
        }
    }

    /** multipart/form-data upload: [files] are (field, filename, mime, bytes). */
    suspend fun upload(method: String, path: String, fields: Map<String, String>, files: List<FilePart>): JsonElement {
        val mb = MultipartBody.Builder().setType(MultipartBody.FORM)
        fields.forEach { (k, v) -> mb.addFormDataPart(k, v) }
        files.forEach { f -> mb.addFormDataPart(f.field, f.name, f.bytes.toRequestBody(f.mime.toMediaType())) }
        return request(method, path, mb.build())
    }

    data class FilePart(val field: String, val name: String, val mime: String, val bytes: ByteArray)

    /** Replays the outbox (offline.ts flushOutbox). Returns how many entries were sent. */
    suspend fun flushOutbox(): Int = withContext(Dispatchers.IO) {
        var sent = 0
        for (e in outbox.entries()) {
            val body = e.body?.toRequestBody((e.contentType ?: JSON).toMediaType())
            val req = Request.Builder().url(url(e.path)).method(e.method, body ?: if (e.method in setOf("POST", "PUT", "PATCH")) ByteArray(0).toRequestBody(null) else null).build()
            try {
                http.newCall(req).execute().use { res ->
                    if (res.isSuccessful || res.code in 400..499) {
                        if (!res.isSuccessful && res.code != 401) outbox.reject(e.key)
                        outbox.remove(e.key)
                        sent++
                    }
                }
            } catch (_: IOException) {
                break // still offline
            }
        }
        sent
    }

    private fun encode(body: Any?): Triple<RequestBody?, String?, String?> = when (body) {
        null -> Triple(null, null, null)
        is RequestBody -> Triple(body, null, body.contentType()?.toString())
        is String -> Triple(body.toRequestBody(TEXT.toMediaType()), body, TEXT)
        else -> {
            val s = toJson(body).toString()
            Triple(s.toRequestBody(JSON.toMediaType()), s, JSON)
        }
    }

    private fun parse(res: Response): JsonElement = res.use {
        if (it.code == 204) return JsonObject(emptyMap())
        val text = it.body.string()
        val data: JsonElement = runCatching { if (text.isBlank()) JsonObject(emptyMap()) else JsonCodec.parseToJsonElement(text) }
            .getOrElse { JsonPrimitive(text) }
        if (!it.isSuccessful) {
            if (it.code == 401 && prefs.token != null) _unauthorized.value++
            val msg = (data as? JsonObject)?.str("error") ?: (data as? JsonObject)?.str("message")
            throw ApiError(it.code, msg ?: "Request failed (${it.code})")
        }
        data
    }

    companion object {
        const val JSON = "application/json; charset=utf-8"
        const val TEXT = "text/plain; charset=utf-8"
    }
}

/** Query string from params, skipping empty values (lib/api.ts qs). */
fun qs(vararg params: Pair<String, Any?>): String {
    val parts = params.mapNotNull { (k, v) ->
        val s = v?.toString()
        if (s.isNullOrEmpty()) null else "${enc(k)}=${enc(s)}"
    }
    return if (parts.isEmpty()) "" else "?" + parts.joinToString("&")
}

fun enc(s: String): String = URLEncoder.encode(s, "UTF-8").replace("+", "%20")
