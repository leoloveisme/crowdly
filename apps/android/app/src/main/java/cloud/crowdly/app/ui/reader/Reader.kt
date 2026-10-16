package cloud.crowdly.app.ui.reader

import android.graphics.Bitmap
import android.graphics.pdf.PdfRenderer
import android.os.ParcelFileDescriptor
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.LibraryAdd
import androidx.compose.material.icons.automirrored.filled.Notes
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.Forward30
import androidx.compose.material.icons.filled.MoreVert
import androidx.compose.material.icons.filled.Pause
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.Replay30
import androidx.compose.material.icons.filled.TextFields
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Slider
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.runtime.snapshotFlow
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.media3.common.Player
import androidx.media3.session.MediaController
import cloud.crowdly.app.crowdly
import cloud.crowdly.app.data.Discovery
import cloud.crowdly.app.data.Edition
import cloud.crowdly.app.data.WorkKind
import cloud.crowdly.app.i18n.AppText
import cloud.crowdly.app.i18n.tr
import cloud.crowdly.app.net.JsonCodec
import cloud.crowdly.app.net.asObjects
import cloud.crowdly.app.net.int
import cloud.crowdly.app.net.jsonOf
import cloud.crowdly.app.reader.Readable
import cloud.crowdly.app.reader.ReaderAudioService
import cloud.crowdly.app.reader.ReaderBlock
import cloud.crowdly.app.ui.LocalNav
import cloud.crowdly.app.ui.Routes
import cloud.crowdly.app.ui.components.Empty
import cloud.crowdly.app.ui.components.ListRow
import cloud.crowdly.app.ui.components.Screen
import cloud.crowdly.app.ui.components.errorText
import cloud.crowdly.app.ui.components.fmtTime
import cloud.crowdly.app.ui.components.inlineText
import cloud.crowdly.app.ui.components.rememberActions
import coil3.compose.AsyncImage
import java.time.Instant
import java.util.UUID
import kotlin.math.roundToInt
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.debounce
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.JsonArray

private val HIGHLIGHT = mapOf("yellow" to Color(0xFFFDE68A), "green" to Color(0xFFBBF7D0), "blue" to Color(0xFFBFDBFE), "pink" to Color(0xFFFBCFE8))
private data class ReaderTheme(val bg: Color, val fg: Color)
private val THEMES = mapOf("light" to ReaderTheme(Color.White, Color(0xFF171717)), "sepia" to ReaderTheme(Color(0xFFF4ECD8), Color(0xFF3B2F1E)), "dark" to ReaderTheme(Color(0xFF171717), Color(0xFFF5F5F5)))

/**
 * The reader (ReaderPage.tsx): stories, screenplays, comics (with editions)
 * and library books. Remembers where you were (on the server for library
 * books), records reading time, and keeps highlights with notes, synced
 * across devices for library books. Themes and text size per phone.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ReaderScreen(kind: String, id: String, edition: String?) {
    val app = crowdly
    val nav = LocalNav.current
    val actions = rememberActions()
    val scope = rememberCoroutineScope()
    var editionId by remember { mutableStateOf(edition) }
    var data by remember { mutableStateOf<Readable?>(null) }
    var error by remember { mutableStateOf<String?>(null) }
    var editions by remember { mutableStateOf<List<Edition>>(emptyList()) }
    var menu by remember { mutableStateOf(false) }
    var textMenu by remember { mutableStateOf(false) }
    var notesOpen by remember { mutableStateOf(false) }
    var highlights by remember { mutableStateOf<List<Discovery.Highlight>>(emptyList()) }
    var marking by remember { mutableStateOf<Int?>(null) }
    var theme by remember { mutableStateOf(app.db.cacheGet("reader:theme") ?: "light") }
    var size by remember { mutableIntStateOf(app.db.cacheGet("reader:size")?.toIntOrNull() ?: 18) }
    val posKey = "pos:$kind:$id:${editionId.orEmpty()}"
    val hlKey = "hl:$kind:$id"
    val list = rememberLazyListState()
    var since by remember { mutableStateOf(app.db.cacheGet("$hlKey:since")?.toLongOrNull() ?: 0L) }

    LaunchedEffect(kind, id, editionId) {
        data = null
        try {
            data = app.reader.load(kind, id, editionId)
            error = null
        } catch (e: Exception) { error = errorText(e) }
        if (kind in setOf("story", "screenplay", "comic")) editions = app.repo.editions(WorkKind.of(kind)!!, id).filter { it.status == "published" || it.mine }
    }
    val d = data
    val itemId = d?.libraryItemId

    // Highlights: local copy always; library books also sync both ways.
    LaunchedEffect(d) {
        highlights = app.db.cacheGet(hlKey)?.let { runCatching { (JsonCodec.parseToJsonElement(it) as JsonArray).asObjects().map { o -> Discovery.Highlight.from(o) } }.getOrNull() }.orEmpty()
        if (itemId != null) runCatching {
            val (server, ack) = app.discovery.syncHighlights(itemId, since, emptyList())
            val map = highlights.associateBy { it.id }.toMutableMap()
            server.forEach { map[it.id] = it }
            highlights = map.values.filter { !it.deleted }
            since = ack
            app.db.cachePut("$hlKey:since", ack.toString())
            app.db.cachePut(hlKey, JsonArray(highlights.map { it.json() }).toString())
        }
    }
    fun changeHighlights(changes: List<Discovery.Highlight>) {
        val map = highlights.associateBy { it.id }.toMutableMap()
        changes.forEach { map[it.id] = it }
        highlights = map.values.filter { !it.deleted }
        app.db.cachePut(hlKey, JsonArray(highlights.map { it.json() }).toString())
        if (itemId != null) actions.run { val (_, ack) = app.discovery.syncHighlights(itemId, since, changes); since = ack; app.db.cachePut("$hlKey:since", ack.toString()) }
    }

    // Restore and remember the position (by block).
    LaunchedEffect(d) {
        val blocks = (d as? Readable.Blocks)?.blocks ?: return@LaunchedEffect
        val local = app.db.cacheGet(posKey)?.toIntOrNull()
        val server = itemId?.let { app.discovery.position(it)?.second?.int("block") }
        val at = (server ?: local ?: 0).coerceIn(0, (blocks.size - 1).coerceAtLeast(0))
        if (at > 0) list.scrollToItem(at)
        snapshotFlow { list.firstVisibleItemIndex }.debounce(1500).collect { idx ->
            app.db.cachePut(posKey, idx.toString())
            if (itemId != null && blocks.isNotEmpty()) runCatching { app.discovery.savePosition(itemId, ((idx + 1) * 100.0 / blocks.size).roundToInt().toDouble(), jsonOf("block" to idx)) }
        }
    }

    // Reading time for library books (sent each minute and when leaving, if ≥ 10 s).
    if (itemId != null) DisposableEffect(itemId) {
        val started = Instant.now()
        var seconds = 0
        val job = scope.launch {
            var last = Instant.now()
            while (true) {
                delay(60_000)
                val now = Instant.now()
                seconds = (now.epochSecond - started.epochSecond).toInt()
                if (seconds >= 10) runCatching { app.discovery.sendSession(itemId, last.toString(), now.toString(), (now.epochSecond - last.epochSecond).toInt()) }
                last = now
            }
        }
        onDispose {
            job.cancel()
            val now = Instant.now()
            val s = (now.epochSecond - started.epochSecond).toInt() % 60
            if (s >= 10) app.scope.launch { runCatching { app.discovery.sendSession(itemId, now.minusSeconds(s.toLong()).toString(), now.toString(), s) } }
        }
    }

    val t = THEMES[theme] ?: THEMES.getValue("light")
    Screen(
        d?.title ?: "…",
        back = { nav.popBackStack() },
        subtitle = (d as? Readable.Blocks)?.author ?: editions.firstOrNull { it.id == editionId }?.name,
        actions = {
            if (d is Readable.Blocks) {
                IconButton({ textMenu = true }) { Icon(Icons.Filled.TextFields, tr("android-reader-text", "Text")) }
                IconButton({ notesOpen = true }) { Icon(Icons.AutoMirrored.Filled.Notes, tr("android-reader-notes", "Highlights and notes")) }
            }
            IconButton({ menu = true }) { Icon(Icons.Filled.MoreVert, tr("android-more", "More")) }
            DropdownMenu(menu, { menu = false }) {
                if (kind in setOf("story", "screenplay", "comic")) {
                    DropdownMenuItem({ AppText("android-reader-open-editor", "Open in the editor") }, { menu = false; nav.navigate(Routes.work(kind, id)) }, leadingIcon = { Icon(Icons.Filled.Edit, null) })
                    if (editions.isNotEmpty()) {
                        DropdownMenuItem({ AppText("android-reader-current", "Current text") }, { menu = false; editionId = null })
                        editions.forEach { e -> DropdownMenuItem({ Text("${tr("android-reader-edition", "Edition")}: ${e.name}") }, { menu = false; editionId = e.id }) }
                    }
                }
                if (kind == "story") DropdownMenuItem({ AppText("android-reader-add-library", "Add to my library") }, {
                    menu = false; actions.run(tr0("Added to your library")) { app.discovery.addLibraryStory(id) }
                }, leadingIcon = { Icon(Icons.Filled.LibraryAdd, null) })
            }
            DropdownMenu(textMenu, { textMenu = false }) {
                Row(Modifier.padding(horizontal = 8.dp), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    THEMES.keys.forEach { k -> FilterChip(theme == k, { theme = k; app.db.cachePut("reader:theme", k) }, { Text(k) }) }
                }
                Row(Modifier.padding(horizontal = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                    TextButton({ size = (size - 2).coerceAtLeast(12); app.db.cachePut("reader:size", size.toString()) }) { Text("A−") }
                    Text("$size")
                    TextButton({ size = (size + 2).coerceAtMost(32); app.db.cachePut("reader:size", size.toString()) }) { Text("A+") }
                }
            }
        },
    ) { pad ->
        Box(Modifier.padding(pad).fillMaxSize().background(t.bg)) {
            when (d) {
                null -> Empty(error ?: "…")
                is Readable.Pdf -> PdfView(d)
                is Readable.Audio -> AudioView(d)
                is Readable.Blocks -> {
                    val progress by remember(d) { androidx.compose.runtime.derivedStateOf { if (d.blocks.isEmpty()) 0f else (list.firstVisibleItemIndex + 1f) / d.blocks.size } }
                    Column(Modifier.fillMaxSize()) {
                        LinearProgressIndicator({ progress }, Modifier.fillMaxWidth())
                        androidx.compose.runtime.CompositionLocalProvider(LocalLayoutDirection provides if (d.rtl && d.comic) LayoutDirection.Rtl else LocalLayoutDirection.current) {
                            LazyColumn(Modifier.fillMaxSize(), state = list, contentPadding = androidx.compose.foundation.layout.PaddingValues(horizontal = 20.dp, vertical = 16.dp)) {
                                itemsIndexed(d.blocks) { i, b ->
                                    val hl = highlights.firstOrNull { it.block == i }
                                    Box(
                                        Modifier.fillMaxWidth()
                                            .background(hl?.let { HIGHLIGHT[it.color] } ?: Color.Transparent, RoundedCornerShape(4.dp))
                                            .combinedClickable(onClick = {}, onLongClick = { marking = i })
                                            .padding(vertical = 6.dp),
                                    ) { BlockView(b, if (hl != null) Color(0xFF171717) else t.fg, size) }
                                }
                                if (d.blocks.isEmpty()) item { Empty(tr("android-reader-empty", "Nothing to read here yet.")) }
                            }
                        }
                    }
                }
            }
        }
    }

    marking?.let { i ->
        val b = (d as? Readable.Blocks)?.blocks?.getOrNull(i) ?: return@let
        val existing = highlights.firstOrNull { it.block == i }
        var note by remember(i) { mutableStateOf(existing?.note.orEmpty()) }
        AlertDialog(
            onDismissRequest = { marking = null },
            title = { AppText("android-reader-highlight", "Highlight") },
            text = {
                Column {
                    Text(b.plain.take(200), style = MaterialTheme.typography.bodySmall, maxLines = 4)
                    Row(Modifier.padding(vertical = 8.dp), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        HIGHLIGHT.forEach { (name, c) ->
                            Box(Modifier.size(36.dp).background(c, CircleShape).border(if (existing?.color == name) 3.dp else 1.dp, Color.DarkGray, CircleShape).combinedClickable(onClick = {
                                changeHighlights(listOf(Discovery.Highlight(existing?.id ?: UUID.randomUUID().toString(), name, note, b.plain.take(500), i)))
                                marking = null
                            }))
                        }
                    }
                    OutlinedTextField(note, { note = it }, Modifier.fillMaxWidth(), label = { AppText("android-reader-note", "Note") })
                }
            },
            confirmButton = { Button({ changeHighlights(listOf(Discovery.Highlight(existing?.id ?: UUID.randomUUID().toString(), existing?.color ?: "yellow", note, b.plain.take(500), i))); marking = null }) { AppText("android-save", "Save") } },
            dismissButton = { if (existing != null) TextButton({ changeHighlights(listOf(existing.copy(deleted = true, updatedAt = Instant.now().toString()))); marking = null }) { AppText("android-reader-remove-highlight", "Remove highlight") } },
        )
    }
    if (notesOpen) ModalBottomSheet({ notesOpen = false }) {
        Column(Modifier.heightIn(max = 560.dp).verticalScroll(rememberScrollState()).padding(bottom = 24.dp)) {
            AppText("android-reader-notes", "Highlights and notes", Modifier.padding(16.dp), style = MaterialTheme.typography.titleMedium)
            if (highlights.isEmpty()) Empty(tr("android-reader-no-notes", "Long-press a paragraph to highlight it or add a note."))
            highlights.sortedBy { it.block }.forEach { h ->
                ListRow(h.quote.take(140), subtitle = h.note.ifBlank { null }, leading = { Box(Modifier.size(14.dp).background(HIGHLIGHT[h.color] ?: Color.Yellow, CircleShape)) }, onClick = {
                    notesOpen = false
                    scope.launch { list.animateScrollToItem(h.block) }
                })
            }
        }
    }
}

private fun tr0(s: String) = s

@Composable
private fun BlockView(b: ReaderBlock, fg: Color, size: Int) {
    val link = MaterialTheme.colorScheme.secondary
    when (b) {
        is ReaderBlock.Heading -> Text(b.text, color = fg, fontSize = (size + when (b.level) { 1 -> 10; 2 -> 6; else -> 3 }).sp, fontWeight = FontWeight.SemiBold, modifier = Modifier.padding(top = 12.dp))
        is ReaderBlock.Text -> Text(inlineText(b.markdown, link), color = fg, fontSize = size.sp, lineHeight = (size * 1.6).sp, fontFamily = FontFamily.Serif)
        is ReaderBlock.Script -> {
            val (start, upper, italic, align) = when (b.type) {
                "character" -> listOf(0f, true, false, TextAlign.Center)
                "dialogue" -> listOf(0.15f, false, false, TextAlign.Start)
                "parenthetical" -> listOf(0.25f, false, true, TextAlign.Start)
                "transition" -> listOf(0f, true, false, TextAlign.End)
                "shot", "scene_heading" -> listOf(0f, true, false, TextAlign.Start)
                else -> listOf(0f, false, false, TextAlign.Start)
            }
            BoxWithConstraints(Modifier.fillMaxWidth()) {
                Text(
                    if (upper as Boolean) b.text.uppercase() else b.text, Modifier.fillMaxWidth().padding(start = maxWidth * (start as Float), end = maxWidth * (start)),
                    color = fg, fontSize = (size - 2).sp, fontFamily = FontFamily.Monospace, textAlign = align as TextAlign, fontStyle = if (italic as Boolean) FontStyle.Italic else FontStyle.Normal,
                )
            }
        }
        is ReaderBlock.Image -> BoxWithConstraints(Modifier.fillMaxWidth()) {
            val w = constraints.maxWidth.toFloat()
            var h by remember { mutableFloatStateOf(0f) }
            AsyncImage(b.src, b.alt, Modifier.fillMaxWidth(), contentScale = ContentScale.FillWidth, onSuccess = { s -> h = w * s.painter.intrinsicSize.height / s.painter.intrinsicSize.width.coerceAtLeast(1f) })
            // Text layers over comic pages (percent positions).
            b.overlays.forEach { l ->
                Box(
                    Modifier.offset { IntOffset((w * l.x / 100).roundToInt(), (h * l.y / 100).roundToInt()) }.offset((-60).dp, (-14).dp).widthIn(max = 180.dp)
                        .background(if (l.style == "box") Color(0xFFFEF3C7) else Color.White, RoundedCornerShape(if (l.style == "box") 2.dp else 14.dp))
                        .border(1.dp, Color.Black, RoundedCornerShape(if (l.style == "box") 2.dp else 14.dp)).padding(horizontal = 8.dp, vertical = 3.dp),
                ) { Text(l.text, color = Color.Black, fontSize = (size - 5).sp) }
            }
        }
    }
}

/** PDF pages rendered with Android's PdfRenderer, one image per page. */
@Composable
private fun PdfView(d: Readable.Pdf) {
    val density = LocalDensity.current
    BoxWithConstraints(Modifier.fillMaxSize()) {
        val widthPx = with(density) { maxWidth.roundToPx() }
        val renderer = remember(d.file) { PdfRenderer(ParcelFileDescriptor.open(d.file, ParcelFileDescriptor.MODE_READ_ONLY)) }
        DisposableEffect(renderer) { onDispose { runCatching { renderer.close() } } }
        val lock = remember { Any() }
        LazyColumn(Modifier.fillMaxSize(), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            items(renderer.pageCount) { i ->
                var bmp by remember { mutableStateOf<Bitmap?>(null) }
                LaunchedEffect(i, widthPx) {
                    bmp = withContext(Dispatchers.IO) {
                        synchronized(lock) {
                            renderer.openPage(i).use { p ->
                                val h = (widthPx.toFloat() * p.height / p.width).roundToInt()
                                Bitmap.createBitmap(widthPx, h, Bitmap.Config.ARGB_8888).also { it.eraseColor(android.graphics.Color.WHITE); p.render(it, null, null, PdfRenderer.Page.RENDER_MODE_FOR_DISPLAY) }
                            }
                        }
                    }
                }
                bmp?.let { Image(it.asImageBitmap(), "Page ${i + 1}", Modifier.fillMaxWidth()) } ?: Box(Modifier.fillMaxWidth().heightIn(min = 400.dp))
            }
        }
    }
}

/** Audiobooks through the background audio service, with position kept per book. */
@Composable
private fun AudioView(d: Readable.Audio) {
    val app = crowdly
    val context = LocalContext.current
    var controller by remember { mutableStateOf<MediaController?>(null) }
    var playing by remember { mutableStateOf(false) }
    var pos by remember { mutableFloatStateOf(0f) }
    var dur by remember { mutableFloatStateOf(0f) }
    var speed by remember { mutableFloatStateOf(1f) }
    LaunchedEffect(d.url) {
        val c = ReaderAudioService.controller(context, d.url, d.title)
        controller = c
        val saved = d.libraryItemId?.let { app.discovery.position(it)?.second?.int("ms") }
        if (saved != null && c.currentPosition < 1000) c.seekTo(saved.toLong())
        c.addListener(object : Player.Listener { override fun onIsPlayingChanged(isPlaying: Boolean) { playing = isPlaying } })
        playing = c.isPlaying
        var lastSaved = 0L
        while (true) {
            pos = c.currentPosition.toFloat()
            dur = c.duration.takeIf { it > 0 }?.toFloat() ?: 0f
            val id = d.libraryItemId
            if (id != null && playing && System.currentTimeMillis() - lastSaved > 15_000 && dur > 0) {
                lastSaved = System.currentTimeMillis()
                runCatching { app.discovery.savePosition(id, (pos * 100.0 / dur).roundToInt().toDouble(), jsonOf("ms" to pos.toLong())) }
            }
            delay(500)
        }
    }
    DisposableEffect(Unit) { onDispose { controller?.release() } }
    val c = controller
    Column(Modifier.fillMaxSize().padding(24.dp), verticalArrangement = Arrangement.Center, horizontalAlignment = Alignment.CenterHorizontally) {
        Text(d.title, style = MaterialTheme.typography.headlineSmall, textAlign = TextAlign.Center)
        Slider(pos.coerceAtMost(dur.coerceAtLeast(1f)), { c?.seekTo(it.toLong()); pos = it }, Modifier.fillMaxWidth().padding(top = 24.dp), valueRange = 0f..dur.coerceAtLeast(1f))
        Text("${fmtTime(pos.toLong())} / ${fmtTime(dur.toLong())}")
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(16.dp), modifier = Modifier.padding(top = 16.dp)) {
            IconButton({ c?.seekTo((c.currentPosition - 30_000).coerceAtLeast(0)) }) { Icon(Icons.Filled.Replay30, tr("android-reader-back30", "Back 30 seconds")) }
            IconButton({ if (c?.isPlaying == true) c.pause() else c?.play() }, Modifier.size(64.dp).background(MaterialTheme.colorScheme.primary, CircleShape)) {
                Icon(if (playing) Icons.Filled.Pause else Icons.Filled.PlayArrow, null, tint = MaterialTheme.colorScheme.onPrimary)
            }
            IconButton({ c?.seekTo(c.currentPosition + 30_000) }) { Icon(Icons.Filled.Forward30, tr("android-reader-fwd30", "Forward 30 seconds")) }
        }
        Row(horizontalArrangement = Arrangement.spacedBy(6.dp), modifier = Modifier.padding(top = 16.dp)) {
            listOf(0.8f, 1f, 1.25f, 1.5f, 2f).forEach { s -> FilterChip(speed == s, { speed = s; c?.setPlaybackSpeed(s) }, { Text("${s}×") }) }
        }
    }
}

