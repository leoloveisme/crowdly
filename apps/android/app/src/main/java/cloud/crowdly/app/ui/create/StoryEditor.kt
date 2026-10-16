package cloud.crowdly.app.ui.create

import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.List
import androidx.compose.material.icons.filled.AccountTree
import androidx.compose.material.icons.filled.AddPhotoAlternate
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.MoreVert
import androidx.compose.material.icons.filled.Visibility
import androidx.compose.material3.Button
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import cloud.crowdly.app.crowdly
import cloud.crowdly.app.data.Chapter
import cloud.crowdly.app.data.ParagraphBranch
import cloud.crowdly.app.data.StoryTitle
import cloud.crowdly.app.data.WorkKind
import cloud.crowdly.app.i18n.AppText
import cloud.crowdly.app.i18n.tr
import cloud.crowdly.app.net.jsonOf
import cloud.crowdly.app.ui.LocalNav
import cloud.crowdly.app.ui.Routes
import cloud.crowdly.app.ui.components.Confirm
import cloud.crowdly.app.ui.components.Empty
import cloud.crowdly.app.ui.components.LocalSnack
import cloud.crowdly.app.ui.components.MarkdownView
import cloud.crowdly.app.ui.components.Screen
import cloud.crowdly.app.ui.components.TextPrompt
import cloud.crowdly.app.ui.components.errorText
import cloud.crowdly.app.ui.components.readPicked
import cloud.crowdly.app.ui.components.rememberActions
import cloud.crowdly.app.ui.more.openInBrowser
import cloud.crowdly.core.text.countWords
import cloud.crowdly.core.text.joinParagraphs
import cloud.crowdly.core.text.mdToPlain
import cloud.crowdly.core.text.splitParagraphs
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

private const val AUTOSAVE_MS = 2000L // desktop: autosave 2 s after typing stops

data class Draft(val title: String, val md: String)

enum class StoryPanel { CHAPTERS, BRANCHES, COMMENTS, REVIEW, FORMATS, EDITIONS, REVISIONS, METADATA, CHANGE, EXPORT }

/**
 * The story editor (apps/web/src/creation/story/StoryEditor.tsx): chapters,
 * one Markdown text per chapter with autosave, branches, comments, owner
 * review, formats and translations, editions, revisions, metadata, "I want to
 * change this" (suggestion copy, clone, translate, collaborate) and export.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun StoryEditorScreen(id: String) {
    val app = crowdly
    val nav = LocalNav.current
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val actions = rememberActions()

    var story by remember { mutableStateOf<StoryTitle?>(null) }
    var chapters by remember { mutableStateOf<List<Chapter>>(emptyList()) }
    var role by remember { mutableStateOf<String?>(null) }
    var branches by remember { mutableStateOf<List<ParagraphBranch>>(emptyList()) }
    var activeId by remember { mutableStateOf<String?>(null) }
    val drafts = remember { mutableStateMapOf<String, Draft>() }
    val dirty = remember { mutableStateMapOf<String, Long>() }
    var error by remember { mutableStateOf<String?>(null) }
    var panel by remember { mutableStateOf<StoryPanel?>(null) }
    var suggesting by remember { mutableStateOf(false) }
    var preview by remember { mutableStateOf(false) }
    var menu by remember { mutableStateOf(false) }
    var renaming by remember { mutableStateOf(false) }
    var confirmDelete by remember { mutableStateOf(false) }
    var saveState by remember { mutableStateOf("") }
    var reloadTick by remember { mutableStateOf(0) }
    var find by remember { mutableStateOf<Boolean?>(null) } // null: closed, false: find, true: find and replace
    var selection by remember { mutableStateOf(androidx.compose.ui.text.TextRange.Zero) }
    val bodyFocus = remember { androidx.compose.ui.focus.FocusRequester() }

    val isOwner = role == "owner"
    val canEdit = isOwner || suggesting

    suspend fun load() {
        try {
            val s = app.repo.story(id)
            val ch = app.repo.chapters(id)
            role = app.repo.storyRole(id)
            story = s
            chapters = ch
            for (c in ch) if (c.id !in dirty) drafts[c.id] = Draft(c.title, joinParagraphs(c.paragraphs))
            if (activeId == null || ch.none { it.id == activeId }) activeId = ch.firstOrNull()?.id
            branches = app.repo.storyBranches(id)
            error = null
        } catch (e: Exception) {
            error = errorText(e)
        }
    }
    LaunchedEffect(id, reloadTick) { load() }

    suspend fun flush() {
        if (!isOwner) return
        val ids = dirty.keys.toList()
        if (ids.isEmpty()) return
        saveState = tr0("saving")
        var failed = false
        for (cid in ids) {
            val d = drafts[cid] ?: continue
            val stamp = dirty[cid]
            val paragraphs = splitParagraphs(d.md)
            try {
                app.repo.saveChapter(cid, d.title, paragraphs)
                if (dirty[cid] == stamp) dirty.remove(cid)
                chapters = chapters.map { if (it.id == cid) it.copy(title = d.title, paragraphs = paragraphs) else it }
                // Mirror into the chapter's CRDT doc so revision history sees app edits too (best effort).
                scope.launch {
                    runCatching {
                        val key = app.repo.ensureDoc("docType" to "chapter", "chapterId" to cid)
                        app.repo.applyContent(key, jsonOf("title" to d.title, "paragraphs" to paragraphs))
                    }
                }
            } catch (e: Exception) {
                failed = true
                saveState = errorText(e)
            }
        }
        if (!failed) saveState = if (app.outbox.count.value > 0) tr0("queued") else tr0("saved")
    }

    // Autosave 2 s after the last keystroke.
    val dirtyStamp = dirty.values.maxOrNull()
    LaunchedEffect(dirtyStamp, isOwner) {
        if (dirtyStamp != null && isOwner) {
            delay(AUTOSAVE_MS)
            flush()
        }
    }
    DisposableEffect(Unit) { onDispose { app.scope.launch { flush() } } }

    fun update(d: Draft) {
        val cid = activeId ?: return
        if (!canEdit) return
        drafts[cid] = d
        dirty[cid] = System.nanoTime()
        if (isOwner) saveState = tr0("editing")
    }

    val imagePicker = rememberLauncherForActivityResult(ActivityResultContracts.PickVisualMedia()) { uri ->
        val cid = activeId
        if (uri != null && cid != null) actions.run {
            val f = readPicked(context, uri, "images")
            val url = app.repo.uploadStoryImage(id, cid, f.name, f.mime, f.bytes)
            val d = drafts[cid] ?: Draft("", "")
            update(d.copy(md = d.md.trimEnd() + "\n\n![${f.name.substringBeforeLast('.')}]($url)\n"))
        }
    }

    val s = story
    val active = activeId?.let { drafts[it] }
    val words = drafts.values.sumOf { countWords(mdToPlain(it.md)) }

    Screen(
        s?.title ?: "…",
        back = { nav.popBackStack() },
        subtitle = listOfNotNull(active?.title?.ifBlank { null }, "$words ${tr("android-words", "words")}", saveState.ifBlank { null }).joinToString(" · "),
        actions = {
            IconButton({ panel = StoryPanel.CHAPTERS }) { Icon(Icons.AutoMirrored.Filled.List, tr("android-story-chapters", "Chapters")) }
            IconButton({ panel = StoryPanel.BRANCHES }) { Icon(Icons.Filled.AccountTree, tr("android-story-branches", "Branches")) }
            IconButton({ preview = !preview }) { Icon(if (preview) Icons.Filled.Edit else Icons.Filled.Visibility, tr("android-story-preview", "Preview")) }
            IconButton({ menu = true }) { Icon(Icons.Filled.MoreVert, tr("android-more", "More")) }
            DropdownMenu(menu, { menu = false }) {
                fun item(idKey: String, label: String, on: () -> Unit) = @Composable { DropdownMenuItem({ AppText(idKey, label) }, { menu = false; on() }) }
                item("android-find", "Find") { preview = false; find = false }()
                if (canEdit) item("android-replace", "Replace") { preview = false; find = true }()
                if (isOwner) item("android-story-insert-image", "Insert image") { imagePicker.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly)) }()
                item("android-story-comments", "Comments") { panel = StoryPanel.COMMENTS }()
                if (isOwner) item("android-story-review", "Suggestions and requests") { panel = StoryPanel.REVIEW }()
                item("android-story-formats", "Formats and translations") { panel = StoryPanel.FORMATS }()
                item("android-story-editions", "Editions") { panel = StoryPanel.EDITIONS }()
                if (activeId != null) item("android-story-revisions", "Compare revisions") { scope.launch { flush(); panel = StoryPanel.REVISIONS } }()
                item("android-story-metadata", "Story metadata") { panel = StoryPanel.METADATA }()
                item("android-story-read", "Read") { nav.navigate(Routes.read("story", id)) }()
                item("android-export", "Export or share") { scope.launch { flush(); panel = StoryPanel.EXPORT } }()
                if (!isOwner) item("android-story-change", "I want to change this") { panel = StoryPanel.CHANGE }()
                item("android-open-platform", "Open on the platform") { openInBrowser(context, "${app.prefs.platformUrl}/story/$id") }()
                if (isOwner) item("android-story-rename", "Rename story") { renaming = true }()
                if (isOwner) item("android-story-delete", "Delete story") { confirmDelete = true }()
            }
        },
    ) { pad ->
        Column(Modifier.padding(pad).fillMaxSize().imePadding()) {
            if (error != null && s == null) {
                Empty(tr("android-story-error", "This story couldn't be opened.") + "\n" + error)
                return@Column
            }
            if (suggesting) Banner(Color(0xFFFEF9C3), Color(0xFF713F12)) {
                AppText("android-story-suggesting", "You're editing a suggestion copy. The author sees your changes once you send them.", Modifier.weight(1f), style = MaterialTheme.typography.bodySmall, color = Color(0xFF713F12))
                TextButton({
                    actions.run {
                        var sent = 0
                        for (cid in dirty.keys.toList()) {
                            val orig = chapters.firstOrNull { it.id == cid } ?: continue
                            val d = drafts[cid] ?: continue
                            for (p in diffSuggestions(cid, orig.title, d.title, orig.paragraphs, splitParagraphs(d.md))) { app.repo.createProposal(id, p); sent++ }
                        }
                        suggesting = false
                        dirty.clear()
                        reloadTick++
                    }
                }, enabled = dirty.isNotEmpty()) { AppText("android-story-send-suggestions", "Send") }
                TextButton({
                    suggesting = false
                    dirty.clear()
                    chapters.forEach { drafts[it.id] = Draft(it.title, joinParagraphs(it.paragraphs)) }
                }) { AppText("android-discard", "Discard") }
            } else if (!canEdit && s != null) Banner(Color(0xFFFFFBEB), Color(0xFF78350F)) {
                AppText("android-story-readonly", "You're reading this story. To change it, use \"I want to change this\".", Modifier.weight(1f), style = MaterialTheme.typography.bodySmall, color = Color(0xFF78350F))
                TextButton({ panel = StoryPanel.CHANGE }) { AppText("android-story-change-short", "Change") }
            }
            if (active == null) {
                if (s != null) Empty(tr("android-story-no-chapters", "This story has no chapters yet."))
                return@Column
            }
            val textColor = MaterialTheme.colorScheme.onSurface
            BasicTextField(
                active.title,
                { update(active.copy(title = it)) },
                Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp),
                readOnly = !canEdit,
                singleLine = true,
                textStyle = MaterialTheme.typography.titleLarge.copy(color = textColor, fontWeight = FontWeight.SemiBold),
                cursorBrush = SolidColor(textColor),
                decorationBox = { inner -> if (active.title.isEmpty()) Text(tr("android-story-chapter-title", "Chapter title"), style = MaterialTheme.typography.titleLarge, color = MaterialTheme.colorScheme.onSurfaceVariant); inner() },
            )
            HorizontalDivider()
            find?.let { replacing ->
                cloud.crowdly.app.ui.components.FindBar(
                    listOf(active.md), replacing && canEdit, onClose = { find = null },
                    onSelect = { r -> selection = r; runCatching { bodyFocus.requestFocus() } },
                ) { q, r, mc, ww -> update(active.copy(md = cloud.crowdly.app.ui.components.replaceAll(active.md, q, r, mc, ww))) }
            }
            if (preview) {
                MarkdownView(active.md, Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp))
            } else {
                BasicTextField(
                    androidx.compose.ui.text.input.TextFieldValue(active.md, androidx.compose.ui.text.TextRange(selection.start.coerceIn(0, active.md.length), selection.end.coerceIn(0, active.md.length))),
                    { v -> selection = v.selection; if (v.text != active.md) update(active.copy(md = v.text)) },
                    Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp).focusRequester(bodyFocus),
                    readOnly = !canEdit,
                    textStyle = TextStyle(color = textColor, fontSize = 18.sp, lineHeight = 28.sp, fontFamily = FontFamily.Serif),
                    cursorBrush = SolidColor(textColor),
                    decorationBox = { inner -> if (active.md.isEmpty()) Text(tr("android-story-placeholder", "Once upon a time…"), fontSize = 18.sp, fontFamily = FontFamily.Serif, color = MaterialTheme.colorScheme.onSurfaceVariant); inner() },
                )
            }
        }
    }

    val sheet = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    val p = panel
    if (p != null && s != null && p != StoryPanel.REVISIONS && p != StoryPanel.EXPORT) {
        ModalBottomSheet(onDismissRequest = { panel = null }, sheetState = sheet) {
            Column(Modifier.fillMaxWidth().padding(bottom = 24.dp)) {
                when (p) {
                    StoryPanel.CHAPTERS -> ChaptersPanel(
                        chapters, activeId, dirty.keys, isOwner,
                        onSelect = { cid -> scope.launch { flush() }; activeId = cid; panel = null },
                        onAdd = {
                            actions.run {
                                flush()
                                val idx = chapters.indexOfFirst { it.id == activeId }
                                val c = app.repo.createChapter(id, "Chapter ${chapters.size + 1}", listOf(""))
                                val order = chapters.toMutableList().apply { add(idx + 1, c) }
                                runCatching { app.repo.reorderChapters(id, order.map { it.id }) }
                                chapters = order
                                drafts[c.id] = Draft(c.title, "")
                                activeId = c.id
                                panel = null
                            }
                        },
                        onDelete = { c -> actions.run { app.repo.deleteChapter(c.id); chapters = chapters - c; dirty.remove(c.id); if (activeId == c.id) activeId = chapters.firstOrNull()?.id } },
                        onMove = { order -> val prev = chapters; chapters = order; actions.run { try { app.repo.reorderChapters(id, order.map { it.id }) } catch (e: Exception) { chapters = prev; throw e } } },
                        onTogglePublish = { c -> actions.run { app.repo.publishChapter(c.id, !c.published); chapters = chapters.map { if (it.id == c.id) it.copy(published = !c.published) else it } } },
                    )
                    StoryPanel.BRANCHES -> BranchesPanel(activeId, splitParagraphs(active?.md.orEmpty()), branches, app.session.userId, role != null || s.visibility == "public", isOwner) { scope.launch { branches = app.repo.storyBranches(id) } }
                    StoryPanel.COMMENTS -> CommentsPanel(id, activeId)
                    StoryPanel.REVIEW -> StoryReviewPanel(id, chapters) { reloadTick++ }
                    StoryPanel.FORMATS -> FormatsPanel(s, chapters.firstOrNull { it.id == activeId }, splitParagraphs(active?.md.orEmpty()), isOwner)
                    StoryPanel.EDITIONS -> EditionsPanel(WorkKind.STORY, id, storyEditionParts(chapters, branches))
                    StoryPanel.METADATA -> StoryMetadataPanel(s, isOwner) { reloadTick++; panel = null }
                    StoryPanel.CHANGE -> ChangeStoryPanel(id, onSuggest = { suggesting = true; panel = null }) { panel = null }
                    else -> Unit
                }
            }
        }
    }
    if (p == StoryPanel.REVISIONS && activeId != null) RevisionsScreen(listOf("docType" to "chapter", "chapterId" to activeId!!), active?.title.orEmpty(), onClose = { panel = null; reloadTick++ })
    if (p == StoryPanel.EXPORT) ExportDialog(WorkKind.STORY, id) { panel = null }
    if (renaming && s != null) TextPrompt(tr("android-story-rename", "Rename story"), s.title, confirm = tr("android-save", "Save"), onDismiss = { renaming = false }) { t ->
        renaming = false
        actions.run { app.repo.renameStory(id, t.trim()); story = s.copy(title = t.trim()) }
    }
    if (confirmDelete && s != null) Confirm(tr("android-story-delete", "Delete story"), "\"${s.title}\" — " + tr("android-story-delete-text", "this story and all its chapters will be deleted. This can't be undone."), tr("android-delete", "Delete"), { confirmDelete = false }) {
        actions.run { app.repo.deleteStory(id); nav.popBackStack() }
    }
}

/** Save-state words for the subtitle, kept short. */
private fun tr0(state: String) = when (state) {
    "saving" -> "Saving…"
    "queued" -> "Saved on this phone"
    "saved" -> "Saved"
    else -> "Editing"
}

@Composable
fun Banner(bg: Color, fg: Color, content: @Composable androidx.compose.foundation.layout.RowScope.() -> Unit) {
    Row(Modifier.fillMaxWidth().background(bg).padding(horizontal = 12.dp, vertical = 4.dp), verticalAlignment = Alignment.CenterVertically, content = content)
}

/** Paragraph-level suggestions from an edited copy (lib/collab.ts diffSuggestions, desktop suggestions.py). */
fun diffSuggestions(chapterId: String, originalTitle: String, editedTitle: String, original: List<String>, edited: List<String>) = buildList {
    if (editedTitle.trim() != originalTitle.trim()) add(jsonOf("targetType" to "chapter_title", "targetChapterId" to chapterId, "proposedText" to editedTitle.trim()))
    for (i in 0 until maxOf(original.size, edited.size)) {
        val a = original.getOrNull(i).orEmpty().trim()
        val b = edited.getOrNull(i).orEmpty().trim()
        if (a != b) add(jsonOf("targetType" to "paragraph", "targetChapterId" to chapterId, "proposedText" to b, "targetPath" to i.toString()))
    }
}

/** Story editions pick one branch per paragraph: { chapterId: { paragraphIndex: branchId } }. */
fun storyEditionParts(chapters: List<Chapter>, branches: List<ParagraphBranch>): List<EditionPart> = chapters.map { c ->
    EditionPart(c.id, c.title, c.paragraphs.mapIndexedNotNull { i, p ->
        val opts = branches.filter { it.chapterId == c.id && it.paragraphIndex == i }
        if (opts.isEmpty()) null else EditionSlot(i.toString(), p, opts.map { it.id to (it.name ?: it.text.take(60)) })
    })
}
