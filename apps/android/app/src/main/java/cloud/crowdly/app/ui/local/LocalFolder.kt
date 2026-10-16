package cloud.crowdly.app.ui.local

import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.OpenInNew
import androidx.compose.material.icons.filled.CreateNewFolder
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.Folder
import androidx.compose.material.icons.filled.FolderOpen
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Sync
import androidx.compose.material.icons.filled.Visibility
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExtendedFloatingActionButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import cloud.crowdly.app.crowdly
import cloud.crowdly.app.data.Space
import cloud.crowdly.app.i18n.AppText
import cloud.crowdly.app.i18n.tr
import cloud.crowdly.app.sync.FolderReport
import cloud.crowdly.app.sync.LocalEntry
import cloud.crowdly.app.sync.LocalFolder
import cloud.crowdly.app.ui.LocalNav
import cloud.crowdly.app.ui.Routes
import cloud.crowdly.app.ui.components.Confirm
import cloud.crowdly.app.ui.components.Empty
import cloud.crowdly.app.ui.components.ListRow
import cloud.crowdly.app.ui.components.MarkdownView
import cloud.crowdly.app.ui.components.Screen
import cloud.crowdly.app.ui.components.SectionTitle
import cloud.crowdly.app.ui.components.errorText
import cloud.crowdly.app.ui.components.rememberActions
import cloud.crowdly.app.ui.spaces.ComicPreview
import cloud.crowdly.app.ui.spaces.ScreenplayPreview
import cloud.crowdly.app.ui.spaces.StoryPreview
import cloud.crowdly.app.ui.spaces.itemIcon
import cloud.crowdly.core.formats.parseComic
import cloud.crowdly.core.formats.parseScreenplay
import cloud.crowdly.core.formats.parseStory
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

/** Remembers which folder a file was opened from, so the file editor can resolve relative paths. */
object LocalContextHolder {
    var folder: LocalFolder? = null
    var path: String? = null
}

/**
 * Files on this phone (LocalFolderPage.tsx, desktop local Spaces): open a
 * folder, browse it, edit text files in place, and sync it with a Crowdly
 * Space both ways. Crowdly-format files also sync with their work.
 */
@Composable
fun LocalFolderScreen() {
    val app = crowdly
    val nav = LocalNav.current
    val actions = rememberActions()
    var folders by remember { mutableStateOf(app.files.folders()) }
    // Saveable, so coming back from a file shows the same folder.
    var openUri by androidx.compose.runtime.saveable.rememberSaveable { mutableStateOf<String?>(null) }
    var path by androidx.compose.runtime.saveable.rememberSaveable { mutableStateOf("") }
    var entries by remember { mutableStateOf<List<LocalEntry>?>(null) }
    var tick by remember { mutableIntStateOf(0) }
    var linking by remember { mutableStateOf(false) }
    var spaces by remember { mutableStateOf<List<Space>>(emptyList()) }
    var progress by remember { mutableStateOf<String?>(null) }
    var report by remember { mutableStateOf<FolderReport?>(null) }
    var forgetting by remember { mutableStateOf<LocalFolder?>(null) }

    val picker = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocumentTree()) { uri: Uri? ->
        if (uri != null) actions.run { val f = app.files.addFolder(uri); folders = app.files.folders(); openUri = f.uri; path = "" }
    }
    LaunchedEffect(openUri, tick) {
        val f = folders.firstOrNull { it.uri == openUri } ?: return@LaunchedEffect
        entries = null
        entries = try { app.files.listTree(f.uri) } catch (e: Exception) { progress = errorText(e); emptyList() }
    }

    val f = folders.firstOrNull { it.uri == openUri }
    Screen(
        f?.name ?: tr("android-local-title", "Files on this phone"),
        back = { if (f != null && path.isNotEmpty()) path = path.substringBeforeLast('/', "") else if (f != null) openUri = null else nav.popBackStack() },
        subtitle = f?.let { listOfNotNull(path.ifBlank { null }, it.spaceId?.let { tr("android-local-linked", "synced with a Space") }, it.lastSyncedAt?.take(16)?.replace('T', ' ')).joinToString(" · ") },
        actions = {
            if (f != null) {
                IconButton({ tick++ }) { Icon(Icons.Filled.Refresh, tr("android-refresh", "Refresh")) }
                IconButton({
                    if (f.spaceId == null) { linking = true; actions.run { spaces = app.repo.mySpaces() } }
                    else actions.run {
                        report = app.syncer.syncFolder(f, f.spaceId) { progress = it }
                        progress = null
                        folders = app.files.folders(); Unit; tick++
                    }
                }) { Icon(Icons.Filled.Sync, tr("android-local-sync", "Sync now")) }
            }
        },
        floating = { if (f == null) ExtendedFloatingActionButton(onClick = { picker.launch(null) }, icon = { Icon(Icons.Filled.FolderOpen, null) }, text = { AppText("android-local-open", "Open a folder") }) },
    ) { pad ->
        Column(Modifier.padding(pad).fillMaxSize()) {
            progress?.let { Text(it, Modifier.padding(16.dp)); LinearProgressIndicator(Modifier.fillMaxWidth()) }
            if (f == null) {
                AppText("android-local-desc", "Work on a folder on this phone like the desktop app does with a local Space, and sync it with a Crowdly Space. .story, .screenplay and .comic files also sync with their Crowdly work.", Modifier.padding(16.dp), color = MaterialTheme.colorScheme.onSurfaceVariant)
                if (folders.isEmpty()) Empty(tr("android-local-none", "No folders yet."))
                LazyColumn {
                    items(folders, key = { it.uri }) { lf ->
                        ListRow(lf.name, subtitle = lf.lastSyncedAt?.let { tr("android-sync-last", "last synced") + " " + it.take(16).replace('T', ' ') },
                            leading = { Icon(Icons.Filled.Folder, null) },
                            trailing = { TextButton({ forgetting = lf }) { AppText("android-local-forget", "Forget") } },
                            onClick = { openUri = lf.uri; path = "" })
                    }
                }
                return@Column
            }
            val list = entries
            if (list == null) { Empty("…"); return@Column }
            val here = list.filter { it.path.substringBeforeLast('/', "") == path }.sortedWith(compareBy({ !it.isDir }, { it.name.lowercase() }))
            if (here.isEmpty()) Empty(tr("android-local-empty", "This folder is empty."))
            LazyColumn {
                items(here, key = { it.path }) { e ->
                    ListRow(e.name, leading = { Icon(if (e.isDir) Icons.Filled.Folder else Icons.Filled.Edit, null) }, onClick = {
                        if (e.isDir) path = e.path
                        else { LocalContextHolder.folder = f; LocalContextHolder.path = e.path; nav.navigate(Routes.localFile(e.uri.toString())) }
                    })
                }
            }
        }
    }
    if (linking && f != null) AlertDialog(
        onDismissRequest = { linking = false },
        title = { AppText("android-local-link", "Sync this folder with a Space") },
        text = {
            Column(Modifier.verticalScroll(rememberScrollState())) {
                spaces.forEach { s -> ListRow(s.name, onClick = {
                    linking = false
                    val linked = f.copy(spaceId = s.id)
                    app.files.update(linked); openUri = linked.uri; folders = app.files.folders()
                    actions.run { report = app.syncer.syncFolder(linked, s.id) { progress = it }; progress = null; tick++ }
                }) }
                TextButton({
                    linking = false
                    actions.run {
                        val s = app.repo.createSpace(f.name)
                        val linked = f.copy(spaceId = s.id)
                        app.files.update(linked); openUri = linked.uri; folders = app.files.folders()
                        report = app.syncer.syncFolder(linked, s.id) { progress = it }; progress = null; tick++
                    }
                }) { AppText("android-local-new-space", "Make a new Space for it") }
            }
        },
        confirmButton = {},
        dismissButton = { TextButton({ linking = false }) { AppText("android-cancel", "Cancel") } },
    )
    report?.let { r ->
        AlertDialog(
            onDismissRequest = { report = null },
            title = { AppText("android-local-synced", "Synced") },
            text = {
                Column {
                    Text("↑ ${r.uploaded.size}   ↓ ${r.downloaded.size}   ⇄ ${r.conflicts.size}")
                    r.conflicts.forEach { Text("${tr("android-local-kept-both", "Kept both versions of")} $it", style = MaterialTheme.typography.bodySmall) }
                    r.errors.forEach { Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall) }
                }
            },
            confirmButton = { TextButton({ report = null }) { AppText("android-ok", "OK") } },
        )
    }
    forgetting?.let { lf -> Confirm(tr("android-local-forget", "Forget"), tr("android-local-forget-text", "The app stops showing this folder. Nothing on the phone or in the Space is deleted."), tr("android-local-forget", "Forget"), { forgetting = null }) {
        app.files.forget(lf); folders = app.files.folders()
    } }
}

/**
 * One file on the phone, opened from a folder or from another app: edit it,
 * preview Crowdly formats, and "Sync with Crowdly" for .story/.screenplay/.comic.
 */
@Composable
fun LocalFileScreen(uri: String) {
    val app = crowdly
    val nav = LocalNav.current
    val actions = rememberActions()
    val u = remember(uri) { Uri.parse(uri) }
    val folder = remember(uri) { LocalContextHolder.folder }
    val path = remember(uri) { LocalContextHolder.path }
    var text by remember { mutableStateOf<String?>(null) }
    var error by remember { mutableStateOf<String?>(null) }
    var stamp by remember { mutableLongStateOf(0L) }
    var saveState by remember { mutableStateOf("") }
    var preview by remember { mutableStateOf(false) }
    var syncing by remember { mutableStateOf(false) }
    var linked by remember { mutableStateOf(app.syncer.linkedWork(u)) }
    val name = remember(uri) { app.files.name(u) }
    val ext = name.substringAfterLast('.', "").lowercase()
    val crowdlyFormat = ext in setOf("story", "screenplay", "comic")

    LaunchedEffect(uri) { try { text = app.files.readText(u) } catch (e: Exception) { error = errorText(e) } }
    suspend fun save() {
        val t = text ?: return
        saveState = try { app.files.writeText(u, t); "Saved" } catch (e: Exception) { errorText(e) }
    }
    LaunchedEffect(stamp) { if (stamp > 0) { delay(1500); save(); stamp = 0 } }
    DisposableEffect(Unit) { onDispose { if (stamp > 0) app.scope.launch { save() } } }

    Screen(
        name,
        back = { nav.popBackStack() },
        subtitle = listOfNotNull(path?.substringBeforeLast('/', "")?.ifBlank { null }, saveState.ifBlank { null }, linked?.let { tr("android-local-linked-work", "linked to Crowdly") }).joinToString(" · "),
        actions = {
            IconButton({ preview = !preview }) { Icon(if (preview) Icons.Filled.Edit else Icons.Filled.Visibility, tr("android-story-preview", "Preview")) }
            if (crowdlyFormat) IconButton({
                val t = text ?: return@IconButton
                syncing = true
                actions.run {
                    try {
                        if (stamp > 0) { save(); stamp = 0 }
                        val r = app.syncer.syncWorkFile(u, t, folder, path)
                        if (r.text != t) { text = r.text; app.files.writeText(u, r.text) }
                        linked = r.kind to r.id
                        saveState = r.message
                    } finally { syncing = false }
                }
            }, enabled = !syncing) { Icon(Icons.Filled.Sync, tr("android-local-sync-work", "Sync with Crowdly")) }
            linked?.let { (k, id) -> IconButton({ nav.navigate(Routes.work(k.key, id)) }) { Icon(Icons.AutoMirrored.Filled.OpenInNew, tr("android-local-open-work", "Open on Crowdly")) } }
        },
    ) { pad ->
        val t = text
        Column(Modifier.padding(pad).fillMaxSize().imePadding()) {
            if (syncing) LinearProgressIndicator(Modifier.fillMaxWidth())
            if (t == null) { Empty(error ?: "…"); return@Column }
            if (preview) Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp)) {
                when (ext) {
                    "story" -> StoryPreview(parseStory(t))
                    "screenplay" -> ScreenplayPreview(parseScreenplay(t))
                    "comic" -> ComicPreview(parseComic(t), null, "")
                    else -> MarkdownView(t)
                }
            } else {
                val color = MaterialTheme.colorScheme.onSurface
                BasicTextField(
                    t, { v -> text = v; stamp = System.nanoTime(); saveState = "Editing" },
                    Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(12.dp),
                    textStyle = TextStyle(color = color, fontFamily = if (crowdlyFormat) FontFamily.Monospace else FontFamily.Serif, fontSize = if (crowdlyFormat) 14.sp else 17.sp, lineHeight = if (crowdlyFormat) 20.sp else 26.sp),
                    cursorBrush = SolidColor(color),
                )
            }
        }
    }
}
