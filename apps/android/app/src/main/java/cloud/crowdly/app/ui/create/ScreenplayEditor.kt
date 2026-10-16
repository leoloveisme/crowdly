package cloud.crowdly.app.ui.create

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.List
import androidx.compose.material.icons.filled.AccountTree
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.DragHandle
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.History
import androidx.compose.material.icons.filled.MoreVert
import androidx.compose.material.icons.filled.SubdirectoryArrowLeft
import androidx.compose.material3.AssistChip
import androidx.compose.material3.BottomAppBar
import androidx.compose.material3.Button
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import cloud.crowdly.app.crowdly
import cloud.crowdly.app.data.BlockBranch
import cloud.crowdly.app.data.Scene
import cloud.crowdly.app.data.Screenplay
import cloud.crowdly.app.data.ScriptBlock
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
import cloud.crowdly.app.ui.components.SoftCard
import cloud.crowdly.app.ui.components.errorText
import cloud.crowdly.app.ui.components.rememberActions
import cloud.crowdly.app.ui.more.openInBrowser
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

/** Element types (lib/screenplay.ts BLOCK_TYPES), in the order Tab cycles through them. */
val BLOCK_TYPES = listOf(
    "action" to "Action", "character" to "Character", "dialogue" to "Dialogue", "parenthetical" to "Parenthetical",
    "transition" to "Transition", "shot" to "Shot", "scene_heading" to "Scene heading", "general" to "General",
)

/** What Enter at the end of an element creates next (screenwriting convention). */
val NEXT_TYPE = mapOf(
    "scene_heading" to "action", "action" to "action", "character" to "dialogue", "parenthetical" to "dialogue",
    "dialogue" to "character", "transition" to "scene_heading", "shot" to "action", "general" to "general",
)

private enum class SpPanel { OUTLINE, REVIEW, EDITIONS, SETTINGS, CHANGE, BRANCHES }

/**
 * The screenplay editor (apps/web ScreenplayEditor.tsx): a scene outline and
 * a script page where every element is a typed block. "Next element" adds
 * the conventional next type, the type chip cycles types, and edits save 2 s
 * after typing. Readers outside the team suggest changes instead.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ScreenplayEditorScreen(id: String) {
    val app = crowdly
    val nav = LocalNav.current
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val actions = rememberActions()
    val list = rememberLazyListState()

    var sp by remember { mutableStateOf<Screenplay?>(null) }
    var scenes by remember { mutableStateOf<List<Scene>>(emptyList()) }
    var blocks by remember { mutableStateOf<List<ScriptBlock>>(emptyList()) }
    var access by remember { mutableStateOf(WorkAccess.NONE) }
    var branches by remember { mutableStateOf<List<BlockBranch>>(emptyList()) }
    var saved by remember { mutableStateOf<Map<String, String>>(emptyMap()) }
    var error by remember { mutableStateOf<String?>(null) }
    var suggesting by remember { mutableStateOf(false) }
    var panel by remember { mutableStateOf<SpPanel?>(null) }
    var branchBlock by remember { mutableStateOf<ScriptBlock?>(null) }
    var focused by remember { mutableStateOf<ScriptBlock?>(null) }
    var focusTarget by remember { mutableStateOf<String?>(null) }
    var menu by remember { mutableStateOf(false) }
    var revScene by remember { mutableStateOf<Scene?>(null) }
    var deletingScene by remember { mutableStateOf<Scene?>(null) }
    var confirmDelete by remember { mutableStateOf(false) }
    var export by remember { mutableStateOf(false) }
    var tick by remember { mutableIntStateOf(0) }
    val pending = remember { mutableStateMapOf<String, Pair<String, String>>() } // id → (kind, text)
    var pendingStamp by remember { mutableStateOf(0L) }
    var saveState by remember { mutableStateOf("") }
    var find by remember { mutableStateOf<Boolean?>(null) }

    val canEdit = access.explicit
    val isOwner = access.isOwner
    val canSuggest = app.session.userId != null && access.role != null && !canEdit
    val writable = canEdit || (canSuggest && suggesting)

    suspend fun loadContributions() { branches = app.repo.blockBranches(id) }
    LaunchedEffect(id, tick) {
        try {
            sp = app.repo.screenplay(id)
            val (sc, bl) = app.repo.scenes(id)
            scenes = sc
            blocks = bl.filter { it.id !in pending }.plus(blocks.filter { it.id in pending })
                .distinctBy { it.id }.sortedBy { it.index }
            access = app.repo.workAccess(WorkKind.SCREENPLAY, id)
            saved = bl.associate { it.id to it.text } + sc.associate { "scene:${it.id}" to it.slugline }
            loadContributions()
            error = null
        } catch (e: Exception) { error = errorText(e) }
    }

    suspend fun flush() {
        val items = pending.toMap()
        if (items.isEmpty()) return
        pending.clear()
        saveState = "Saving…"
        try {
            for ((key, v) in items) if (v.first == "block") app.repo.updateBlockText(key, v.second) else app.repo.updateScene(key, v.second)
            saveState = if (app.outbox.count.value > 0) "Saved on this phone" else "Saved"
        } catch (e: Exception) { saveState = errorText(e) }
    }
    LaunchedEffect(pendingStamp) { if (pendingStamp > 0) { delay(2000); flush() } }
    DisposableEffect(Unit) { onDispose { app.scope.launch { flush() } } }

    fun queue(kind: String, key: String, text: String) {
        pending[key] = kind to text
        pendingStamp = System.nanoTime()
        saveState = "Editing"
    }

    fun suggest(body: kotlinx.serialization.json.JsonObject, restore: () -> Unit) {
        restore()
        actions.run(tr0("Suggestion sent: the owner will review your change.")) { app.repo.createWorkProposal(WorkKind.SCREENPLAY, id, body); loadContributions() }
    }

    fun setText(b: ScriptBlock, text: String) {
        blocks = blocks.map { if (it.id == b.id) it.copy(text = text) else it }
        if (canEdit) queue("block", b.id, text)
    }

    fun leaveBlock(b: ScriptBlock) {
        if (!suggesting) return
        val original = saved[b.id].orEmpty()
        val current = blocks.firstOrNull { it.id == b.id }?.text.orEmpty()
        if (current.trim() == original.trim()) return
        suggest(jsonOf("targetType" to "block", "targetBlockId" to b.id, "proposedText" to current)) { blocks = blocks.map { if (it.id == b.id) it.copy(text = original) else it } }
    }

    fun setType(b: ScriptBlock, type: String) {
        blocks = blocks.map { if (it.id == b.id) it.copy(type = type) else it }
        focused = focused?.let { if (it.id == b.id) it.copy(type = type) else it }
        actions.run { app.repo.updateBlockType(b.id, type) }
    }

    fun addAfter(scene: Scene, after: ScriptBlock?, type: String) = actions.run {
        flush()
        val nb = app.repo.createBlock(id, scene.id, type, " ", after?.id)
        // The backend shifts later elements; reload to get the new order.
        blocks = app.repo.scenes(id).second
        focusTarget = nb.id
    }

    fun removeBlock(b: ScriptBlock) = actions.run {
        app.repo.deleteBlock(b.id)
        pending.remove(b.id)
        blocks = blocks.filter { it.id != b.id }
        if (focused?.id == b.id) focused = null
    }

    val s = sp
    Screen(
        s?.title ?: "…",
        back = { nav.popBackStack() },
        subtitle = listOfNotNull("${scenes.size} ${tr("android-sp-scenes", "scenes")}", saveState.ifBlank { null }).joinToString(" · "),
        actions = {
            IconButton({ panel = SpPanel.OUTLINE }) { Icon(Icons.AutoMirrored.Filled.List, tr("android-sp-outline", "Outline")) }
            IconButton({ menu = true }) { Icon(Icons.Filled.MoreVert, tr("android-more", "More")) }
            DropdownMenu(menu, { menu = false }) {
                if (canEdit) DropdownMenuItem({ AppText("android-sp-add-scene", "Add scene") }, {
                    menu = false
                    actions.run {
                        val sc = app.repo.createScene(id, (scenes.lastOrNull()?.index ?: 0) + 1, "INT. NEW SCENE ${scenes.size + 1} - DAY")
                        scenes = scenes + sc
                        app.repo.createBlock(id, sc.id, "action", " ", null)
                        blocks = app.repo.scenes(id).second
                    }
                })
                DropdownMenuItem({ AppText("android-find", "Find") }, { menu = false; find = false })
                if (canEdit) DropdownMenuItem({ AppText("android-replace", "Replace") }, { menu = false; find = true })
                if (isOwner) DropdownMenuItem({ AppText("android-story-review", "Suggestions and requests") }, { menu = false; panel = SpPanel.REVIEW })
                DropdownMenuItem({ AppText("android-story-editions", "Editions") }, { menu = false; panel = SpPanel.EDITIONS })
                DropdownMenuItem({ AppText("android-story-read", "Read") }, { menu = false; nav.navigate(Routes.read("screenplay", id)) })
                DropdownMenuItem({ AppText("android-export", "Export or share") }, { menu = false; scope.launch { flush(); export = true } })
                if (isOwner) DropdownMenuItem({ AppText("android-work-settings", "Settings") }, { menu = false; panel = SpPanel.SETTINGS })
                if (canSuggest) DropdownMenuItem({ AppText("android-story-change", "I want to change this") }, { menu = false; panel = SpPanel.CHANGE })
                DropdownMenuItem({ AppText("android-open-platform", "Open on the platform") }, { menu = false; openInBrowser(context, "${app.prefs.platformUrl}/screenplay/$id") })
                if (isOwner) DropdownMenuItem({ AppText("android-sp-delete", "Delete screenplay") }, { menu = false; confirmDelete = true })
            }
        },
    ) { pad ->
        Column(Modifier.padding(pad).fillMaxSize().imePadding()) {
            if (s == null) { Empty(error ?: "…"); return@Column }
            if (suggesting) Banner(Color(0xFFF3E8FF), Color(0xFF581C87)) {
                AppText("android-sp-suggesting", "Suggesting: each change you make is sent to the owner when you leave the element.", Modifier.weight(1f), style = MaterialTheme.typography.bodySmall, color = Color(0xFF581C87))
                TextButton({ suggesting = false }) { AppText("android-done", "Done") }
            } else if (!canEdit) Banner(Color(0xFFFFFBEB), Color(0xFF78350F)) {
                AppText("android-sp-readonly", "You're reading this screenplay.", Modifier.weight(1f), style = MaterialTheme.typography.bodySmall, color = Color(0xFF78350F))
                if (canSuggest) TextButton({ panel = SpPanel.CHANGE }) { AppText("android-story-change-short", "Change") }
            }
            find?.let { replacing ->
                cloud.crowdly.app.ui.components.FindBar(blocks.map { it.text } + scenes.map { it.slugline }, replacing && canEdit, onClose = { find = null }, onSelect = null) { q, r, mc, ww ->
                    for (b in blocks) {
                        val t = cloud.crowdly.app.ui.components.replaceAll(b.text, q, r, mc, ww)
                        if (t != b.text) setText(b, t)
                    }
                    scenes = scenes.map { sc ->
                        val t = cloud.crowdly.app.ui.components.replaceAll(sc.slugline, q, r, mc, ww)
                        if (t != sc.slugline) queue("scene", sc.id, t)
                        sc.copy(slugline = t)
                    }
                }
            }
            LazyColumn(Modifier.weight(1f).fillMaxWidth(), state = list) {
                for (scene in scenes) {
                    item(key = "scene-" + scene.id) {
                        SceneHeader(scene, writable, isOwner, canEdit, saved,
                            onChange = { text ->
                                scenes = scenes.map { if (it.id == scene.id) it.copy(slugline = text) else it }
                                if (canEdit) queue("scene", scene.id, text)
                            },
                            onLeave = {
                                if (suggesting) {
                                    val original = saved["scene:${scene.id}"].orEmpty()
                                    val current = scenes.firstOrNull { it.id == scene.id }?.slugline.orEmpty()
                                    if (current.trim() != original.trim() && current.isNotBlank())
                                        suggest(jsonOf("targetType" to "scene", "targetSceneId" to scene.id, "proposedText" to current.trim())) { scenes = scenes.map { if (it.id == scene.id) it.copy(slugline = original) else it } }
                                }
                            },
                            onRevisions = { scope.launch { flush(); revScene = scene } },
                            onDelete = { deletingScene = scene },
                        )
                    }
                    val inScene = blocks.filter { it.sceneId == scene.id }.sortedBy { it.index }
                    items(inScene, key = { it.id }) { b ->
                        BlockRow(b, writable, branches.count { it.blockId == b.id }, focusTarget == b.id,
                            onFocusTaken = { focusTarget = null },
                            onChange = { setText(b, it) },
                            onFocus = { focused = b },
                            onLeave = { leaveBlock(b) },
                            onBranches = { branchBlock = b },
                        )
                    }
                    if (inScene.isEmpty() && canEdit) item(key = "add-" + scene.id) {
                        TextButton({ addAfter(scene, null, "action") }, Modifier.padding(start = 16.dp)) { Icon(Icons.Filled.Add, null); AppText("android-sp-add-element", "Add an element") }
                    }
                }
                item { Spacer(Modifier.padding(48.dp)) }
            }
            val f = focused?.let { fb -> blocks.firstOrNull { it.id == fb.id } }
            if (f != null && canEdit) {
                val scene = scenes.firstOrNull { it.id == f.sceneId }
                BottomAppBar(windowInsets = androidx.compose.foundation.layout.WindowInsets(0)) {
                    var typeMenu by remember { mutableStateOf(false) }
                    AssistChip({ typeMenu = true }, { Text(BLOCK_TYPES.firstOrNull { it.first == f.type }?.second ?: f.type) })
                    DropdownMenu(typeMenu, { typeMenu = false }) { BLOCK_TYPES.forEach { (v, l) -> DropdownMenuItem({ Text(l) }, { typeMenu = false; setType(f, v) }) } }
                    Spacer(Modifier.weight(1f))
                    IconButton({ branchBlock = f }) { Icon(Icons.Filled.AccountTree, tr("android-story-branches", "Branches")) }
                    IconButton({ if (blocks.count { it.sceneId == f.sceneId } > 1) removeBlock(f) }) { Icon(Icons.Filled.Delete, tr("android-delete", "Delete")) }
                    Button({ if (scene != null) addAfter(scene, f, NEXT_TYPE[f.type] ?: "action") }) {
                        Icon(Icons.Filled.SubdirectoryArrowLeft, null)
                        Text(" " + (BLOCK_TYPES.firstOrNull { it.first == (NEXT_TYPE[f.type] ?: "action") }?.second ?: ""))
                    }
                }
            }
        }
    }

    val sheet = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    val p = panel
    if (p != null && s != null) ModalBottomSheet({ panel = null }, sheetState = sheet) {
        Column(Modifier.fillMaxWidth().padding(bottom = 24.dp)) {
            when (p) {
                SpPanel.OUTLINE -> {
                    PanelTitle("android-sp-outline", "Outline")
                    Column(Modifier.heightIn(max = 560.dp).verticalScroll(rememberScrollState())) {
                        ReorderableColumn(scenes, key = { it.id }, enabled = canEdit, onMove = { order ->
                            val prev = scenes
                            scenes = order
                            actions.run { try { app.repo.reorderScenes(id, order.map { it.id }) } catch (e: Exception) { scenes = prev; throw e } }
                        }) { sc, handle ->
                            Row(Modifier.fillMaxWidth().clickable {
                                panel = null
                                val at = scenes.takeWhile { it.id != sc.id }.sumOf { x -> 1 + blocks.count { it.sceneId == x.id } + if (blocks.none { it.sceneId == x.id } && canEdit) 1 else 0 }
                                scope.launch { list.animateScrollToItem(at) }
                            }.padding(horizontal = 8.dp, vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                                if (canEdit) Icon(Icons.Filled.DragHandle, tr("android-drag", "Drag to reorder"), handle.padding(8.dp))
                                Text(sc.slugline.uppercase(), Modifier.weight(1f), fontFamily = FontFamily.Monospace)
                                Text("${blocks.count { it.sceneId == sc.id }}", style = MaterialTheme.typography.labelSmall)
                            }
                        }
                    }
                }
                SpPanel.REVIEW -> WorkReviewPanel(WorkKind.SCREENPLAY, id) { tick++ }
                SpPanel.EDITIONS -> EditionsPanel(WorkKind.SCREENPLAY, id, scenes.map { sc ->
                    EditionPart(sc.id, sc.slugline, blocks.filter { it.sceneId == sc.id }.mapNotNull { b ->
                        val opts = branches.filter { it.blockId == b.id }
                        if (opts.isEmpty()) null else EditionSlot(b.id, b.text, opts.map { it.id to (it.name ?: it.text.take(60)) })
                    })
                })
                SpPanel.SETTINGS -> WorkSettingsPanel(WorkKind.SCREENPLAY, id, s.title, s.visibility, s.published) { tick++; panel = null }
                SpPanel.CHANGE -> ChangeWorkPanel(WorkKind.SCREENPLAY, id, access.canClone, onSuggest = { suggesting = true; panel = null }) { panel = null }
                else -> Unit
            }
        }
    }
    branchBlock?.let { b ->
        ModalBottomSheet({ branchBlock = null }) {
            BlockBranchesPanel(b, branches.filter { it.blockId == b.id }, canBranch = app.session.userId != null && (access.role != null || canEdit),
                canEditBranch = { br -> br.userId == app.session.userId || isOwner || access.isAdmin },
                onSuggest = { br, text -> suggest(jsonOf("targetType" to "block_branch", "targetBranchId" to br.id, "proposedText" to text)) {} },
            ) { scope.launch { loadContributions() } }
        }
    }
    revScene?.let { sc -> RevisionsScreen(listOf("docType" to "scene", "sceneId" to sc.id), sc.slugline, onClose = { revScene = null; tick++ }) }
    if (export) ExportDialog(WorkKind.SCREENPLAY, id) { export = false }
    deletingScene?.let { sc -> Confirm(tr("android-sp-delete-scene", "Delete scene"), "\"${sc.slugline}\" — " + tr("android-sp-delete-scene-text", "and everything in it."), tr("android-delete", "Delete"), { deletingScene = null }) {
        actions.run { app.repo.deleteScene(sc.id); scenes = scenes - sc; blocks = blocks.filter { it.sceneId != sc.id } }
    } }
    if (confirmDelete && s != null) Confirm(tr("android-sp-delete", "Delete screenplay"), "\"${s.title}\" — " + tr("android-cant-undo", "this can't be undone."), tr("android-delete", "Delete"), { confirmDelete = false }) {
        actions.run { app.repo.deleteWork(WorkKind.SCREENPLAY, id); nav.popBackStack() }
    }
}

private fun tr0(s: String) = s

@Composable
private fun SceneHeader(scene: Scene, writable: Boolean, isOwner: Boolean, canEdit: Boolean, saved: Map<String, String>, onChange: (String) -> Unit, onLeave: () -> Unit, onRevisions: () -> Unit, onDelete: () -> Unit) {
    var menu by remember { mutableStateOf(false) }
    val color = MaterialTheme.colorScheme.onSurface
    HorizontalDivider(Modifier.padding(top = 12.dp))
    Row(Modifier.fillMaxWidth().padding(start = 16.dp, end = 4.dp, top = 8.dp), verticalAlignment = Alignment.CenterVertically) {
        BasicTextField(
            scene.slugline, onChange, Modifier.weight(1f).onFocusChanged { if (!it.isFocused) onLeave() },
            readOnly = !writable,
            textStyle = TextStyle(color = color, fontFamily = FontFamily.Monospace, fontWeight = FontWeight.Bold, fontSize = 16.sp),
            cursorBrush = SolidColor(color),
        )
        IconButton({ menu = true }) { Icon(Icons.Filled.MoreVert, null) }
        DropdownMenu(menu, { menu = false }) {
            DropdownMenuItem({ AppText("android-story-revisions", "Compare revisions") }, { menu = false; onRevisions() }, leadingIcon = { Icon(Icons.Filled.History, null) })
            if (canEdit) DropdownMenuItem({ AppText("android-sp-delete-scene", "Delete scene") }, { menu = false; onDelete() }, leadingIcon = { Icon(Icons.Filled.Delete, null) })
        }
    }
}

@Composable
private fun BlockRow(b: ScriptBlock, writable: Boolean, branchCount: Int, takeFocus: Boolean, onFocusTaken: () -> Unit, onChange: (String) -> Unit, onFocus: () -> Unit, onLeave: () -> Unit, onBranches: () -> Unit) {
    val color = MaterialTheme.colorScheme.onSurface
    val focus = remember { androidx.compose.ui.focus.FocusRequester() }
    LaunchedEffect(takeFocus) { if (takeFocus) { runCatching { focus.requestFocus() }; onFocusTaken() } }
    val (pad, align, style) = when (b.type) {
        "character" -> Triple(PaddingSpec(0.25f, 0.25f), TextAlign.Center, TextStyle(fontWeight = FontWeight.SemiBold))
        "dialogue" -> Triple(PaddingSpec(0.12f, 0.12f), TextAlign.Start, TextStyle())
        "parenthetical" -> Triple(PaddingSpec(0.2f, 0.2f), TextAlign.Start, TextStyle(fontStyle = FontStyle.Italic))
        "transition" -> Triple(PaddingSpec(0.4f, 0f), TextAlign.End, TextStyle(fontWeight = FontWeight.SemiBold))
        "scene_heading" -> Triple(PaddingSpec(0f, 0f), TextAlign.Start, TextStyle(fontWeight = FontWeight.Bold))
        else -> Triple(PaddingSpec(0f, 0f), TextAlign.Start, TextStyle())
    }
    val upper = b.type in setOf("character", "transition", "shot", "scene_heading")
    androidx.compose.foundation.layout.BoxWithConstraints(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 3.dp)) {
        Row(Modifier.fillMaxWidth().padding(start = maxWidth * pad.start, end = maxWidth * pad.end), verticalAlignment = Alignment.Top) {
            BasicTextField(
                b.text.trimStart(), onChange,
                Modifier.weight(1f).focusRequester(focus).onFocusChanged { if (it.isFocused) onFocus() else onLeave() },
                readOnly = !writable,
                keyboardOptions = androidx.compose.foundation.text.KeyboardOptions(capitalization = if (upper) androidx.compose.ui.text.input.KeyboardCapitalization.Characters else androidx.compose.ui.text.input.KeyboardCapitalization.Sentences),
                textStyle = style.merge(TextStyle(color = color, fontFamily = FontFamily.Monospace, fontSize = 15.sp, lineHeight = 22.sp, textAlign = align)),
                cursorBrush = SolidColor(color),
            )
            if (branchCount > 0) androidx.compose.foundation.layout.Box(Modifier.clickable(onClick = onBranches).padding(4.dp)) { Pill("⑂$branchCount") }
        }
    }
}

private data class PaddingSpec(val start: Float, val end: Float)

/** Element branches (platform BlockBranches): alternatives for one element; others' edits become suggestions. */
@Composable
private fun BlockBranchesPanel(block: ScriptBlock, branches: List<BlockBranch>, canBranch: Boolean, canEditBranch: (BlockBranch) -> Boolean, onSuggest: (BlockBranch, String) -> Unit, changed: () -> Unit) {
    val app = crowdly
    val actions = rememberActions()
    var text by remember { mutableStateOf("") }
    var name by remember { mutableStateOf("") }
    var editing by remember { mutableStateOf<BlockBranch?>(null) }
    PanelTitle("android-sp-branches", "Element branches")
    Text(block.text.trim(), Modifier.padding(horizontal = 16.dp), fontFamily = FontFamily.Monospace, color = MaterialTheme.colorScheme.onSurfaceVariant)
    Column(Modifier.heightIn(max = 520.dp).verticalScroll(rememberScrollState()).padding(bottom = 24.dp)) {
        if (branches.isEmpty()) Empty(tr("android-sp-branches-none", "No branches on this element yet."))
        branches.forEach { br ->
            SoftCard {
                Column(Modifier.padding(12.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text(listOfNotNull(br.name, br.authorEmail).joinToString(" · ").ifBlank { tr("android-branch", "Branch") }, Modifier.weight(1f), fontWeight = FontWeight.SemiBold)
                        IconButton({ editing = br }) { Icon(Icons.Filled.Edit, null) }
                        if (canEditBranch(br)) IconButton({ actions.run { app.repo.deleteBlockBranch(br.id); changed() } }) { Icon(Icons.Filled.Delete, tr("android-delete", "Delete")) }
                    }
                    Text(br.text, fontFamily = FontFamily.Monospace)
                }
            }
        }
        if (canBranch) {
            OutlinedTextField(name, { name = it }, Modifier.fillMaxWidth().padding(horizontal = 16.dp), singleLine = true, label = { AppText("android-branches-name", "Branch name (optional)") })
            OutlinedTextField(text, { text = it }, Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp), minLines = 2, label = { AppText("android-sp-branch-text", "Another version of this element") })
            Button({ actions.run { app.repo.createBlockBranch(block.id, text, name.ifBlank { null }); text = ""; name = ""; changed() } }, Modifier.padding(horizontal = 16.dp), enabled = text.isNotBlank()) {
                AppText("android-branches-create", "Create branch")
            }
        }
    }
    editing?.let { br ->
        BranchEditDialog(br.name.orEmpty(), br.text, onDismiss = { editing = null }) { n, t ->
            editing = null
            if (canEditBranch(br)) actions.run { app.repo.updateBlockBranch(br.id, t, n.ifBlank { null }); changed() } else onSuggest(br, t)
        }
    }
}
