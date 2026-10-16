package cloud.crowdly.app.i18n

import androidx.compose.foundation.combinedClickable
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.LocalTextStyle
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import cloud.crowdly.app.data.Db
import cloud.crowdly.app.data.Prefs
import cloud.crowdly.app.data.Session
import cloud.crowdly.app.net.Api
import cloud.crowdly.app.net.JsonCodec
import cloud.crowdly.app.net.asObjects
import cloud.crowdly.app.net.jsonOf
import cloud.crowdly.app.net.qs
import cloud.crowdly.app.net.s
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive

/**
 * Runtime-translatable interface text, the Android counterpart of the
 * platform's EditableText: every string is keyed by (page_key, element_id,
 * language) in `interface_translations`. The whole app uses one page key,
 * [PAGE_KEY], so a language loads with one request and is cached for
 * offline use. Untranslated ids fall back to the English text in code.
 */
class I18n(private val api: Api, private val prefs: Prefs, private val db: Db, private val session: Session) {
    private val _strings = MutableStateFlow<Map<String, String>>(emptyMap())
    val strings: StateFlow<Map<String, String>> = _strings

    suspend fun load(language: String = prefs.language.value) {
        if (language == "English") { _strings.value = emptyMap(); return }
        val key = "i18n:$language"
        db.cacheGet(key)?.let { cached -> _strings.value = decode(cached) }
        runCatching {
            val rows = api.get("/interface-translations" + qs("page_path" to PAGE_KEY, "language" to language)).asObjects()
            val map = rows.associate { it.s("element_id") to it.s("content") }
            _strings.value = map
            db.cachePut(key, JsonObject(map.mapValues { JsonPrimitive(it.value) }).toString())
        }
    }

    /** Saves a translation (translators only, and never English — the backend enforces both). */
    suspend fun save(id: String, english: String, text: String) {
        val language = prefs.language.value
        api.put(
            "/interface-translations",
            jsonOf("userId" to session.userId, "page_path" to PAGE_KEY, "element_id" to id, "language" to language, "content" to text, "original_content" to english),
        )
        _strings.value = _strings.value + (id to text)
        db.cachePut("i18n:$language", JsonObject(_strings.value.mapValues { JsonPrimitive(it.value) }).toString())
    }

    private fun decode(s: String): Map<String, String> =
        runCatching { (JsonCodec.parseToJsonElement(s) as JsonObject).mapValues { (it.value as JsonPrimitive).content } }.getOrDefault(emptyMap())

    companion object {
        const val PAGE_KEY = "/__android__"
    }
}

class Strings(val map: Map<String, String>, val editing: Boolean, val onEdit: (String, String) -> Unit)

val LocalStrings = staticCompositionLocalOf { Strings(emptyMap(), false) { _, _ -> } }

@Composable
fun ProvideStrings(i18n: I18n, prefs: Prefs, session: Session, content: @Composable () -> Unit) {
    val map by i18n.strings.collectAsState()
    val editPref by prefs.editInterface.collectAsState()
    val user by session.user.collectAsState()
    val language by prefs.language.collectAsState()
    val editing = editPref && user?.isTranslator == true && language != "English"
    var target by remember { mutableStateOf<Pair<String, String>?>(null) }
    val scope = rememberCoroutineScope()
    CompositionLocalProvider(LocalStrings provides Strings(map, editing) { id, en -> target = id to en }) { content() }
    target?.let { (id, en) ->
        var text by remember(id) { mutableStateOf(map[id] ?: en) }
        AlertDialog(
            onDismissRequest = { target = null },
            title = { Text("$language · $id") },
            text = { OutlinedTextField(text, { text = it }, supportingText = { Text(en) }) },
            confirmButton = { TextButton({ scope.launch { runCatching { i18n.save(id, en, text) }; target = null } }) { Text("Save") } },
            dismissButton = { TextButton({ target = null }) { Text("Cancel") } },
        )
    }
}

/** The translated text for [id], falling back to [english]. */
@Composable
fun tr(id: String, english: String): String = LocalStrings.current.map[id]?.takeIf { it.isNotBlank() } ?: english

/** Text that translators can retranslate in place (long-press while "Edit interface text" is on). */
@Composable
fun AppText(
    id: String,
    english: String,
    modifier: Modifier = Modifier,
    style: TextStyle = LocalTextStyle.current,
    color: Color = Color.Unspecified,
    fontWeight: FontWeight? = null,
    maxLines: Int = Int.MAX_VALUE,
) {
    val strings = LocalStrings.current
    val m = if (strings.editing) modifier.combinedClickable(onClick = {}, onLongClick = { strings.onEdit(id, english) }) else modifier
    Text(tr(id, english), m, style = style, color = color, fontWeight = fontWeight, maxLines = maxLines, overflow = if (maxLines == Int.MAX_VALUE) TextOverflow.Clip else TextOverflow.Ellipsis)
}

/** Interface languages (apps/web/src/lib/languages.ts); values are the names the backend stores. */
val UI_LANGUAGES = listOf(
    "English" to "English",
    "Russian" to "Русский",
    "German" to "Deutsch",
    "French" to "Français",
    "Spanish" to "Español",
    "Portuguese" to "Português",
    "Korean" to "한국어",
    "Arabic" to "العربية",
    "Chinese (Simplified)" to "简体中文",
    "Chinese (Traditional)" to "繁體中文",
    "Japanese" to "日本語",
    "Hindi" to "हिन्दी",
)
