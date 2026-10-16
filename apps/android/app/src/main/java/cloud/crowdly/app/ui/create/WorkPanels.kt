package cloud.crowdly.app.ui.create

import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.MenuBook
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.FilterChip
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
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import cloud.crowdly.app.crowdly
import cloud.crowdly.app.data.CollabRequest
import cloud.crowdly.app.data.Edition
import cloud.crowdly.app.data.Proposal
import cloud.crowdly.app.data.Revision
import cloud.crowdly.app.data.Space
import cloud.crowdly.app.data.WorkIo
import cloud.crowdly.app.data.WorkKind
import cloud.crowdly.app.i18n.AppText
import cloud.crowdly.app.i18n.tr
import cloud.crowdly.app.ui.LocalNav
import cloud.crowdly.app.ui.Routes
import cloud.crowdly.app.ui.components.Confirm
import cloud.crowdly.app.ui.components.Empty
import cloud.crowdly.app.ui.components.ListRow
import cloud.crowdly.app.ui.components.Pill
import cloud.crowdly.app.ui.components.Screen
import cloud.crowdly.app.ui.components.SectionTitle
import cloud.crowdly.app.ui.components.SoftCard
import cloud.crowdly.app.ui.components.errorText
import cloud.crowdly.app.ui.components.printHtml
import cloud.crowdly.app.ui.components.rememberActions
import cloud.crowdly.app.ui.components.shareFile
import cloud.crowdly.app.ui.components.writeToUri
import cloud.crowdly.core.text.LayoutNode
import cloud.crowdly.core.text.RevisionLayouts

// --- editions ------------------------------------------------------------------------

/** One choosable place in an edition: a paragraph / element / page with its branches. */
data class EditionSlot(val key: String, val text: String, val options: List<Pair<String, String>>)
data class EditionPart(val id: String, val title: String, val slots: List<EditionSlot>)

/**
 * Editions (EditionPicker / WorkEditionsBar): choose a branch per paragraph,
 * element or page and freeze it; open an edition in the reader.
 */
@Composable
fun EditionsPanel(kind: WorkKind, workId: String, parts: List<EditionPart>) {
    val app = crowdly
    val nav = LocalNav.current
    val actions = rememberActions()
    var editions by remember { mutableStateOf<List<Edition>>(emptyList()) }
    var tick by remember { mutableIntStateOf(0) }
    var creating by remember { mutableStateOf(false) }
    var deleting by remember { mutableStateOf<Edition?>(null) }
    LaunchedEffect(workId, tick) { editions = app.repo.editions(kind, workId) }
    PanelTitle("android-editions-title", "Editions") { TextButton({ creating = true }) { AppText("android-editions-new", "New edition") } }
    Column(Modifier.heightIn(max = 600.dp).verticalScroll(rememberScrollState())) {
        if (editions.isEmpty()) Empty(tr("android-editions-empty", "No editions yet. An edition freezes one choice of branches so it can be read as one version."))
        editions.forEach { e ->
            ListRow(
                e.name,
                subtitle = listOfNotNull(e.status, e.creator, "${e.branchCount} ${tr("android-editions-branches", "branches")}", e.description).joinToString(" · "),
                leading = { Icon(Icons.AutoMirrored.Filled.MenuBook, null) },
                trailing = if (e.mine) ({ IconButton({ deleting = e }) { Icon(Icons.Filled.Delete, tr("android-delete", "Delete")) } }) else null,
                onClick = { nav.navigate(Routes.read(kind.key, workId, e.id)) },
            )
        }
    }
    if (creating) NewEditionDialog(parts, onDismiss = { creating = false }) { name, published, selections ->
        creating = false
        actions.run { app.repo.createEdition(kind, workId, name, if (published) "published" else "draft", selections); tick++ }
    }
    deleting?.let { e -> Confirm(tr("android-editions-delete", "Delete edition"), e.name, tr("android-delete", "Delete"), { deleting = null }) { actions.run { app.repo.deleteEdition(kind, e.id); tick++ } } }
}

@Composable
private fun NewEditionDialog(parts: List<EditionPart>, onDismiss: () -> Unit, onCreate: (String, Boolean, Map<String, Map<String, String>>) -> Unit) {
    var name by remember { mutableStateOf("") }
    var published by remember { mutableStateOf(false) }
    val chosen = remember { mutableStateMapOf<Pair<String, String>, String>() }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { AppText("android-editions-new", "New edition") },
        text = {
            Column(Modifier.heightIn(max = 520.dp).verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedTextField(name, { name = it }, Modifier.fillMaxWidth(), singleLine = true, label = { AppText("android-name", "Name") })
                Row(verticalAlignment = Alignment.CenterVertically) { AppText("android-editions-publish", "Published", Modifier.weight(1f)); Switch(published, { published = it }) }
                val withBranches = parts.filter { it.slots.isNotEmpty() }
                if (withBranches.isEmpty()) AppText("android-editions-no-branches", "There are no branches to choose from yet; the edition will freeze the text as it is.", style = MaterialTheme.typography.bodySmall)
                withBranches.forEach { part ->
                    Text(part.title, fontWeight = FontWeight.SemiBold)
                    part.slots.forEach { slot ->
                        Text(slot.text.ifBlank { "…" }, style = MaterialTheme.typography.bodySmall, maxLines = 2, overflow = TextOverflow.Ellipsis)
                        LazyRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                            item { FilterChip(chosen[part.id to slot.key] == null, { chosen.remove(part.id to slot.key) }, { AppText("android-editions-original", "Original") }) }
                            items(slot.options) { (bid, label) -> FilterChip(chosen[part.id to slot.key] == bid, { chosen[part.id to slot.key] = bid }, { Text(label, maxLines = 1) }) }
                        }
                    }
                }
            }
        },
        confirmButton = {
            Button({
                val sel = chosen.entries.groupBy({ it.key.first }, { it.key.second to it.value }).mapValues { it.value.toMap() }
                onCreate(name.trim(), published, sel)
            }, enabled = name.isNotBlank()) { AppText("android-create", "Create") }
        },
        dismissButton = { TextButton(onDismiss) { AppText("android-cancel", "Cancel") } },
    )
}

// --- revisions -----------------------------------------------------------------------

/**
 * Compare revisions (RevisionsDialog → CompareRevisionsContainer): the CRDT
 * history of one chapter or scene; pick 2–4 revisions to see side by side in
 * one of the shared layout presets (desktop compare_revisions.py), or one to
 * restore. A restore is a new forward change: nothing is lost.
 */
@Composable
fun RevisionsScreen(doc: List<Pair<String, String>>, title: String, onClose: () -> Unit) {
    val app = crowdly
    val actions = rememberActions()
    var key by remember { mutableStateOf<String?>(null) }
    var revisions by remember { mutableStateOf<List<Revision>?>(null) }
    var error by remember { mutableStateOf<String?>(null) }
    val selected = remember { mutableStateListOf<Int>() }
    var preset by remember { mutableIntStateOf(0) }
    var restoring by remember { mutableStateOf<Revision?>(null) }
    var tick by remember { mutableIntStateOf(0) }
    LaunchedEffect(tick) {
        try {
            val k = key ?: app.repo.ensureDoc(*doc.toTypedArray()).also { key = it }
            revisions = app.repo.history(k).sortedByDescending { it.number }
        } catch (e: Exception) { error = errorText(e) }
    }
    Dialog(onClose, DialogProperties(usePlatformDefaultWidth = false)) {
        Screen(tr("android-revisions-title", "Compare revisions"), back = onClose, subtitle = title) { pad ->
            Column(Modifier.padding(pad).fillMaxSize()) {
                val revs = revisions
                if (revs == null) { Empty(error ?: "…"); return@Column }
                if (revs.isEmpty()) { Empty(tr("android-revisions-empty", "No revisions yet. They appear as you edit.")); return@Column }
                LazyRow(Modifier.padding(8.dp), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    items(revs, key = { it.number }) { r ->
                        FilterChip(
                            r.number in selected,
                            { if (r.number in selected) selected.remove(r.number) else if (selected.size < 4) selected.add(r.number); preset = 0 },
                            { Text("#${r.number} · ${r.createdAt?.take(16)?.replace('T', ' ').orEmpty()}") },
                        )
                    }
                }
                val picked = selected.mapNotNull { n -> revs.firstOrNull { it.number == n } }
                if (picked.isEmpty()) {
                    AppText("android-revisions-pick", "Pick up to four revisions to compare, or one to restore.", Modifier.padding(16.dp))
                    return@Column
                }
                val presets = RevisionLayouts.presets[picked.size].orEmpty()
                if (presets.isNotEmpty()) LazyRow(Modifier.padding(horizontal = 8.dp), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    items(presets.size) { i -> FilterChip(preset == i, { preset = i }, { Text(presets[i].label) }) }
                }
                Box(Modifier.weight(1f).fillMaxWidth().padding(8.dp)) {
                    if (picked.size == 1) RevisionTile(picked[0], null) { restoring = it }
                    else Layout(presets.getOrNull(preset)?.tree ?: LayoutNode.Leaf(0), picked, picked.first()) { restoring = it }
                }
            }
        }
    }
    restoring?.let { r ->
        Confirm(
            tr("android-revisions-restore", "Restore this revision"),
            "#${r.number}: " + tr("android-revisions-restore-text", "the current text is replaced by this revision, as a new change. Every revision stays in the history."),
            tr("android-revisions-restore-btn", "Restore"), { restoring = null },
        ) { actions.run(tr0("Restored")) { app.repo.restore(key!!, r.heads); tick++ } }
    }
}

private fun tr0(s: String) = s

@Composable
private fun Layout(node: LayoutNode, revs: List<Revision>, base: Revision, onRestore: (Revision) -> Unit) {
    when (node) {
        is LayoutNode.Leaf -> revs.getOrNull(node.tile)?.let { RevisionTile(it, if (it === base) null else base, onRestore) }
        is LayoutNode.Split -> {
            val weights = node.sizes ?: node.children.map { 1.0 }
            if (node.horizontal) Row(Modifier.fillMaxSize(), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                node.children.forEachIndexed { i, c -> Box(Modifier.weight(weights.getOrElse(i) { 1.0 }.toFloat().coerceAtLeast(0.1f)).fillMaxSize()) { Layout(c, revs, base, onRestore) } }
            } else Column(Modifier.fillMaxSize(), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                node.children.forEachIndexed { i, c -> Box(Modifier.weight(weights.getOrElse(i) { 1.0 }.toFloat().coerceAtLeast(0.1f)).fillMaxSize()) { Layout(c, revs, base, onRestore) } }
            }
        }
    }
}

@Composable
private fun RevisionTile(r: Revision, against: Revision?, onRestore: (Revision) -> Unit) {
    Card(Modifier.fillMaxSize(), border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline), colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface)) {
        Column(Modifier.fillMaxSize()) {
            Row(Modifier.fillMaxWidth().padding(horizontal = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                Text("#${r.number} · ${r.by.orEmpty()}", Modifier.weight(1f), style = MaterialTheme.typography.labelMedium, maxLines = 1)
                TextButton({ onRestore(r) }) { AppText("android-revisions-restore-short", "Restore") }
            }
            Column(Modifier.padding(8.dp).verticalScroll(rememberScrollState())) {
                if (against != null) DiffText(against.text(), r.text()) else Text(r.text())
            }
        }
    }
}

// --- export --------------------------------------------------------------------------

/** Export / Save as (useWorkFileActions + io.ts): share, save on the phone, or keep in a Space. */
@Composable
fun ExportDialog(kind: WorkKind, id: String, onDismiss: () -> Unit) {
    val app = crowdly
    val context = LocalContext.current
    val actions = rememberActions()
    var doc by remember { mutableStateOf<Any?>(null) }
    var error by remember { mutableStateOf<String?>(null) }
    var format by remember { mutableStateOf(WorkIo.Format.NATIVE) }
    var spaces by remember { mutableStateOf<List<Space>>(emptyList()) }
    var spaceMenu by remember { mutableStateOf(false) }
    LaunchedEffect(kind, id) {
        try { doc = app.io.loadDoc(kind, id) } catch (e: Exception) { error = errorText(e) }
        spaces = runCatching { app.repo.mySpaces() }.getOrDefault(emptyList())
    }
    var pending by remember { mutableStateOf<WorkIo.Exported?>(null) }
    val saver = rememberLauncherForActivityResult(ActivityResultContracts.CreateDocument("*/*")) { uri ->
        val f = pending
        if (uri != null && f != null) actions.run(tr0("Saved")) { writeToUri(context, uri, f.bytes) }
    }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { AppText("android-export", "Export or share") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                if (doc == null) { Text(error ?: "…"); return@Column }
                app.io.formatsFor(kind).forEach { f ->
                    Row(Modifier.fillMaxWidth().clickable { format = f }.padding(vertical = 4.dp), verticalAlignment = Alignment.CenterVertically) {
                        androidx.compose.material3.RadioButton(format == f, { format = f })
                        Text(if (f == WorkIo.Format.NATIVE) ".${kind.key} (${tr("android-export-native", "Crowdly file, opens in the desktop and web apps")})" else f.label)
                    }
                }
                if (format != WorkIo.Format.PDF && spaces.isNotEmpty()) {
                    TextButton({ spaceMenu = true }) { AppText("android-export-to-space", "Save to a Space…") }
                    DropdownMenu(spaceMenu, { spaceMenu = false }) {
                        spaces.forEach { s ->
                            DropdownMenuItem({ Text(s.name) }, {
                                spaceMenu = false
                                val f = app.io.export(doc!!, format)
                                actions.run(tr0("Saved to ${s.name}")) { app.repo.saveFileToSpace(s.id, "", f.name, f.bytes.toString(Charsets.UTF_8), f.mime) }
                            })
                        }
                    }
                }
            }
        },
        confirmButton = {
            Row {
                TextButton({
                    val d = doc ?: return@TextButton
                    val f = app.io.export(d, format)
                    if (format == WorkIo.Format.PDF) printHtml(context, f.bytes.toString(Charsets.UTF_8), f.name.substringBeforeLast('.'))
                    else shareFile(context, f)
                }, enabled = doc != null) { Text(if (format == WorkIo.Format.PDF) tr("android-export-pdf", "Print / save PDF") else tr("android-export-share", "Share")) }
                if (format != WorkIo.Format.PDF) TextButton({
                    val d = doc ?: return@TextButton
                    pending = app.io.export(d, format)
                    saver.launch(pending!!.name)
                }, enabled = doc != null) { AppText("android-export-save", "Save on this phone") }
            }
        },
        dismissButton = { TextButton(onDismiss) { AppText("android-close", "Close") } },
    )
}

// --- screenplay / comic review and "change this" --------------------------------------------

private val TARGET = mapOf("screenplay_title" to "title", "comic_title" to "title", "scene" to "scene heading", "block" to "element", "block_branch" to "branch", "issue" to "issue title", "page_layer" to "page text")

/** Page-layer suggestions carry overlays as JSON: show their texts. */
private fun readable(type: String, text: String?): String {
    if (type != "page_layer" || text == null) return text.orEmpty()
    return runCatching { cloud.crowdly.app.net.JsonCodec.parseToJsonElement(text).let { (it as kotlinx.serialization.json.JsonArray).joinToString(" / ") { o -> (o as kotlinx.serialization.json.JsonObject)["text"].toString().trim('"') } } }.getOrDefault(text)
}

/** Owner's inbox for a screenplay or comic (WorkReviewPanel.tsx). */
@Composable
fun WorkReviewPanel(kind: WorkKind, workId: String, onApplied: () -> Unit) {
    val app = crowdly
    val actions = rememberActions()
    var proposals by remember { mutableStateOf<List<Proposal>>(emptyList()) }
    var requests by remember { mutableStateOf<List<CollabRequest>>(emptyList()) }
    var tick by remember { mutableIntStateOf(0) }
    LaunchedEffect(workId, tick) { proposals = app.repo.workProposals(kind, workId); requests = app.repo.workCollaborationRequests(kind, workId) }
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
            SoftCard {
                Column(Modifier.padding(12.dp)) {
                    Text(listOfNotNull(p.authorEmail, p.partTitle, TARGET[p.targetType] ?: p.targetType).joinToString(" · "), style = MaterialTheme.typography.labelSmall)
                    DiffText(readable(p.targetType, p.currentText), readable(p.targetType, p.text))
                    DecideRow({ actions.run { app.repo.decideProposal(p.id, true); tick++; onApplied() } }, { actions.run { app.repo.decideProposal(p.id, false); tick++ } })
                }
            }
        }
    }
}

/** "I want to change this" for screenplays and comics: suggest changes, my own version, ask to join the team. */
@Composable
fun ChangeWorkPanel(kind: WorkKind, workId: String, canClone: Boolean, onSuggest: () -> Unit, onDone: () -> Unit) {
    val app = crowdly
    val nav = LocalNav.current
    val actions = rememberActions()
    var asking by remember { mutableStateOf(false) }
    var message by remember { mutableStateOf("") }
    var existing by remember { mutableStateOf<CollabRequest?>(null) }
    LaunchedEffect(workId) { existing = app.repo.myWorkCollaborationRequest(kind, workId) }
    PanelTitle("android-change-work-title", "I want to change this")
    if (!asking) {
        ListRow(tr("android-change-suggest", "Suggest changes"), subtitle = tr("android-change-suggest-work-desc", "Edit here; each change you make is sent to the owner as a suggestion."), onClick = onSuggest)
        if (canClone) ListRow(tr("android-change-clone", "Make my own version"), subtitle = tr("android-change-clone-work-desc", "Copy it into a new one that you own."), onClick = {
            actions.run { val newId = app.repo.cloneWork(kind, workId); onDone(); nav.navigate(Routes.work(kind.key, newId)) }
        })
        ListRow(
            tr("android-change-collab", "Ask to collaborate"),
            subtitle = existing?.let { tr("android-change-collab-asked", "You already asked") + " (${it.status})." } ?: tr("android-change-collab-work-desc", "Ask the owner to add you to the team."),
            onClick = { if (existing == null) asking = true },
        )
    } else Column(Modifier.padding(16.dp)) {
        OutlinedTextField(message, { message = it }, Modifier.fillMaxWidth(), minLines = 3, label = { AppText("android-change-collab-message", "Tell the author what you'd like to work on") })
        Button({ actions.run("Request sent") { app.repo.requestWorkCollaboration(kind, workId, message); onDone() } }, Modifier.padding(top = 8.dp)) { AppText("android-change-collab-send", "Send request") }
    }
}

/** Work settings shared by screenplays and comics: title, visibility, published, plus a link to the rest on the platform. */
@Composable
fun WorkSettingsPanel(kind: WorkKind, workId: String, title0: String, visibility0: String?, published0: Boolean, extra: @Composable () -> Unit = {}, onSaved: () -> Unit) {
    val app = crowdly
    val context = LocalContext.current
    val actions = rememberActions()
    var title by remember { mutableStateOf(title0) }
    var public by remember { mutableStateOf(visibility0 != "private") }
    var published by remember { mutableStateOf(published0) }
    PanelTitle("android-work-settings", "Settings")
    Column(Modifier.padding(horizontal = 16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        OutlinedTextField(title, { title = it }, Modifier.fillMaxWidth(), label = { AppText("android-title", "Title") }, singleLine = true)
        Row(verticalAlignment = Alignment.CenterVertically) { AppText("android-meta-public", "Public (anyone can read it)", Modifier.weight(1f)); Switch(public, { public = it }) }
        Row(verticalAlignment = Alignment.CenterVertically) { AppText("android-meta-published", "Published", Modifier.weight(1f)); Switch(published, { published = it }) }
        extra()
        TextButton({ cloud.crowdly.app.ui.more.openInBrowser(context, "${app.prefs.platformUrl}/${kind.key}/$workId") }) { AppText("android-meta-more", "More settings (people, policies, cover) on the platform") }
        Button({
            actions.run {
                app.repo.updateWorkSettings(kind, workId, "title" to title.trim(), "visibility" to if (public) "public" else "private", "published" to published)
                onSaved()
            }
        }) { AppText("android-save", "Save") }
    }
}

@Composable
fun isWide(): Boolean = LocalConfiguration.current.screenWidthDp >= 600
