package cloud.crowdly.app.ui.create

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.DragHandle
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.Public
import androidx.compose.material.icons.filled.PublicOff
import androidx.compose.material3.Button
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Switch
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
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import cloud.crowdly.app.crowdly
import cloud.crowdly.app.data.Chapter
import cloud.crowdly.app.data.CollabRequest
import cloud.crowdly.app.data.Comment
import cloud.crowdly.app.data.Locale
import cloud.crowdly.app.data.ParagraphBranch
import cloud.crowdly.app.data.Proposal
import cloud.crowdly.app.data.StoryTitle
import cloud.crowdly.app.i18n.AppText
import cloud.crowdly.app.i18n.tr
import cloud.crowdly.app.ui.LocalNav
import cloud.crowdly.app.ui.Routes
import cloud.crowdly.app.ui.components.Confirm
import cloud.crowdly.app.ui.components.Empty
import cloud.crowdly.app.ui.components.ListRow
import cloud.crowdly.app.ui.components.Pill
import cloud.crowdly.app.ui.components.ReorderableColumn
import cloud.crowdly.app.ui.components.SectionTitle
import cloud.crowdly.app.ui.components.SoftCard
import cloud.crowdly.app.ui.components.rememberActions
import cloud.crowdly.app.ui.more.openInBrowser
import cloud.crowdly.app.net.s

@Composable
fun PanelTitle(id: String, english: String, trailing: @Composable () -> Unit = {}) {
    Row(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 4.dp), verticalAlignment = Alignment.CenterVertically) {
        AppText(id, english, Modifier.weight(1f), style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
        trailing()
    }
}

/** Chapter list (ChapterList.tsx): select, add, delete, drag to reorder, publish. */
@Composable
fun ChaptersPanel(
    chapters: List<Chapter>, activeId: String?, dirty: Set<String>, canEdit: Boolean,
    onSelect: (String) -> Unit, onAdd: () -> Unit, onDelete: (Chapter) -> Unit, onMove: (List<Chapter>) -> Unit, onTogglePublish: (Chapter) -> Unit,
) {
    var deleting by remember { mutableStateOf<Chapter?>(null) }
    PanelTitle("android-story-chapters", "Chapters") { if (canEdit) IconButton(onAdd) { Icon(Icons.Filled.Add, tr("android-story-add-chapter", "Add chapter")) } }
    Column(Modifier.heightIn(max = 560.dp).verticalScroll(rememberScrollState())) {
        ReorderableColumn(chapters, key = { it.id }, enabled = canEdit, onMove = onMove) { c, handle ->
            Row(
                Modifier.fillMaxWidth().clickable { onSelect(c.id) }
                    .then(if (c.id == activeId) Modifier.padding(0.dp) else Modifier)
                    .padding(horizontal = 8.dp, vertical = 4.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                if (canEdit) Icon(Icons.Filled.DragHandle, tr("android-drag", "Drag to reorder"), handle.padding(8.dp))
                Column(Modifier.weight(1f).padding(horizontal = 8.dp)) {
                    Text(
                        c.title.ifBlank { "Untitled" } + if (c.id in dirty) " •" else "",
                        fontWeight = if (c.id == activeId) FontWeight.Bold else FontWeight.Normal,
                        color = if (c.id == activeId) MaterialTheme.colorScheme.secondary else MaterialTheme.colorScheme.onSurface,
                        maxLines = 1, overflow = TextOverflow.Ellipsis,
                    )
                    if (!c.published) AppText("android-story-unpublished", "Not published", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
                if (canEdit) {
                    IconButton({ onTogglePublish(c) }) { Icon(if (c.published) Icons.Filled.Public else Icons.Filled.PublicOff, tr("android-story-publish", "Published")) }
                    IconButton({ deleting = c }) { Icon(Icons.Filled.Delete, tr("android-delete", "Delete")) }
                }
            }
        }
    }
    deleting?.let { c ->
        Confirm(tr("android-story-delete-chapter", "Delete chapter"), "\"${c.title.ifBlank { "this chapter" }}\" — " + tr("android-cant-undo", "this can't be undone."), tr("android-delete", "Delete"), { deleting = null }) { onDelete(c) }
    }
}

/**
 * Paragraph branches of the open chapter (BranchesPanel.tsx): pick a
 * paragraph, see its branches, add or configure one. Configure never
 * overwrites the parent paragraph.
 */
@Composable
fun BranchesPanel(chapterId: String?, paragraphs: List<String>, branches: List<ParagraphBranch>, userId: String?, canBranch: Boolean, isOwner: Boolean, onChanged: () -> Unit) {
    val app = crowdly
    val actions = rememberActions()
    var paragraph by remember { mutableIntStateOf(0) }
    var name by remember { mutableStateOf("") }
    var text by remember { mutableStateOf("") }
    var editing by remember { mutableStateOf<ParagraphBranch?>(null) }
    val mine = branches.filter { it.chapterId == chapterId }
    val here = mine.filter { it.paragraphIndex == paragraph }
    PanelTitle("android-branches-title", "Paragraph branches")
    if (chapterId == null) { Empty(tr("android-story-no-chapters", "This story has no chapters yet.")); return }
    Column(Modifier.heightIn(max = 620.dp).verticalScroll(rememberScrollState())) {
        paragraphs.forEachIndexed { i, p ->
            val n = mine.count { it.paragraphIndex == i }
            Row(
                Modifier.fillMaxWidth().clickable { paragraph = i }.padding(horizontal = 16.dp, vertical = 6.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text("${i + 1}", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                Text(
                    p.ifBlank { "…" }, Modifier.weight(1f).padding(horizontal = 8.dp), maxLines = 2, overflow = TextOverflow.Ellipsis,
                    fontWeight = if (i == paragraph) FontWeight.Bold else FontWeight.Normal,
                    color = if (i == paragraph) MaterialTheme.colorScheme.secondary else MaterialTheme.colorScheme.onSurface,
                )
                if (n > 0) Pill("$n")
            }
        }
        HorizontalDivider(Modifier.padding(vertical = 8.dp))
        if (here.isEmpty()) Empty(tr("android-branches-none", "No branches on this paragraph yet."))
        here.forEach { b ->
            SoftCard {
                Column(Modifier.padding(12.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text(b.name ?: tr("android-branch", "Branch"), Modifier.weight(1f), fontWeight = FontWeight.SemiBold)
                        if (b.userId == userId || isOwner) {
                            IconButton({ editing = b }) { Icon(Icons.Filled.Edit, tr("android-branches-configure", "Configure")) }
                            IconButton({ actions.run { app.repo.deleteBranch(b.id); onChanged() } }) { Icon(Icons.Filled.Delete, tr("android-delete", "Delete")) }
                        }
                    }
                    Text(b.text.ifBlank { "…" }, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
        }
        if (canBranch) {
            SectionTitle(tr("android-branches-new", "New branch from this paragraph"))
            OutlinedTextField(name, { name = it }, Modifier.fillMaxWidth().padding(horizontal = 16.dp), label = { AppText("android-branches-name", "Branch name (optional)") }, singleLine = true)
            OutlinedTextField(text, { text = it }, Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp), label = { AppText("android-branches-text", "How else could this go?") }, minLines = 3)
            Button(
                {
                    actions.run {
                        app.repo.createBranch(chapterId, paragraph, paragraphs.getOrNull(paragraph).orEmpty(), text, name)
                        name = ""; text = ""
                        onChanged()
                    }
                },
                Modifier.padding(horizontal = 16.dp), enabled = text.isNotBlank(),
            ) { AppText("android-branches-create", "Create branch") }
        }
    }
    editing?.let { b ->
        BranchEditDialog(b.name.orEmpty(), b.text, onDismiss = { editing = null }) { n, t ->
            editing = null
            actions.run { app.repo.updateBranch(b.id, t, n); onChanged() }
        }
    }
}

@Composable
fun BranchEditDialog(name0: String, text0: String, onDismiss: () -> Unit, onSave: (String, String) -> Unit) {
    var name by remember { mutableStateOf(name0) }
    var text by remember { mutableStateOf(text0) }
    androidx.compose.material3.AlertDialog(
        onDismissRequest = onDismiss,
        title = { AppText("android-branches-configure", "Configure branch") },
        text = {
            Column {
                OutlinedTextField(name, { name = it }, Modifier.fillMaxWidth(), label = { AppText("android-branches-name", "Branch name (optional)") }, singleLine = true)
                OutlinedTextField(text, { text = it }, Modifier.fillMaxWidth().padding(top = 8.dp), minLines = 4)
            }
        },
        confirmButton = { Button({ onSave(name, text) }) { AppText("android-save", "Save") } },
        dismissButton = { TextButton(onDismiss) { AppText("android-cancel", "Cancel") } },
    )
}

/** Comments on the open chapter (CommentsPanel.tsx). */
@Composable
fun CommentsPanel(storyId: String, chapterId: String?) {
    val app = crowdly
    val actions = rememberActions()
    var all by remember { mutableStateOf<List<Comment>>(emptyList()) }
    var text by remember { mutableStateOf("") }
    var tick by remember { mutableIntStateOf(0) }
    LaunchedEffect(storyId, tick) { all = app.repo.comments(storyId) }
    val shown = all.filter { chapterId == null || it.chapterId == null || it.chapterId == chapterId }
    PanelTitle("android-comments-title", "Comments")
    Column(Modifier.heightIn(max = 480.dp).verticalScroll(rememberScrollState())) {
        if (shown.isEmpty()) Empty(tr("android-comments-empty", "No comments yet."))
        shown.forEach { c -> ListRow(c.body, subtitle = "${c.author} · ${c.createdAt.take(16).replace('T', ' ')}") }
    }
    OutlinedTextField(text, { text = it }, Modifier.fillMaxWidth().padding(horizontal = 16.dp), label = { AppText("android-comments-write", "Write a comment") }, minLines = 2)
    Button({ actions.run { app.repo.postComment(storyId, chapterId, text.trim()); text = ""; tick++ } }, Modifier.padding(16.dp), enabled = text.isNotBlank()) { AppText("android-comments-send", "Post") }
}

/** Owner's inbox (ReviewPanel.tsx): suggested changes and requests to collaborate. */
@Composable
fun StoryReviewPanel(storyId: String, chapters: List<Chapter>, onApplied: () -> Unit) {
    val app = crowdly
    val actions = rememberActions()
    var proposals by remember { mutableStateOf<List<Proposal>>(emptyList()) }
    var requests by remember { mutableStateOf<List<CollabRequest>>(emptyList()) }
    var tick by remember { mutableIntStateOf(0) }
    LaunchedEffect(storyId, tick) { proposals = app.repo.proposals(storyId); requests = app.repo.collaborationRequests(storyId) }
    PanelTitle("android-review-title", "Suggestions and requests")
    Column(Modifier.heightIn(max = 620.dp).verticalScroll(rememberScrollState())) {
        if (proposals.isEmpty() && requests.isEmpty()) Empty(tr("android-review-empty", "Nothing waiting for you."))
        requests.forEach { r ->
            SoftCard {
                Column(Modifier.padding(12.dp)) {
                    Text(r.who, fontWeight = FontWeight.SemiBold)
                    AppText("android-review-wants", "wants to collaborate", style = MaterialTheme.typography.labelSmall)
                    if (r.message.isNotBlank()) Text(r.message)
                    DecideRow({ actions.run { app.repo.decideCollaboration(r.id, true); tick++ } }, { actions.run { app.repo.decideCollaboration(r.id, false); tick++ } })
                }
            }
        }
        proposals.forEach { p ->
            val c = chapters.firstOrNull { it.id == p.chapterId }
            val original = if (p.targetType == "chapter_title") c?.title.orEmpty() else c?.paragraphs?.getOrNull(p.path?.toIntOrNull() ?: -1).orEmpty()
            SoftCard {
                Column(Modifier.padding(12.dp)) {
                    Text(
                        listOfNotNull(p.authorEmail, c?.title, if (p.targetType == "chapter_title") "title" else "¶ ${(p.path?.toIntOrNull() ?: 0) + 1}").joinToString(" · "),
                        style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    DiffText(original, p.text)
                    DecideRow({ actions.run { app.repo.decideProposal(p.id, true); tick++; onApplied() } }, { actions.run { app.repo.decideProposal(p.id, false); tick++ } })
                }
            }
        }
    }
}

@Composable
fun DecideRow(onApprove: () -> Unit, onDecline: () -> Unit) {
    Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.padding(top = 8.dp)) {
        Button(onApprove) { Icon(Icons.Filled.Check, null); AppText("android-review-approve", "Approve") }
        OutlinedButton(onDecline) { Icon(Icons.Filled.Close, null); AppText("android-review-decline", "Decline") }
    }
}

/** Old → new, word by word: removed words struck through in red, added words in green. */
@Composable
fun DiffText(old: String, new: String) {
    val parts = remember(old, new) { cloud.crowdly.core.text.wordDiff(old, new) }
    val text = androidx.compose.ui.text.buildAnnotatedString {
        for (p in parts) when (p.kind) {
            cloud.crowdly.core.text.DiffPart.Kind.SAME -> append(p.text)
            cloud.crowdly.core.text.DiffPart.Kind.REMOVED -> withStyle(androidx.compose.ui.text.SpanStyle(color = Color(0xFFDC2626), textDecoration = TextDecoration.LineThrough)) { append(p.text) }
            cloud.crowdly.core.text.DiffPart.Kind.ADDED -> withStyle(androidx.compose.ui.text.SpanStyle(color = Color(0xFF16A34A), fontWeight = FontWeight.SemiBold)) { append(p.text) }
        }
        if (new.isEmpty()) append(" (delete)")
    }
    Text(text, Modifier.padding(top = 4.dp))
}

/** Story metadata (StoryMetadataDialog.tsx): title, genre, description, #tags, public, published. */
@Composable
fun StoryMetadataPanel(s: StoryTitle, canEdit: Boolean, onSaved: () -> Unit) {
    val app = crowdly
    val context = androidx.compose.ui.platform.LocalContext.current
    val actions = rememberActions()
    var title by remember { mutableStateOf(s.title) }
    var genre by remember { mutableStateOf(s.genre.orEmpty()) }
    var description by remember { mutableStateOf(s.description.orEmpty()) }
    var tags by remember { mutableStateOf(s.tags.joinToString(" ") { if (' ' in it) "#'$it'" else "#$it" }) }
    var public by remember { mutableStateOf(s.visibility == "public") }
    var published by remember { mutableStateOf(s.published) }
    PanelTitle("android-meta-title", "Story metadata")
    Column(Modifier.padding(horizontal = 16.dp).verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        OutlinedTextField(title, { title = it }, Modifier.fillMaxWidth(), enabled = canEdit, label = { AppText("android-title", "Title") })
        OutlinedTextField(genre, { genre = it }, Modifier.fillMaxWidth(), enabled = canEdit, label = { AppText("android-meta-genre", "Genre") })
        OutlinedTextField(description, { description = it }, Modifier.fillMaxWidth(), enabled = canEdit, minLines = 3, label = { AppText("android-meta-description", "Description") })
        OutlinedTextField(tags, { tags = it }, Modifier.fillMaxWidth(), enabled = canEdit, label = { AppText("android-meta-tags", "Tags") }, placeholder = { Text("#fantasy #'slow burn'") })
        Row(verticalAlignment = Alignment.CenterVertically) { AppText("android-meta-public", "Public (anyone can read it)", Modifier.weight(1f)); Switch(public, { public = it }, enabled = canEdit) }
        Row(verticalAlignment = Alignment.CenterVertically) { AppText("android-meta-published", "Published", Modifier.weight(1f)); Switch(published, { published = it }, enabled = canEdit) }
        TextButton({ openInBrowser(context, "${app.prefs.platformUrl}/story/${s.id}") }) { AppText("android-meta-more", "More settings (people, policies, cover) on the platform") }
        if (canEdit) Button({
            actions.run {
                if (title.isNotBlank() && title != s.title) app.repo.renameStory(s.id, title.trim())
                app.repo.updateStorySettings(s.id, "description" to description, "genre" to genre, "tags" to parseTags(tags), "visibility" to if (public) "public" else "private", "published" to published)
                onSaved()
            }
        }) { AppText("android-save", "Save") }
    }
}

/** "#fantasy #'slow burn'" → ["fantasy", "slow burn"] (src/lib/tag-utils.ts). */
fun parseTags(text: String): List<String> =
    Regex("#'([^']+)'|#\"([^\"]+)\"|#?([^\\s#]+)").findAll(text).map { m -> (m.groupValues[1].ifEmpty { m.groupValues[2] }.ifEmpty { m.groupValues[3] }).trim() }.filter { it.isNotEmpty() }.distinct().toList()

/** "I want to change this story" (ChangeStoryDialog.tsx): suggest, clone, translate or ask to collaborate. */
@Composable
fun ChangeStoryPanel(storyId: String, onSuggest: () -> Unit, onDone: () -> Unit) {
    val app = crowdly
    val nav = LocalNav.current
    val actions = rememberActions()
    var mode by remember { mutableStateOf<String?>(null) }
    var locales by remember { mutableStateOf<List<Locale>>(emptyList()) }
    var language by remember { mutableStateOf<Locale?>(null) }
    var message by remember { mutableStateOf("") }
    var existing by remember { mutableStateOf<CollabRequest?>(null) }
    LaunchedEffect(storyId) { locales = runCatching { app.repo.locales() }.getOrDefault(emptyList()); existing = app.repo.myCollaborationRequest(storyId) }
    PanelTitle("android-change-title", "I want to change this story")
    when (mode) {
        null -> {
            ListRow(tr("android-change-suggest", "Suggest changes"), subtitle = tr("android-change-suggest-desc", "Edit a copy here; your changes are sent to the author as suggestions they can accept."), onClick = onSuggest)
            ListRow(tr("android-change-clone", "Make my own version"), subtitle = tr("android-change-clone-desc", "Copy the story into a new one that you own."), onClick = {
                actions.run { val newId = app.repo.cloneStory(storyId); onDone(); nav.navigate(Routes.story(newId)) }
            })
            ListRow(tr("android-change-translate", "Translate"), subtitle = tr("android-change-translate-desc", "Start a translation linked to this story."), onClick = { mode = "translate" })
            ListRow(
                tr("android-change-collab", "Ask to collaborate"),
                subtitle = existing?.let { tr("android-change-collab-asked", "You already asked") + " (${it.status})." } ?: tr("android-change-collab-desc", "Ask the author to add you to the story's team."),
                onClick = { if (existing == null) mode = "collaborate" },
            )
        }
        "translate" -> Column(Modifier.padding(16.dp)) {
            LanguagePicker(locales, language) { language = it }
            Button({ actions.run { val r = app.repo.createTranslation(storyId, language!!.code, "copy"); onDone(); nav.navigate(Routes.story(r.s("story_title_id"))) } }, enabled = language != null) {
                AppText("android-change-translate-start", "Start translating")
            }
        }
        else -> Column(Modifier.padding(16.dp)) {
            OutlinedTextField(message, { message = it }, Modifier.fillMaxWidth(), minLines = 3, label = { AppText("android-change-collab-message", "Tell the author what you'd like to work on") })
            Button({ actions.run(tr0("Request sent to the author")) { app.repo.requestCollaboration(storyId, message); onDone() } }, Modifier.padding(top = 8.dp)) { AppText("android-change-collab-send", "Send request") }
        }
    }
}

private fun tr0(s: String) = s

@Composable
fun LanguagePicker(locales: List<Locale>, value: Locale?, onPick: (Locale) -> Unit) {
    var open by remember { mutableStateOf(false) }
    OutlinedButton({ open = true }, Modifier.fillMaxWidth()) { Text(value?.let { "${it.native} (${it.english})" } ?: tr("android-pick-language", "Choose a language")) }
    DropdownMenu(open, { open = false }) {
        locales.forEach { l -> DropdownMenuItem({ Text("${l.native} (${l.english})") }, { onPick(l); open = false }) }
    }
}
