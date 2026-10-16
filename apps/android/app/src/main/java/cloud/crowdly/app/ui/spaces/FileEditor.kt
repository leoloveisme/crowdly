package cloud.crowdly.app.ui.spaces

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.MoreVert
import androidx.compose.material.icons.filled.Visibility
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.focusRequester
import androidx.compose.material.icons.filled.Search
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import cloud.crowdly.app.crowdly
import cloud.crowdly.app.data.SpaceItem
import cloud.crowdly.app.i18n.AppText
import cloud.crowdly.app.i18n.tr
import cloud.crowdly.app.net.Api
import cloud.crowdly.app.ui.LocalNav
import cloud.crowdly.app.ui.Routes
import cloud.crowdly.app.ui.components.Empty
import cloud.crowdly.app.ui.components.MarkdownView
import cloud.crowdly.app.ui.components.Screen
import cloud.crowdly.app.ui.components.errorText
import cloud.crowdly.app.ui.components.rememberActions
import cloud.crowdly.core.formats.ComicDoc
import cloud.crowdly.core.formats.ScreenplayDoc
import cloud.crowdly.core.formats.StoryDoc
import cloud.crowdly.core.formats.parseComic
import cloud.crowdly.core.formats.parseScreenplay
import cloud.crowdly.core.formats.parseStory
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

/** Resolves a Space-relative image path (as .comic files use) against the file's folder and fetches it. */
suspend fun spaceImage(spaceId: String, folder: String, src: String): Api.FilePart? {
    val app = crowdly
    if (Regex("^(https?:|/)").containsMatchIn(src)) return null
    val full = (if (folder.isEmpty()) src else "$folder/$src").split('/').fold(mutableListOf<String>()) { acc, p -> when (p) { "", "." -> Unit; ".." -> acc.removeLastOrNull(); else -> acc += p }; acc }.joinToString("/")
    val parent = full.substringBeforeLast('/', "")
    val name = full.substringAfterLast('/')
    val item = app.repo.items(spaceId, parent).second.firstOrNull { it.name == name && !it.isFolder } ?: return null
    return Api.FilePart("images", name, item.mime ?: cloud.crowdly.app.data.WorkIo.mimeOf(name.substringAfterLast('.')), app.repo.bytes(app.repo.contentPath(spaceId, item.id)))
}

/**
 * A text file inside a Space (FileEditor.tsx). Markdown gets an edit /
 * preview pair; .story/.screenplay/.comic show the formatted work and can
 * become a Crowdly work; anything else is plain source. Saved back 2 s after
 * typing (which also triggers the Space's GitHub / Google Drive push).
 */
@Composable
fun FileEditorScreen(spaceId: String, itemId: String) {
    val app = crowdly
    val nav = LocalNav.current
    val actions = rememberActions()
    var item by remember { mutableStateOf<SpaceItem?>(null) }
    var text by remember { mutableStateOf<String?>(null) }
    var error by remember { mutableStateOf<String?>(null) }
    var stamp by remember { mutableLongStateOf(0L) }
    var saveState by remember { mutableStateOf("") }
    var preview by remember { mutableStateOf(false) }
    var menu by remember { mutableStateOf(false) }
    var find by remember { mutableStateOf<Boolean?>(null) }
    var selection by remember { mutableStateOf(androidx.compose.ui.text.TextRange.Zero) }
    val bodyFocus = remember { androidx.compose.ui.focus.FocusRequester() }

    LaunchedEffect(itemId) {
        try {
            item = app.repo.item(spaceId, itemId)
            text = app.repo.readText(spaceId, itemId)
        } catch (e: Exception) { error = errorText(e) }
    }
    suspend fun save() {
        val t = text ?: return
        saveState = "Saving…"
        saveState = try {
            app.repo.writeText(spaceId, itemId, t)
            if (app.outbox.count.value > 0) "Saved on this phone" else "Saved"
        } catch (e: Exception) { errorText(e) }
    }
    LaunchedEffect(stamp) { if (stamp > 0) { delay(2000); save(); stamp = 0 } }
    DisposableEffect(Unit) { onDispose { if (stamp > 0) app.scope.launch { save() } } }

    val it = item
    val name = it?.name.orEmpty()
    val folder = it?.path?.substringBeforeLast('/', "").orEmpty()
    val fmt = Regex("\\.(story|screenplay|comic)$", RegexOption.IGNORE_CASE).find(name)?.groupValues?.get(1)?.lowercase()
    val markdownLike = Regex("\\.(md|markdown|txt)$", RegexOption.IGNORE_CASE).containsMatchIn(name)
    val canWrite = it?.canWrite != false

    Screen(
        name.ifBlank { "…" },
        back = { nav.popBackStack() },
        subtitle = listOfNotNull(folder.ifBlank { null }, saveState.ifBlank { null }, if (!canWrite) tr("android-file-readonly", "read only") else null).joinToString(" · "),
        actions = {
            IconButton({ preview = false; find = if (find == null) canWrite else null }) { Icon(androidx.compose.material.icons.Icons.Filled.Search, tr("android-find", "Find")) }
            if (fmt != null || markdownLike) IconButton({ preview = !preview }) { Icon(if (preview) Icons.Filled.Edit else Icons.Filled.Visibility, tr("android-story-preview", "Preview")) }
            if (fmt != null) {
                IconButton({ menu = true }) { Icon(Icons.Filled.MoreVert, tr("android-more", "More")) }
                DropdownMenu(menu, { menu = false }) {
                    DropdownMenuItem({
                        when (fmt) {
                            "story" -> AppText("android-file-to-story", "Make it a Crowdly story")
                            "screenplay" -> AppText("android-file-to-screenplay", "Make it a Crowdly screenplay")
                            else -> AppText("android-file-to-comic", "Make it a Crowdly comic")
                        }
                    }, {
                        menu = false
                        val t = text.orEmpty()
                        actions.run {
                            val route = when (fmt) {
                                "story" -> Routes.story(app.io.createStoryFromDoc(parseStory(t), spaceId))
                                "screenplay" -> Routes.screenplay(app.io.createScreenplayFromDoc(parseScreenplay(t)))
                                else -> Routes.comic(app.io.createComicFromDoc(parseComic(t)) { src -> spaceImage(spaceId, folder, src) }.first)
                            }
                            nav.navigate(route)
                        }
                    })
                }
            }
        },
    ) { pad ->
        val t = text
        Column(Modifier.padding(pad).fillMaxSize().imePadding()) {
            if (t == null) { Empty(error ?: "…"); return@Column }
            find?.let { replacing ->
                cloud.crowdly.app.ui.components.FindBar(listOf(t), replacing, onClose = { find = null }, onSelect = { r -> selection = r; runCatching { bodyFocus.requestFocus() } }) { q, r, mc, ww ->
                    text = cloud.crowdly.app.ui.components.replaceAll(t, q, r, mc, ww); stamp = System.nanoTime(); saveState = "Editing"
                }
            }
            if (preview) {
                Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp)) {
                    when (fmt) {
                        "story" -> StoryPreview(parseStory(t))
                        "screenplay" -> ScreenplayPreview(parseScreenplay(t))
                        "comic" -> ComicPreview(parseComic(t), spaceId, folder)
                        else -> MarkdownView(t)
                    }
                }
            } else {
                val color = MaterialTheme.colorScheme.onSurface
                BasicTextField(
                    androidx.compose.ui.text.input.TextFieldValue(t, androidx.compose.ui.text.TextRange(selection.start.coerceIn(0, t.length), selection.end.coerceIn(0, t.length))),
                    { v -> selection = v.selection; if (v.text != t) { text = v.text; stamp = System.nanoTime(); saveState = "Editing" } },
                    Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(12.dp).focusRequester(bodyFocus),
                    readOnly = !canWrite,
                    textStyle = TextStyle(color = color, fontFamily = if (markdownLike) FontFamily.Serif else FontFamily.Monospace, fontSize = if (markdownLike) 17.sp else 14.sp, lineHeight = if (markdownLike) 26.sp else 20.sp),
                    cursorBrush = SolidColor(color),
                )
            }
        }
    }
}

@Composable
fun StoryPreview(doc: StoryDoc) {
    Text(doc.title, style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.Bold)
    doc.chapters.forEach { ch ->
        Text(ch.title, Modifier.padding(top = 16.dp, bottom = 8.dp), style = MaterialTheme.typography.titleLarge)
        ch.paragraphs.forEachIndexed { i, p ->
            MarkdownView(p)
            ch.branches[i.toString()].orEmpty().forEach { b ->
                Text("⑂ ${b.name}: ${b.text}", Modifier.padding(start = 16.dp, top = 4.dp, bottom = 8.dp), color = MaterialTheme.colorScheme.secondary, fontStyle = FontStyle.Italic)
            }
        }
    }
}

@Composable
fun ScreenplayPreview(doc: ScreenplayDoc) {
    Text(doc.title, style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.Bold, fontFamily = FontFamily.Monospace)
    doc.scenes.forEach { sc ->
        Text(sc.slugline.uppercase(), Modifier.padding(top = 16.dp, bottom = 4.dp), fontFamily = FontFamily.Monospace, fontWeight = FontWeight.Bold)
        sc.blocks.forEach { b ->
            val (start, upper, italic) = when (b.type) {
                "character" -> Triple(0.35f, true, false); "dialogue" -> Triple(0.15f, false, false); "parenthetical" -> Triple(0.25f, false, true)
                "transition" -> Triple(0.5f, true, false); "shot" -> Triple(0f, true, false); else -> Triple(0f, false, false)
            }
            androidx.compose.foundation.layout.BoxWithConstraints(Modifier.fillMaxWidth()) {
                Text(if (upper) b.text.uppercase() else b.text, Modifier.padding(start = maxWidth * start, top = 2.dp), fontFamily = FontFamily.Monospace, fontStyle = if (italic) FontStyle.Italic else FontStyle.Normal)
            }
            b.branches.orEmpty().forEach { br -> Text("⑂ ${br.name}: ${br.text}", Modifier.padding(start = 16.dp), color = MaterialTheme.colorScheme.secondary, fontFamily = FontFamily.Monospace) }
        }
    }
}

@Composable
fun ComicPreview(doc: ComicDoc, spaceId: String?, folder: String) {
    val app = crowdly
    Text(doc.title, style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.Bold)
    doc.issues.forEach { issue ->
        Text(issue.title, Modifier.padding(top = 16.dp, bottom = 8.dp), style = MaterialTheme.typography.titleLarge)
        issue.pages.forEachIndexed { i, p ->
            Text("${i + 1}. ${p.alt.ifBlank { p.src }}", fontWeight = FontWeight.SemiBold)
            if (Regex("^(https?:|/)").containsMatchIn(p.src)) coil3.compose.AsyncImage(app.api.mediaUrl(p.src), p.alt, Modifier.fillMaxWidth())
            p.layers.orEmpty().forEach { l -> Text("${if (l.style == "box") "▭" else "💬"} ${l.text}", Modifier.padding(start = 16.dp)) }
            p.alternatives.orEmpty().forEach { a -> Text("⑂ ${a.name.ifBlank { "Alternative" }} (${a.src})", Modifier.padding(start = 16.dp), color = MaterialTheme.colorScheme.secondary) }
        }
    }
}
