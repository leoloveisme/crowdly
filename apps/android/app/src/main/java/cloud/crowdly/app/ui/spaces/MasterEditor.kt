package cloud.crowdly.app.ui.spaces

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ContentCopy
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.DragHandle
import androidx.compose.material.icons.filled.ExpandLess
import androidx.compose.material.icons.filled.ExpandMore
import androidx.compose.material.icons.filled.FileDownload
import androidx.compose.material.icons.filled.Folder
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.LockOpen
import androidx.compose.material.icons.filled.NoteAdd
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Share
import androidx.compose.material.icons.automirrored.filled.InsertDriveFile
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import cloud.crowdly.app.crowdly
import cloud.crowdly.app.data.SpaceItem
import cloud.crowdly.app.data.WorkIo
import cloud.crowdly.app.i18n.AppText
import cloud.crowdly.app.i18n.tr
import cloud.crowdly.app.ui.LocalNav
import cloud.crowdly.app.ui.components.Empty
import cloud.crowdly.app.ui.components.ListRow
import cloud.crowdly.app.ui.components.ReorderableColumn
import cloud.crowdly.app.ui.components.Screen
import cloud.crowdly.app.ui.components.SoftCard
import cloud.crowdly.app.ui.components.errorText
import cloud.crowdly.app.ui.components.printHtml
import cloud.crowdly.app.ui.components.rememberActions
import cloud.crowdly.app.ui.components.shareFile
import cloud.crowdly.core.export.markdownToHtml
import cloud.crowdly.core.formats.MasterContainer
import cloud.crowdly.core.formats.combineMaster
import cloud.crowdly.core.formats.parseMaster
import cloud.crowdly.core.formats.serializeMaster
import cloud.crowdly.core.text.countWords
import cloud.crowdly.core.text.mdToPlain
import cloud.crowdly.core.text.safeFileName
import java.util.UUID
import kotlinx.coroutines.delay

private data class Container(val key: String, val c: MasterContainer, val live: Boolean = true, val open: Boolean = true)

/** A container label (relative to the .master file's folder) as a Space path. */
fun resolveLabel(folder: String, label: String): String =
    (if (folder.isEmpty()) label else "$folder/$label").split('/').fold(mutableListOf<String>()) { acc, p ->
        when (p) { "", "." -> Unit; ".." -> acc.removeLastOrNull(); else -> acc += p }
        acc
    }.joinToString("/")

fun relativeTo(folder: String, path: String): String {
    val a = if (folder.isEmpty()) emptyList() else folder.split('/')
    val b = path.split('/')
    var i = 0
    while (i < a.size && i < b.size - 1 && a[i] == b[i]) i++
    return (List(a.size - i) { ".." } + b.drop(i)).joinToString("/")
}

/**
 * The master document (MasterEditor.tsx, desktop master_document_window.py):
 * assemble a book from files in the Space. Live containers write edits back
 * to their file; locked ones keep a frozen copy. Reorder, collapse, clone,
 * re-pull from the file, and export the whole book. Saved as `.master`.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MasterEditorScreen(spaceId: String, itemId: String) {
    val app = crowdly
    val nav = LocalNav.current
    val context = LocalContext.current
    val actions = rememberActions()
    var name by remember { mutableStateOf("") }
    var folder by remember { mutableStateOf("") }
    var containers by remember { mutableStateOf<List<Container>?>(null) }
    var saved by remember { mutableStateOf("") }
    var error by remember { mutableStateOf<String?>(null) }
    var picking by remember { mutableStateOf(false) }
    var saveState by remember { mutableStateOf("") }
    val fileEdits = remember { mutableStateOf<Map<String, Long>>(emptyMap()) }

    LaunchedEffect(itemId) {
        try {
            val it = app.repo.item(spaceId, itemId)
            name = it.name
            folder = it.path.substringBeforeLast('/', "")
            val parsed = parseMaster(app.repo.readText(spaceId, itemId))
            saved = serializeMaster(parsed)
            containers = parsed.map { Container(UUID.randomUUID().toString(), it) }
        } catch (e: Exception) { error = errorText(e) }
    }
    // Autosave the .master file 2 s after any change.
    val text = containers?.let { serializeMaster(it.map { c -> c.c }) }
    LaunchedEffect(text) {
        if (text == null || text == saved) return@LaunchedEffect
        saveState = "Editing"
        delay(2000)
        saveState = try { app.repo.writeText(spaceId, itemId, text); saved = text; "Saved" } catch (e: Exception) { errorText(e) }
    }
    // Live containers write through to their own files (debounced per container).
    LaunchedEffect(fileEdits.value) {
        if (fileEdits.value.isEmpty()) return@LaunchedEffect
        delay(2000)
        val keys = fileEdits.value.keys
        fileEdits.value = emptyMap()
        for (k in keys) {
            val c = containers?.firstOrNull { it.key == k } ?: continue
            val label = c.c.label ?: continue
            val path = resolveLabel(folder, label)
            runCatching { app.repo.saveFileToSpace(spaceId, path.substringBeforeLast('/', ""), path.substringAfterLast('/'), c.c.content, "text/markdown") }
                .onFailure { saveState = "Couldn't update $path: ${errorText(it)}" }
        }
    }

    fun update(key: String, f: (Container) -> Container) { containers = containers?.map { if (it.key == key) f(it) else it } }
    val words = containers?.sumOf { countWords(mdToPlain(it.c.content)) } ?: 0
    val title = name.removeSuffix(".master")

    Screen(
        name.ifBlank { "…" },
        back = { nav.popBackStack() },
        subtitle = listOfNotNull("${containers?.size ?: 0} ${tr("android-master-parts", "parts")}", "$words ${tr("android-words", "words")}", saveState.ifBlank { null }).joinToString(" · "),
        actions = {
            IconButton({ picking = true }) { Icon(Icons.Filled.NoteAdd, tr("android-master-add", "Add a file")) }
            IconButton({
                val md = combineMaster(containers.orEmpty().map { it.c }, title)
                shareFile(context, WorkIo.Exported("${safeFileName(title)}.md", "text/markdown", md.toByteArray()))
            }) { Icon(Icons.Filled.Share, tr("android-export-share", "Share")) }
            IconButton({ printHtml(context, markdownToHtml(combineMaster(containers.orEmpty().map { it.c }, title), title, app.api::mediaUrl), title) }) {
                Icon(Icons.Filled.FileDownload, tr("android-export-pdf", "Print / save PDF"))
            }
        },
    ) { pad ->
        val list = containers
        Column(Modifier.padding(pad).fillMaxSize().imePadding().verticalScroll(rememberScrollState())) {
            if (list == null) { Empty(error ?: "…"); return@Column }
            AppText("android-master-hint", "Each part shows a file from this Space. Unlocked parts write your edits back to their file.", Modifier.padding(16.dp), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            if (list.isEmpty()) Empty(tr("android-master-empty", "No parts yet — add files from the Space."))
            ReorderableColumn(list, key = { it.key }, onMove = { containers = it }) { c, handle ->
                SoftCard {
                    Column(Modifier.padding(8.dp)) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Icon(Icons.Filled.DragHandle, tr("android-drag", "Drag to reorder"), handle.padding(8.dp))
                            OutlinedTextField(
                                c.c.title, { t -> update(c.key) { it.copy(c = it.c.copy(title = t, titleEditedAt = System.currentTimeMillis() / 1000.0)) } },
                                Modifier.weight(1f), singleLine = true, placeholder = { Text(tr("android-master-part-title", "Part title")) },
                            )
                            IconButton({ update(c.key) { it.copy(open = !it.open) } }) { Icon(if (c.open) Icons.Filled.ExpandLess else Icons.Filled.ExpandMore, null) }
                        }
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Text(c.c.label ?: tr("android-master-no-file", "(no file)"), Modifier.weight(1f).padding(start = 8.dp), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            if (c.c.label != null) IconButton({ update(c.key) { it.copy(live = !it.live) } }) {
                                Icon(if (c.live) Icons.Filled.LockOpen else Icons.Filled.Lock, if (c.live) tr("android-master-live", "Edits go to the file") else tr("android-master-frozen", "Frozen copy"))
                            }
                            if (c.c.label != null) IconButton({
                                actions.run {
                                    val path = resolveLabel(folder, c.c.label!!)
                                    val item = app.repo.items(spaceId, path.substringBeforeLast('/', "")).second.firstOrNull { it.name == path.substringAfterLast('/') }
                                        ?: throw IllegalStateException("$path wasn't found")
                                    val content = app.repo.readText(spaceId, item.id)
                                    update(c.key) { it.copy(c = it.c.copy(content = content)) }
                                }
                            }) { Icon(Icons.Filled.Refresh, tr("android-master-pull", "Reload from the file")) }
                            IconButton({ containers = list.flatMap { if (it.key == c.key) listOf(it, it.copy(key = UUID.randomUUID().toString(), live = false)) else listOf(it) } }) { Icon(Icons.Filled.ContentCopy, tr("android-master-clone", "Duplicate")) }
                            IconButton({ containers = list.filter { it.key != c.key } }) { Icon(Icons.Filled.Delete, tr("android-delete", "Delete")) }
                        }
                        if (c.open) OutlinedTextField(
                            c.c.content,
                            { t ->
                                update(c.key) { it.copy(c = it.c.copy(content = t)) }
                                if (c.live && c.c.label != null) fileEdits.value = fileEdits.value + (c.key to System.nanoTime())
                            },
                            Modifier.fillMaxWidth().heightIn(min = 120.dp),
                        )
                    }
                }
            }
            Spacer(Modifier.padding(32.dp))
        }
    }
    if (picking) ModalBottomSheet({ picking = false }) {
        FilePicker(spaceId) { path, item ->
            picking = false
            actions.run {
                val t = app.repo.readText(spaceId, item.id)
                val heading = Regex("(?m)^#{1,6}\\s+(.+)$").find(t)?.groupValues?.get(1) ?: path.substringAfterLast('/').substringBeforeLast('.')
                containers = containers.orEmpty() + Container(UUID.randomUUID().toString(), MasterContainer(relativeTo(folder, path), heading, null, t))
            }
        }
    }
}

/** Browse the Space for a text file to include. */
@Composable
private fun FilePicker(spaceId: String, onPick: (String, SpaceItem) -> Unit) {
    val app = crowdly
    var path by remember { mutableStateOf("") }
    var items by remember { mutableStateOf<List<SpaceItem>>(emptyList()) }
    LaunchedEffect(path) { items = runCatching { app.repo.items(spaceId, path).second.sortedWith(compareBy({ !it.isFolder }, { it.name.lowercase() })) }.getOrDefault(emptyList()) }
    Column(Modifier.padding(bottom = 24.dp)) {
        Row(Modifier.padding(horizontal = 16.dp), verticalAlignment = Alignment.CenterVertically) {
            Text("/$path", Modifier.weight(1f), fontWeight = FontWeight.SemiBold)
            if (path.isNotEmpty()) TextButton({ path = path.substringBeforeLast('/', "") }) { AppText("android-master-up", "Up") }
        }
        Column(Modifier.heightIn(max = 520.dp).verticalScroll(rememberScrollState())) {
            items.forEach { it ->
                val full = if (path.isEmpty()) it.name else "$path/${it.name}"
                ListRow(
                    it.name,
                    leading = { Icon(if (it.isFolder) Icons.Filled.Folder else Icons.AutoMirrored.Filled.InsertDriveFile, null) },
                    onClick = if (it.isFolder) ({ path = full }) else if (it.isText) ({ onPick(full, it) }) else null,
                )
            }
        }
    }
}
