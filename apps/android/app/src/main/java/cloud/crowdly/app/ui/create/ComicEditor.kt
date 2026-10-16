package cloud.crowdly.app.ui.create

import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectDragGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AddPhotoAlternate
import androidx.compose.material.icons.filled.CameraAlt
import androidx.compose.material.icons.filled.ChatBubble
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.DragHandle
import androidx.compose.material.icons.filled.MoreVert
import androidx.compose.material.icons.filled.ShortText
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.dp
import androidx.core.content.FileProvider
import cloud.crowdly.app.crowdly
import cloud.crowdly.app.data.Comic
import cloud.crowdly.app.data.ComicPage
import cloud.crowdly.app.data.Overlay
import cloud.crowdly.app.data.PageBranch
import cloud.crowdly.app.data.WorkAccess
import cloud.crowdly.app.data.WorkKind
import cloud.crowdly.app.i18n.AppText
import cloud.crowdly.app.i18n.tr
import cloud.crowdly.app.net.jsonOf
import cloud.crowdly.app.ui.LocalNav
import cloud.crowdly.app.ui.Routes
import cloud.crowdly.app.ui.components.Confirm
import cloud.crowdly.app.ui.components.Empty
import cloud.crowdly.app.ui.components.Pill
import cloud.crowdly.app.ui.components.ReorderableColumn
import cloud.crowdly.app.ui.components.Screen
import cloud.crowdly.app.ui.components.TextPrompt
import cloud.crowdly.app.ui.components.errorText
import cloud.crowdly.app.ui.components.readPicked
import cloud.crowdly.app.ui.components.rememberActions
import cloud.crowdly.app.ui.more.openInBrowser
import coil3.compose.AsyncImage
import java.io.File
import kotlin.math.roundToInt

private enum class ComicPanel { REVIEW, EDITIONS, SETTINGS, CHANGE, PAGES }

/**
 * The comic / manga editor (apps/web ComicEditor.tsx): issues, pages
 * (upload from the gallery or camera, reorder, alt text), speech bubbles and
 * captions placed by dragging (x/y % of the image), page alternatives and
 * reading direction. Readers outside the team suggest page text instead.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ComicEditorScreen(id: String) {
    val app = crowdly
    val nav = LocalNav.current
    val context = LocalContext.current
    val actions = rememberActions()

    var comic by remember { mutableStateOf<Comic?>(null) }
    var access by remember { mutableStateOf(WorkAccess.NONE) }
    var branches by remember { mutableStateOf<List<PageBranch>>(emptyList()) }
    var error by remember { mutableStateOf<String?>(null) }
    var issueId by remember { mutableStateOf<String?>(null) }
    var openPage by remember { mutableStateOf<ComicPage?>(null) }
    var panel by remember { mutableStateOf<ComicPanel?>(null) }
    var menu by remember { mutableStateOf(false) }
    var renamingIssue by remember { mutableStateOf(false) }
    var addingIssue by remember { mutableStateOf(false) }
    var deletingIssue by remember { mutableStateOf(false) }
    var confirmDelete by remember { mutableStateOf(false) }
    var export by remember { mutableStateOf(false) }
    var tick by remember { mutableIntStateOf(0) }
    var cameraUri by remember { mutableStateOf<Uri?>(null) }

    LaunchedEffect(id, tick) {
        try {
            val c = app.repo.comic(id)
            comic = c
            access = app.repo.workAccess(WorkKind.COMIC, id)
            branches = app.repo.pageBranches(id)
            if (issueId == null || c.issues.none { it.id == issueId }) issueId = c.issues.firstOrNull()?.id
            openPage = openPage?.let { p -> c.pages.firstOrNull { it.id == p.id } }
            error = null
        } catch (e: Exception) { error = errorText(e) }
    }

    val canEdit = access.explicit
    val isOwner = access.isOwner
    val canSuggest = app.session.userId != null && access.role != null && !canEdit

    fun upload(parts: List<cloud.crowdly.app.net.Api.FilePart>) = actions.run(tr0("${parts.size} page(s) added")) {
        app.repo.uploadPages(id, issueId, parts.map { it.copy(field = "images") })
        tick++
    }
    val pagesPicker = rememberLauncherForActivityResult(ActivityResultContracts.PickMultipleVisualMedia(100)) { uris ->
        if (uris.isNotEmpty()) actions.run { upload(uris.map { readPicked(context, it, "images") }) }
    }
    val camera = rememberLauncherForActivityResult(ActivityResultContracts.TakePicture()) { ok ->
        val uri = cameraUri
        if (ok && uri != null) actions.run { upload(listOf(readPicked(context, uri, "images").copy(name = "photo-${System.currentTimeMillis()}.jpg", mime = "image/jpeg"))) }
    }
    fun takePhoto() {
        val dir = File(context.cacheDir, "exports").apply { mkdirs() }
        val f = File(dir, "camera-${System.currentTimeMillis()}.jpg")
        val uri = FileProvider.getUriForFile(context, "${context.packageName}.files", f)
        cameraUri = uri
        camera.launch(uri)
    }

    val c = comic
    val issue = c?.issues?.firstOrNull { it.id == issueId }
    val pages = c?.pages?.filter { issueId == null || it.issueId == issueId }.orEmpty().sortedBy { it.index }

    Screen(
        c?.title ?: "…",
        back = { nav.popBackStack() },
        subtitle = listOfNotNull(issue?.title, "${pages.size} ${tr("android-comic-pages", "pages")}", if (c?.direction == "rtl") tr("android-comic-rtl", "right to left") else null).joinToString(" · "),
        actions = {
            if (canEdit) {
                IconButton({ pagesPicker.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly)) }) { Icon(Icons.Filled.AddPhotoAlternate, tr("android-comic-upload", "Add pages")) }
                IconButton({ takePhoto() }) { Icon(Icons.Filled.CameraAlt, tr("android-comic-camera", "Take a photo")) }
            }
            IconButton({ menu = true }) { Icon(Icons.Filled.MoreVert, tr("android-more", "More")) }
            DropdownMenu(menu, { menu = false }) {
                if (canEdit) {
                    DropdownMenuItem({ AppText("android-comic-reorder", "Reorder pages") }, { menu = false; panel = ComicPanel.PAGES })
                    DropdownMenuItem({ AppText("android-comic-add-issue", "New issue") }, { menu = false; addingIssue = true })
                    if (issue != null) {
                        DropdownMenuItem({ AppText("android-comic-rename-issue", "Rename issue") }, { menu = false; renamingIssue = true })
                        DropdownMenuItem({ if (issue.published) AppText("android-comic-unpublish", "Unpublish issue") else AppText("android-comic-publish", "Publish issue") }, {
                            menu = false; actions.run { app.repo.publishIssue(issue.id, !issue.published); tick++ }
                        })
                        if ((c?.issues?.size ?: 0) > 1) DropdownMenuItem({ AppText("android-comic-delete-issue", "Delete issue") }, { menu = false; deletingIssue = true })
                    }
                }
                if (isOwner) DropdownMenuItem({ AppText("android-story-review", "Suggestions and requests") }, { menu = false; panel = ComicPanel.REVIEW })
                DropdownMenuItem({ AppText("android-story-editions", "Editions") }, { menu = false; panel = ComicPanel.EDITIONS })
                DropdownMenuItem({ AppText("android-story-read", "Read") }, { menu = false; nav.navigate(Routes.read("comic", id)) })
                DropdownMenuItem({ AppText("android-export", "Export or share") }, { menu = false; export = true })
                if (isOwner) DropdownMenuItem({ AppText("android-work-settings", "Settings") }, { menu = false; panel = ComicPanel.SETTINGS })
                if (canSuggest) DropdownMenuItem({ AppText("android-story-change", "I want to change this") }, { menu = false; panel = ComicPanel.CHANGE })
                DropdownMenuItem({ AppText("android-open-platform", "Open on the platform") }, { menu = false; openInBrowser(context, "${app.prefs.platformUrl}/comic/$id") })
                if (isOwner) DropdownMenuItem({ AppText("android-comic-delete", "Delete comic") }, { menu = false; confirmDelete = true })
            }
        },
    ) { pad ->
        Column(Modifier.padding(pad).fillMaxSize()) {
            if (c == null) { Empty(error ?: "…"); return@Column }
            if (!canEdit) Banner(Color(0xFFFFFBEB), Color(0xFF78350F)) {
                AppText("android-comic-readonly", "You're reading this comic. Open a page to suggest its text.", Modifier.weight(1f), style = MaterialTheme.typography.bodySmall, color = Color(0xFF78350F))
            }
            if (c.issues.size > 1) LazyRow(Modifier.padding(8.dp), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                items(c.issues, key = { it.id }) { i -> FilterChip(i.id == issueId, { issueId = i.id }, { Text(i.title + if (!i.published) " ·" else "") }) }
            }
            if (pages.isEmpty()) {
                Empty(if (canEdit) tr("android-comic-empty-edit", "No pages yet. Add pictures from the gallery or take photos.") else tr("android-comic-empty", "No pages yet."))
                return@Column
            }
            BoxWithConstraints(Modifier.fillMaxSize()) {
                val cols = (maxWidth / 160.dp).toInt().coerceAtLeast(2)
                androidx.compose.runtime.CompositionLocalProvider(
                    androidx.compose.ui.platform.LocalLayoutDirection provides if (c.direction == "rtl") androidx.compose.ui.unit.LayoutDirection.Rtl else androidx.compose.ui.platform.LocalLayoutDirection.current,
                ) {
                androidx.compose.foundation.lazy.grid.LazyVerticalGrid(
                    androidx.compose.foundation.lazy.grid.GridCells.Fixed(cols),
                    Modifier.fillMaxSize().padding(8.dp),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    items(pages.size, key = { pages[it].id }) { i ->
                        val p = pages[i]
                        Column(Modifier.clickable { openPage = p }) {
                            Box {
                                AsyncImage(app.api.mediaUrl(p.imageUrl), p.alt, Modifier.fillMaxWidth().heightIn(min = 120.dp).border(1.dp, MaterialTheme.colorScheme.outline), contentScale = ContentScale.FillWidth)
                                Row(Modifier.align(Alignment.TopEnd).padding(4.dp), horizontalArrangement = Arrangement.spacedBy(2.dp)) {
                                    if (p.overlays.isNotEmpty()) Pill("💬${p.overlays.size}")
                                    val alts = branches.count { it.pageId == p.id }
                                    if (alts > 0) Pill("⑂$alts")
                                }
                            }
                            Text("${i + 1}", Modifier.fillMaxWidth(), textAlign = TextAlign.Center, style = MaterialTheme.typography.labelSmall)
                        }
                    }
                }
                }
            }
        }
    }

    openPage?.let { p ->
        PageEditor(p, branches.filter { it.pageId == p.id }, canEdit, canSuggest, onClose = { openPage = null }, changed = { tick++ }, comicId = id)
    }

    val sheet = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    val pnl = panel
    if (pnl != null && c != null) ModalBottomSheet({ panel = null }, sheetState = sheet) {
        Column(Modifier.fillMaxWidth().padding(bottom = 24.dp)) {
            when (pnl) {
                ComicPanel.PAGES -> {
                    PanelTitle("android-comic-reorder", "Reorder pages")
                    Column(Modifier.heightIn(max = 560.dp).verticalScroll(rememberScrollState())) {
                        ReorderableColumn(pages, key = { it.id }, onMove = { order ->
                            actions.run { app.repo.reorderPages(id, order.map { it.id }); tick++ }
                        }) { p, handle ->
                            Row(Modifier.fillMaxWidth().padding(horizontal = 8.dp, vertical = 4.dp), verticalAlignment = Alignment.CenterVertically) {
                                Icon(Icons.Filled.DragHandle, tr("android-drag", "Drag to reorder"), handle.padding(8.dp))
                                AsyncImage(app.api.mediaUrl(p.imageUrl), p.alt, Modifier.size(56.dp), contentScale = ContentScale.Crop)
                                Text(p.alt?.ifBlank { null } ?: "${tr("android-comic-page", "Page")} ${pages.indexOf(p) + 1}", Modifier.weight(1f).padding(horizontal = 8.dp))
                                IconButton({ actions.run { app.repo.deletePage(p.id); tick++ } }) { Icon(Icons.Filled.Delete, tr("android-delete", "Delete")) }
                            }
                        }
                    }
                }
                ComicPanel.REVIEW -> WorkReviewPanel(WorkKind.COMIC, id) { tick++ }
                ComicPanel.EDITIONS -> EditionsPanel(WorkKind.COMIC, id, c.issues.map { i ->
                    EditionPart(i.id, i.title, c.pages.filter { it.issueId == i.id }.sortedBy { it.index }.mapIndexedNotNull { n, p ->
                        val opts = branches.filter { it.pageId == p.id }
                        if (opts.isEmpty()) null else EditionSlot(p.id, "${tr("android-comic-page", "Page")} ${n + 1}", opts.map { it.id to (it.name ?: "Alternative") })
                    })
                })
                ComicPanel.SETTINGS -> {
                    var rtl by remember { mutableStateOf(c.direction == "rtl") }
                    WorkSettingsPanel(WorkKind.COMIC, id, c.title, c.visibility, c.published, extra = {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            AppText("android-comic-direction", "Read right to left (manga)", Modifier.weight(1f))
                            androidx.compose.material3.Switch(rtl, { v -> rtl = v; actions.run { app.repo.updateComicSettings(id, "reading_direction" to if (v) "rtl" else "ltr"); tick++ } })
                        }
                    }) { tick++; panel = null }
                }
                ComicPanel.CHANGE -> ChangeWorkPanel(WorkKind.COMIC, id, access.canClone, onSuggest = { panel = null }) { panel = null }
            }
        }
    }
    if (addingIssue) TextPrompt(tr("android-comic-add-issue", "New issue"), "Issue ${(c?.issues?.size ?: 0) + 1}", confirm = tr("android-create", "Create"), onDismiss = { addingIssue = false }) { t ->
        addingIssue = false
        actions.run { issueId = app.repo.createIssue(id, t.trim(), issueId).id; tick++ }
    }
    if (renamingIssue && issue != null) TextPrompt(tr("android-comic-rename-issue", "Rename issue"), issue.title, confirm = tr("android-save", "Save"), onDismiss = { renamingIssue = false }) { t ->
        renamingIssue = false
        actions.run { app.repo.renameIssue(issue.id, t.trim()); tick++ }
    }
    if (deletingIssue && issue != null) Confirm(tr("android-comic-delete-issue", "Delete issue"), "\"${issue.title}\" — " + tr("android-comic-delete-issue-text", "and its pages."), tr("android-delete", "Delete"), { deletingIssue = false }) {
        actions.run { app.repo.deleteIssue(issue.id); issueId = null; tick++ }
    }
    if (export) ExportDialog(WorkKind.COMIC, id) { export = false }
    if (confirmDelete && c != null) Confirm(tr("android-comic-delete", "Delete comic"), "\"${c.title}\" — " + tr("android-cant-undo", "this can't be undone."), tr("android-delete", "Delete"), { confirmDelete = false }) {
        actions.run { app.repo.deleteWork(WorkKind.COMIC, id); nav.popBackStack() }
    }
}

private fun tr0(s: String) = s

/**
 * One page full-screen: its text layers (drag to move, tap to edit), alt
 * text, and alternatives. Team members save layers; others send them as a
 * page_layer suggestion (Documentation/branching-api.md).
 */
@Composable
private fun PageEditor(page: ComicPage, alts: List<PageBranch>, canEdit: Boolean, canSuggest: Boolean, comicId: String, onClose: () -> Unit, changed: () -> Unit) {
    val app = crowdly
    val context = LocalContext.current
    val actions = rememberActions()
    // null = the page itself; otherwise one of its alternatives
    var altId by remember(page.id) { mutableStateOf<String?>(null) }
    val alt = alts.firstOrNull { it.id == altId }
    val source = alt?.overlays ?: page.overlays
    val layers = remember(page.id, altId, source) { mutableStateListOf<Overlay>().apply { addAll(source) } }
    var editing by remember { mutableStateOf<Int?>(null) }
    var altText by remember(page.id) { mutableStateOf(page.alt.orEmpty()) }
    var namingAlt by remember { mutableStateOf(false) }
    var pendingAlt by remember { mutableStateOf<cloud.crowdly.app.net.Api.FilePart?>(null) }
    val mineAlt = alt == null || alt.userId == app.session.userId || canEdit
    val writable = (canEdit && mineAlt) || (alt != null && alt.userId == app.session.userId) || (canSuggest && alt == null)
    val dirty = layers.toList() != source

    val altPicker = rememberLauncherForActivityResult(ActivityResultContracts.PickVisualMedia()) { uri ->
        if (uri != null) actions.run { pendingAlt = readPicked(context, uri, "image"); namingAlt = true }
    }

    androidx.compose.ui.window.Dialog(onClose, androidx.compose.ui.window.DialogProperties(usePlatformDefaultWidth = false)) {
        Screen(
            if (alt == null) tr("android-comic-page", "Page") else alt.name ?: tr("android-comic-alternative", "Alternative"),
            back = onClose,
            actions = {
                val newBubble = tr("android-comic-new-bubble", "Text")
                val newCaption = tr("android-comic-new-caption", "Caption")
                if (writable) {
                    IconButton({ layers += Overlay(newBubble, 50.0, 20.0, "bubble"); editing = layers.lastIndex }) { Icon(Icons.Filled.ChatBubble, tr("android-comic-add-bubble", "Add a speech bubble")) }
                    IconButton({ layers += Overlay(newCaption, 50.0, 8.0, "box"); editing = layers.lastIndex }) { Icon(Icons.Filled.ShortText, tr("android-comic-add-caption", "Add a caption")) }
                }
                if (app.session.userId != null) IconButton({ altPicker.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly)) }) { Icon(Icons.Filled.AddPhotoAlternate, tr("android-comic-add-alt", "Add an alternative")) }
            },
        ) { pad ->
            Column(Modifier.padding(pad).fillMaxSize().verticalScroll(rememberScrollState())) {
                if (alts.isNotEmpty()) LazyRow(Modifier.padding(8.dp), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    item { FilterChip(altId == null, { altId = null }, { AppText("android-comic-original", "Original") }) }
                    items(alts, key = { it.id }) { a -> FilterChip(altId == a.id, { altId = a.id }, { Text(a.name ?: tr("android-comic-alternative", "Alternative")) }) }
                }
                BoxWithConstraints(Modifier.fillMaxWidth()) {
                    val w = constraints.maxWidth.toFloat()
                    var h by remember { mutableStateOf(0f) }
                    AsyncImage(
                        app.api.mediaUrl(alt?.imageUrl ?: page.imageUrl), page.alt, Modifier.fillMaxWidth(), contentScale = ContentScale.FillWidth,
                        onSuccess = { s -> h = w * s.painter.intrinsicSize.height / s.painter.intrinsicSize.width.coerceAtLeast(1f) },
                    )
                    val density = LocalDensity.current
                    layers.forEachIndexed { i, l ->
                        Box(
                            Modifier
                                .offset { IntOffset((w * l.x / 100).roundToInt(), (h * l.y / 100).roundToInt()) }
                                .offset((-60).dp, (-16).dp)
                                .widthIn(max = 180.dp)
                                .background(if (l.style == "box") Color(0xFFFEF3C7) else Color.White, RoundedCornerShape(if (l.style == "box") 2.dp else 16.dp))
                                .border(1.dp, Color.Black, RoundedCornerShape(if (l.style == "box") 2.dp else 16.dp))
                                .then(if (writable) Modifier.pointerInput(i, w, h) {
                                    detectDragGestures { change, amount ->
                                        change.consume()
                                        if (w > 0 && h > 0) {
                                            val cur = layers[i]
                                            layers[i] = cur.copy(x = (cur.x + amount.x / w * 100).coerceIn(0.0, 100.0), y = (cur.y + amount.y / h * 100).coerceIn(0.0, 100.0))
                                        }
                                    }
                                } else Modifier)
                                .clickable(enabled = writable) { editing = i }
                                .padding(horizontal = 8.dp, vertical = 4.dp),
                        ) { Text(l.text, color = Color.Black, style = MaterialTheme.typography.bodySmall, fontWeight = if (l.style == "box") FontWeight.Normal else FontWeight.Medium) }
                    }
                }
                if (writable && dirty) Row(Modifier.padding(16.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Button({
                        actions.run(if (canEdit || alt != null) tr0("Saved") else tr0("Suggestion sent")) {
                            val list = layers.toList()
                            when {
                                alt != null -> app.repo.updatePageBranch(alt.id, overlays = list)
                                canEdit -> app.repo.updatePage(page.id, overlays = list)
                                else -> app.repo.createWorkProposal(WorkKind.COMIC, comicId, jsonOf("targetType" to "page_layer", "targetPageId" to page.id, "proposedText" to cloud.crowdly.app.net.toJson(list.map { it.json() }).toString()))
                            }
                            changed()
                        }
                    }) { if (canEdit || alt != null) AppText("android-comic-save-text", "Save text") else AppText("android-comic-suggest-text", "Suggest text") }
                    OutlinedButton({ layers.clear(); layers.addAll(source) }) { AppText("android-discard", "Discard") }
                }
                if (alt == null && canEdit) {
                    OutlinedTextField(altText, { altText = it }, Modifier.fillMaxWidth().padding(16.dp), label = { AppText("android-comic-alt-text", "Describe the page (for screen readers)") })
                    if (altText != page.alt.orEmpty()) TextButton({ actions.run { app.repo.updatePage(page.id, alt = altText); changed() } }, Modifier.padding(horizontal = 16.dp)) { AppText("android-save", "Save") }
                }
                if (alt != null && (alt.userId == app.session.userId || canEdit)) TextButton({ actions.run { app.repo.deletePageBranch(alt.id); altId = null; changed() } }, Modifier.padding(16.dp)) {
                    Icon(Icons.Filled.Delete, null); AppText("android-comic-delete-alt", "Delete this alternative")
                }
                Spacer(Modifier.padding(32.dp))
            }
        }
    }

    editing?.let { i ->
        val l = layers.getOrNull(i) ?: return@let
        var text by remember(i) { mutableStateOf(l.text) }
        var style by remember(i) { mutableStateOf(l.style) }
        AlertDialog(
            onDismissRequest = { editing = null },
            title = { AppText("android-comic-edit-layer", "Text layer") },
            text = {
                Column {
                    OutlinedTextField(text, { text = it }, Modifier.fillMaxWidth(), minLines = 2)
                    Row(horizontalArrangement = Arrangement.spacedBy(6.dp), modifier = Modifier.padding(top = 8.dp)) {
                        FilterChip(style == "bubble", { style = "bubble" }, { AppText("android-comic-bubble", "Speech bubble") })
                        FilterChip(style == "box", { style = "box" }, { AppText("android-comic-caption", "Caption box") })
                    }
                }
            },
            confirmButton = { Button({ layers[i] = l.copy(text = text, style = style); editing = null }) { AppText("android-ok", "OK") } },
            dismissButton = { TextButton({ layers.removeAt(i); editing = null }) { AppText("android-delete", "Delete") } },
        )
    }
    if (namingAlt) TextPrompt(tr("android-comic-add-alt", "Add an alternative"), label = tr("android-name", "Name"), confirm = tr("android-create", "Create"), onDismiss = { namingAlt = false; pendingAlt = null }) { name ->
        namingAlt = false
        val f = pendingAlt ?: return@TextPrompt
        actions.run { altId = app.repo.createPageBranch(page.id, name.trim().ifBlank { null }, f).id; changed() }
    }
}
