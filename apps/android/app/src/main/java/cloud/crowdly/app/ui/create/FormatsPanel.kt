package cloud.crowdly.app.ui.create

import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Star
import androidx.compose.material.icons.filled.StarBorder
import androidx.compose.material3.Button
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Tab
import androidx.compose.material3.TabRow
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import cloud.crowdly.app.crowdly
import cloud.crowdly.app.data.AiConnection
import cloud.crowdly.app.data.AiJob
import cloud.crowdly.app.data.Chapter
import cloud.crowdly.app.data.ChapterMedia
import cloud.crowdly.app.data.Locale
import cloud.crowdly.app.data.MediaList
import cloud.crowdly.app.data.StoryTitle
import cloud.crowdly.app.data.Translations
import cloud.crowdly.app.i18n.AppText
import cloud.crowdly.app.i18n.tr
import cloud.crowdly.app.net.s
import cloud.crowdly.app.net.str
import cloud.crowdly.app.ui.LocalNav
import cloud.crowdly.app.ui.Routes
import cloud.crowdly.app.ui.components.AudioRow
import cloud.crowdly.app.ui.components.Empty
import cloud.crowdly.app.ui.components.ListRow
import cloud.crowdly.app.ui.components.Pill
import cloud.crowdly.app.ui.components.SectionTitle
import cloud.crowdly.app.ui.components.SoftCard
import cloud.crowdly.app.ui.components.readPicked
import cloud.crowdly.app.ui.components.rememberActions
import cloud.crowdly.app.ui.more.openInBrowser
import coil3.compose.AsyncImage

/**
 * Story formats (audio / cartoon / video per chapter), translations and
 * bring-your-own-AI jobs: the web app's FormatsPanel.tsx, which reuses the
 * platform's components (Documentation/Story_formats_Audio_Cartoon_Video_…md).
 */
@Composable
fun FormatsPanel(story: StoryTitle, chapter: Chapter?, paragraphs: List<String>, canEdit: Boolean) {
    val app = crowdly
    val nav = LocalNav.current
    val actions = rememberActions()
    var translations by remember { mutableStateOf<Translations?>(null) }
    var media by remember { mutableStateOf<MediaList?>(null) }
    var jobs by remember { mutableStateOf<List<AiJob>>(emptyList()) }
    var connections by remember { mutableStateOf<List<AiConnection>>(emptyList()) }
    var locales by remember { mutableStateOf<List<Locale>>(emptyList()) }
    var tab by remember { mutableIntStateOf(0) }
    var tick by remember { mutableIntStateOf(0) }
    var translating by remember { mutableStateOf(false) }

    LaunchedEffect(story.id, tick) {
        translations = app.repo.translations(story.id)
        jobs = if (canEdit) app.repo.aiJobs(story.id) else emptyList()
        connections = app.repo.aiConnections()
        if (locales.isEmpty()) locales = runCatching { app.repo.locales() }.getOrDefault(emptyList())
    }
    LaunchedEffect(chapter?.id, tick) { media = chapter?.let { runCatching { app.repo.chapterMedia(it.id) }.getOrNull() } }
    // Running AI jobs: check back every few seconds.
    LaunchedEffect(jobs) {
        if (jobs.any { it.status == "queued" || it.status == "running" }) { kotlinx.coroutines.delay(4000); tick++ }
    }

    PanelTitle("android-formats-title", "Formats and translations")
    Column(Modifier.heightIn(max = 680.dp).verticalScroll(rememberScrollState())) {
        // --- language versions ---
        SectionTitle(tr("android-formats-languages", "Languages")) {
            if (translations?.canTranslate == true) TextButton({ translating = true }) { AppText("android-formats-translate", "Translate") }
        }
        translations?.versions?.forEach { v ->
            ListRow(
                "${v.title} · ${v.language}",
                subtitle = listOfNotNull(
                    if (v.isOriginal) tr("android-formats-original", "original") else null,
                    if (v.isOfficial) tr("android-formats-official", "official") else null,
                    if (!v.isOriginal) "${v.translated}/${v.chapters}" else null,
                    if (v.stale > 0) "${v.stale} ${tr("android-formats-stale", "out of date")}" else null,
                    v.creator,
                ).joinToString(" · "),
                trailing = if (translations?.canMarkOfficial == true && !v.isOriginal) ({
                    IconButton({ actions.run { app.repo.setOfficial(v.id, !v.isOfficial); tick++ } }) { Icon(if (v.isOfficial) Icons.Filled.Star else Icons.Filled.StarBorder, tr("android-formats-official", "official")) }
                }) else null,
                onClick = if (v.id != story.id) ({ nav.navigate(Routes.story(v.id)) }) else null,
            )
        } ?: Empty(tr("android-formats-no-languages", "Only the original language so far."))

        // --- AI jobs ---
        if (jobs.isNotEmpty()) {
            SectionTitle(tr("android-formats-ai-jobs", "AI jobs"))
            jobs.take(8).forEach { j ->
                ListRow(
                    "${jobLabel(j.kind)} · ${j.chapterTitle.orEmpty()}",
                    subtitle = j.error ?: j.status,
                    trailing = if (j.mine && (j.status == "queued" || j.status == "running")) ({ IconButton({ actions.run { app.repo.cancelAiJob(j.id); tick++ } }) { Icon(Icons.Filled.Close, tr("android-cancel", "Cancel")) } }) else null,
                )
                if (j.status == "running" && j.progress != null) LinearProgressIndicator({ j.progress.toFloat().coerceIn(0f, 1f) }, Modifier.fillMaxWidth().padding(horizontal = 16.dp))
            }
        }

        // --- this chapter's audio / cartoon / video ---
        if (chapter == null) return@Column
        TabRow(tab) {
            listOf(tr("android-formats-audio", "Audio"), tr("android-formats-cartoon", "Cartoon"), tr("android-formats-video", "Video")).forEachIndexed { i, t -> Tab(tab == i, { tab = i }, text = { Text(t) }) }
        }
        val list = media
        if (list == null) { Empty(tr("android-formats-no-media", "Couldn't load this chapter's formats.")); return@Column }
        val kind = listOf("audio", "visual", "video")[tab]
        MediaKindSection(kind, chapter, paragraphs, list, connections, canEdit) { tick++ }
    }

    if (translating) TranslateDialog(locales, connections.filter { "translate" in it.capabilities }, onDismiss = { translating = false }) { lang, start, conn ->
        translating = false
        actions.run {
            val r = app.repo.createTranslation(story.id, lang, start, conn)
            r.str("ai_error")?.let { throw IllegalStateException(tr0AiError(it)) }
            nav.navigate(Routes.story(r.s("story_title_id")))
        }
    }
}

private fun tr0AiError(e: String) = "Translation created, but AI drafting didn't start: $e"

fun jobLabel(kind: String) = when (kind) {
    "translate_chapter" -> "Translation"
    "tts_chapter" -> "Narration"
    "comic_frames" -> "Cartoon"
    "video_chapter" -> "Video"
    else -> kind
}

@Composable
private fun MediaKindSection(kind: String, chapter: Chapter, paragraphs: List<String>, list: MediaList, connections: List<AiConnection>, canEdit: Boolean, changed: () -> Unit) {
    val app = crowdly
    val context = LocalContext.current
    val actions = rememberActions()
    val items = list.media.filter { it.kind == kind }
    var label by remember(kind) { mutableStateOf("") }
    var embed by remember(kind) { mutableStateOf("") }
    var aiPrompt by remember(kind) { mutableStateOf("") }

    val audioPicker = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
        if (uri != null) actions.run(tr0("Narration uploaded")) {
            val f = readPicked(context, uri, "file")
            app.repo.uploadNarration(chapter.id, f.name, f.mime, f.bytes, label.ifBlank { null })
            changed()
        }
    }
    val framesPicker = rememberLauncherForActivityResult(ActivityResultContracts.PickMultipleVisualMedia(50)) { uris ->
        if (uris.isNotEmpty()) actions.run {
            val parts = uris.map { readPicked(context, it, "images") }
            app.repo.createPresentation(chapter.id, parts, label.ifBlank { null })
            changed()
        }
    }

    if (items.isEmpty()) Empty(
        when (kind) {
            "audio" -> tr("android-formats-audio-empty", "No narration for this chapter yet.")
            "visual" -> tr("android-formats-cartoon-empty", "No cartoon for this chapter yet.")
            else -> tr("android-formats-video-empty", "No video for this chapter yet.")
        },
    )
    items.forEach { m -> MediaCard(m, list.canModerate, changed) }

    val canAdd = kind != "audio" || list.canNarrate || canEdit
    if (!canAdd) return
    SectionTitle(tr("android-formats-add", "Add"))
    OutlinedTextField(label, { label = it }, Modifier.fillMaxWidth().padding(horizontal = 16.dp), singleLine = true, label = { AppText("android-formats-label", "Label (optional)") })
    Row(Modifier.padding(16.dp).horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        when (kind) {
            "audio" -> {
                Button({ audioPicker.launch(arrayOf("audio/*")) }) { AppText("android-formats-upload-audio", "Upload narration") }
                val tts = connections.filter { "tts" in it.capabilities }
                if (tts.isNotEmpty()) ConnectionButton(tr("android-formats-ai-narrate", "Narrate with AI"), tts) { c -> actions.run(tr0("Narration queued")) { app.repo.aiNarrate(chapter.id, c.id, label.ifBlank { null }); changed() } }
            }
            "visual" -> {
                Button({ framesPicker.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly)) }) { AppText("android-formats-add-frames", "Make a cartoon from pictures") }
                val text = connections.filter { "translate" in it.capabilities }
                val image = connections.filter { "image" in it.capabilities }
                if (text.isNotEmpty() && image.isNotEmpty()) ConnectionButton(tr("android-formats-ai-cartoon", "Draw with AI"), image) { c ->
                    actions.run(tr0("Cartoon queued")) { app.repo.aiComic(chapter.id, text.first().id, c.id, 0, (paragraphs.size - 1).coerceAtLeast(0), minOf(6, paragraphs.size.coerceAtLeast(1)), null); changed() }
                }
            }
            else -> {
                OutlinedTextField(embed, { embed = it }, Modifier.size(width = 220.dp, height = 56.dp), singleLine = true, placeholder = { Text("https://youtube.com/…") })
                Button({ actions.run { app.repo.addVideoEmbed(chapter.id, embed.trim(), label.ifBlank { null }); embed = ""; changed() } }, enabled = embed.isNotBlank()) { AppText("android-formats-add-video", "Add video link") }
                val video = connections.filter { "video" in it.capabilities }
                if (video.isNotEmpty()) ConnectionButton(tr("android-formats-ai-video", "Make a video with AI"), video) { c ->
                    actions.run(tr0("Video queued")) { app.repo.aiVideo(chapter.id, c.id, aiPrompt.ifBlank { paragraphs.firstOrNull().orEmpty().take(500) }, 8); changed() }
                }
            }
        }
    }
    if (kind == "video" && connections.any { "video" in it.capabilities }) {
        OutlinedTextField(aiPrompt, { aiPrompt = it }, Modifier.fillMaxWidth().padding(horizontal = 16.dp), label = { AppText("android-formats-ai-prompt", "What should the AI video show? (optional)") })
    }
}

private fun tr0(s: String) = s

@Composable
private fun ConnectionButton(label: String, connections: List<AiConnection>, onPick: (AiConnection) -> Unit) {
    var open by remember { mutableStateOf(false) }
    OutlinedButton({ if (connections.size == 1) onPick(connections[0]) else open = true }) { Text(label) }
    DropdownMenu(open, { open = false }) { connections.forEach { c -> DropdownMenuItem({ Text(c.name) }, { open = false; onPick(c) }) } }
}

@Composable
private fun MediaCard(m: ChapterMedia, canModerate: Boolean, changed: () -> Unit) {
    val app = crowdly
    val context = LocalContext.current
    val actions = rememberActions()
    SoftCard {
        Column(Modifier.padding(12.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) {
                    Text(m.label ?: when (m.kind) { "audio" -> "Narration"; "visual" -> "Cartoon"; else -> "Video" }, fontWeight = FontWeight.SemiBold)
                    Text(listOfNotNull(m.creator, m.source, m.editionName, if (m.primary) "★" else null).joinToString(" · "), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
                if (m.status != "approved") Pill(m.status)
                if (canModerate && m.status == "pending") {
                    IconButton({ actions.run { app.repo.updateMedia(m.id, "status" to "approved"); changed() } }) { Icon(Icons.Filled.Check, tr("android-review-approve", "Approve")) }
                }
                if (canModerate && !m.primary && m.status == "approved") {
                    IconButton({ actions.run { app.repo.updateMedia(m.id, "isPrimary" to true); changed() } }) { Icon(Icons.Filled.StarBorder, tr("android-formats-primary", "Make primary")) }
                }
                if (m.mine || canModerate) IconButton({ actions.run { app.repo.deleteMedia(m.id); changed() } }) { Icon(Icons.Filled.Delete, tr("android-delete", "Delete")) }
            }
            when {
                m.kind == "audio" && m.url != null -> AudioRow(m.url)
                m.kind == "visual" -> Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    m.frames.forEach { f -> AsyncImage(app.api.mediaUrl(f.imageUrl), f.caption, Modifier.size(96.dp), contentScale = ContentScale.Crop) }
                }
                m.kind == "video" && m.url != null -> {
                    if (m.source == "embed") TextButton({ openInBrowser(context, m.url) }) { Text(m.url, maxLines = 1) }
                    else AudioRow(m.url)
                }
            }
        }
    }
}

/** Start a translation: language, then copy / blank / AI draft (TranslateStoryDialog). */
@Composable
fun TranslateDialog(locales: List<Locale>, ai: List<AiConnection>, onDismiss: () -> Unit, onCreate: (String, String, String?) -> Unit) {
    var language by remember { mutableStateOf<Locale?>(null) }
    var start by remember { mutableStateOf("copy") }
    var connection by remember { mutableStateOf(ai.firstOrNull()) }
    androidx.compose.material3.AlertDialog(
        onDismissRequest = onDismiss,
        title = { AppText("android-formats-translate", "Translate") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                LanguagePicker(locales, language) { language = it }
                Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    FilterChip(start == "copy", { start = "copy" }, { AppText("android-formats-start-copy", "Start from a copy") })
                    FilterChip(start == "blank", { start = "blank" }, { AppText("android-formats-start-blank", "Blank") })
                    if (ai.isNotEmpty()) FilterChip(start == "ai", { start = "ai" }, { AppText("android-formats-start-ai", "AI draft") })
                }
                if (start == "ai" && ai.size > 1) {
                    var open by remember { mutableStateOf(false) }
                    OutlinedButton({ open = true }) { Text(connection?.name ?: "") }
                    DropdownMenu(open, { open = false }) { ai.forEach { c -> DropdownMenuItem({ Text(c.name) }, { connection = c; open = false }) } }
                }
            }
        },
        confirmButton = { Button({ onCreate(language!!.code, start, if (start == "ai") connection?.id else null) }, enabled = language != null) { AppText("android-change-translate-start", "Start translating") } },
        dismissButton = { TextButton(onDismiss) { AppText("android-cancel", "Cancel") } },
    )
}
