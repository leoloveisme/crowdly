package cloud.crowdly.app.ui.spaces

import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.InsertDriveFile
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.AudioFile
import androidx.compose.material.icons.filled.CreateNewFolder
import androidx.compose.material.icons.filled.Description
import androidx.compose.material.icons.filled.Folder
import androidx.compose.material.icons.filled.Image
import androidx.compose.material.icons.filled.Link
import androidx.compose.material.icons.filled.MoreVert
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Sync
import androidx.compose.material.icons.filled.Upload
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import cloud.crowdly.app.crowdly
import cloud.crowdly.app.data.Crumb
import cloud.crowdly.app.data.Space
import cloud.crowdly.app.data.SpaceItem
import cloud.crowdly.app.data.WorkIo
import cloud.crowdly.app.data.WorkSummary
import cloud.crowdly.app.i18n.AppText
import cloud.crowdly.app.i18n.tr
import cloud.crowdly.app.ui.LocalNav
import cloud.crowdly.app.ui.Routes
import cloud.crowdly.app.ui.components.AudioRow
import cloud.crowdly.app.ui.components.Confirm
import cloud.crowdly.app.ui.components.Empty
import cloud.crowdly.app.ui.components.ListRow
import cloud.crowdly.app.ui.components.Loaded
import cloud.crowdly.app.ui.components.Pill
import cloud.crowdly.app.ui.components.Screen
import cloud.crowdly.app.ui.components.SectionTitle
import cloud.crowdly.app.ui.components.TextPrompt
import cloud.crowdly.app.ui.components.readPicked
import cloud.crowdly.app.ui.components.rememberActions
import cloud.crowdly.app.ui.components.rememberLoader
import cloud.crowdly.app.ui.components.shareFile
import cloud.crowdly.app.ui.create.kindIcon
import cloud.crowdly.app.ui.more.openInBrowser
import coil3.compose.AsyncImage

/** New-file templates (SpacePage.tsx NEW_FILE_TEMPLATES). */
private val TEMPLATES = mapOf(
    "md" to "# Untitled\n\n",
    "story" to "[story_title center]Story title[/story_title]\n\n[chapter_title]Chapter 1[/chapter_title]\n\n[paragraph][/paragraph]\n",
    "screenplay" to "[screenplay_title center]Untitled[/screenplay_title]\n\n[scene_slugline]INT. LOCATION - DAY[/scene_slugline]\n\n[action][/action]\n",
    "comic" to "[comic_title center direction=ltr]Untitled[/comic_title]\n\n[issue]Issue 1[/issue]\n",
    "master" to "",
    "txt" to "",
)

private data class Listing(val space: Space, val path: String, val items: List<SpaceItem>, val crumbs: List<Crumb>, val works: List<WorkSummary>)

fun itemIcon(it: SpaceItem): ImageVector = when {
    it.isFolder -> Icons.Filled.Folder
    it.linkedType != null -> Icons.Filled.Link
    it.isImage -> Icons.Filled.Image
    it.isAudio -> Icons.Filled.AudioFile
    it.isText -> Icons.Filled.Description
    else -> Icons.AutoMirrored.Filled.InsertDriveFile
}

/**
 * A Space's file tree (SpacePage.tsx): folders, files, upload, rename, move,
 * delete, open text files in the editor and linked files in their work,
 * preview images and audio, the Space's works and its GitHub/Drive sync.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SpaceScreen(spaceId: String, path: String) {
    val app = crowdly
    val nav = LocalNav.current
    val context = LocalContext.current
    val actions = rememberActions()
    val loader = rememberLoader(spaceId, path) {
        val space = app.repo.space(spaceId)
        val (p, items, crumbs) = app.repo.items(spaceId, path)
        Listing(space, p, items.sortedWith(compareBy({ !it.isFolder }, { it.name.lowercase() })), crumbs, if (path.isEmpty()) app.repo.contentItems(spaceId) else emptyList())
    }
    var newFolder by remember { mutableStateOf(false) }
    var newFile by remember { mutableStateOf<String?>(null) }
    var newMenu by remember { mutableStateOf(false) }
    var spaceMenu by remember { mutableStateOf(false) }
    var target by remember { mutableStateOf<SpaceItem?>(null) }
    var renaming by remember { mutableStateOf<SpaceItem?>(null) }
    var moving by remember { mutableStateOf<SpaceItem?>(null) }
    var deleting by remember { mutableStateOf<SpaceItem?>(null) }
    var preview by remember { mutableStateOf<SpaceItem?>(null) }
    var sync by remember { mutableStateOf(false) }
    var renameSpace by remember { mutableStateOf(false) }
    var deleteSpace by remember { mutableStateOf(false) }

    val uploader = rememberLauncherForActivityResult(ActivityResultContracts.OpenMultipleDocuments()) { uris ->
        if (uris.isNotEmpty()) actions.run(tr0("${uris.size} file(s) uploaded")) {
            for (u in uris) {
                val f = readPicked(context, u, "file")
                val it = app.repo.createFile(spaceId, path, f.name, f.mime, f.bytes.size.toLong())
                app.repo.uploadContent(spaceId, it.id, f.name, f.mime, f.bytes)
            }
            loader.reload()
        }
    }

    fun open(it: SpaceItem) {
        when {
            it.isFolder -> nav.navigate(Routes.space(spaceId, it.path))
            it.linkedType == "chapter" && it.linkedParentId != null -> nav.navigate(Routes.story(it.linkedParentId))
            it.linkedType == "scene" && it.linkedParentId != null -> nav.navigate(Routes.screenplay(it.linkedParentId))
            it.linkedType == "page" && it.linkedParentId != null -> nav.navigate(Routes.comic(it.linkedParentId))
            it.name.endsWith(".master", ignoreCase = true) -> nav.navigate(Routes.master(spaceId, it.id))
            it.isText -> nav.navigate(Routes.file(spaceId, it.id))
            else -> preview = it
        }
    }

    val listing = loader.value
    val isOwner = listing?.space?.userId == app.session.userId
    Screen(
        listing?.space?.name ?: "…",
        back = { nav.popBackStack() },
        subtitle = listing?.path?.ifBlank { null },
        actions = {
            IconButton({ loader.reload() }) { Icon(Icons.Filled.Refresh, tr("android-refresh", "Refresh")) }
            IconButton({ uploader.launch(arrayOf("*/*")) }) { Icon(Icons.Filled.Upload, tr("android-space-upload", "Upload")) }
            IconButton({ newMenu = true }) { Icon(Icons.Filled.Add, tr("android-space-new", "New")) }
            DropdownMenu(newMenu, { newMenu = false }) {
                DropdownMenuItem({ AppText("android-space-new-folder", "New folder") }, { newMenu = false; newFolder = true }, leadingIcon = { Icon(Icons.Filled.CreateNewFolder, null) })
                TEMPLATES.keys.forEach { ext -> DropdownMenuItem({ Text("${tr("android-space-new-file", "New file")} .$ext") }, { newMenu = false; newFile = ext }) }
            }
            IconButton({ spaceMenu = true }) { Icon(Icons.Filled.MoreVert, tr("android-more", "More")) }
            DropdownMenu(spaceMenu, { spaceMenu = false }) {
                if (isOwner) DropdownMenuItem({ AppText("android-space-sync", "GitHub and Google Drive") }, { spaceMenu = false; sync = true }, leadingIcon = { Icon(Icons.Filled.Sync, null) })
                DropdownMenuItem({ AppText("android-space-platform", "On the platform") }, { spaceMenu = false; openInBrowser(context, "${app.prefs.platformUrl}/creative_space/$spaceId") })
                DropdownMenuItem({ AppText("android-space-clone", "Copy this Space") }, { spaceMenu = false; actions.run { nav.navigate(Routes.space(app.repo.cloneSpace(spaceId).id)) } })
                if (isOwner) DropdownMenuItem({ AppText("android-space-rename", "Rename Space") }, { spaceMenu = false; renameSpace = true })
                if (isOwner) DropdownMenuItem({ AppText("android-space-delete", "Delete Space") }, { spaceMenu = false; deleteSpace = true })
            }
        },
    ) { pad ->
        Loaded(loader, Modifier.padding(pad)) { l ->
            LazyColumn(Modifier.padding(pad).fillMaxSize()) {
                item {
                    Row(Modifier.horizontalScroll(rememberScrollState()).padding(horizontal = 12.dp), horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                        TextButton({ nav.navigate(Routes.space(spaceId)) }) { Text(l.space.name) }
                        l.crumbs.forEach { c -> Text("/", Modifier.padding(top = 12.dp)); TextButton({ nav.navigate(Routes.space(spaceId, c.path)) }) { Text(c.name) } }
                    }
                }
                if (isOwner && l.path.isEmpty()) item {
                    Row(Modifier.padding(horizontal = 16.dp), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        listOf("private" to tr("android-space-only-me", "Only me"), "selected" to tr("android-space-selected", "Selected people"), "public" to tr("android-space-everyone", "Everyone")).forEach { (v, label) ->
                            FilterChip(l.space.visibility.orEmpty().ifEmpty { "private" } == v, { actions.run { app.repo.updateSpace(spaceId, visibility = v); loader.reload() } }, { Text(label) })
                        }
                    }
                }
                if (l.items.isEmpty()) item { Empty(tr("android-space-empty", "This folder is empty. Upload files or make new ones.")) }
                items(l.items, key = { it.id }) { it ->
                    ListRow(
                        it.name,
                        subtitle = listOfNotNull(it.linkedTitle, it.size?.let { s -> if (s > 0) "${s / 1024} KB" else null }, it.updatedAt?.take(10)).joinToString(" · ").ifBlank { null },
                        leading = { Icon(itemIcon(it), null) },
                        trailing = { IconButton({ target = it }) { Icon(Icons.Filled.MoreVert, null) } },
                        onClick = { open(it) },
                    )
                }
                if (l.works.isNotEmpty()) {
                    item { SectionTitle(tr("android-space-works", "Stories in this Space")) }
                    items(l.works, key = { it.kind.key + it.id }) { w -> ListRow(w.title, leading = { Icon(kindIcon(w.kind), null) }, onClick = { nav.navigate(Routes.work(w.kind.key, w.id)) }) }
                }
                item { Spacer(Modifier.padding(32.dp)) }
            }
        }
    }

    target?.let { it ->
        ModalBottomSheet({ target = null }) {
            Column(Modifier.padding(bottom = 24.dp)) {
                Text(it.name, Modifier.padding(16.dp), style = MaterialTheme.typography.titleMedium)
                ListRow(tr("android-space-open", "Open"), onClick = { target = null; open(it) })
                if (!it.isFolder) ListRow(tr("android-space-download", "Share or save a copy"), onClick = {
                    target = null
                    actions.run { shareFile(context, WorkIo.Exported(it.name, it.mime ?: WorkIo.mimeOf(it.name.substringAfterLast('.')), app.repo.bytes(app.repo.contentPath(spaceId, it.id)))) }
                })
                ListRow(tr("android-space-rename", "Rename"), onClick = { target = null; renaming = it })
                ListRow(tr("android-space-move", "Move to…"), onClick = { target = null; moving = it })
                ListRow(tr("android-delete", "Delete"), onClick = { target = null; deleting = it })
            }
        }
    }
    preview?.let { it ->
        AlertDialog(
            onDismissRequest = { preview = null },
            title = { Text(it.name) },
            text = {
                when {
                    it.isImage -> AsyncImage(app.api.url(app.repo.contentPath(spaceId, it.id)), it.name, Modifier.fillMaxWidth(), contentScale = ContentScale.FillWidth)
                    it.isAudio -> AudioRow(app.repo.contentPath(spaceId, it.id))
                    else -> AppText("android-space-no-preview", "This file can't be shown here. Share it to open it in another app.")
                }
            },
            confirmButton = { TextButton({
                preview = null
                actions.run { shareFile(context, WorkIo.Exported(it.name, it.mime ?: "application/octet-stream", app.repo.bytes(app.repo.contentPath(spaceId, it.id)))) }
            }) { AppText("android-space-download", "Share or save a copy") } },
            dismissButton = { TextButton({ preview = null }) { AppText("android-close", "Close") } },
        )
    }
    if (newFolder) TextPrompt(tr("android-space-new-folder", "New folder"), label = tr("android-name", "Name"), confirm = tr("android-create", "Create"), onDismiss = { newFolder = false }) { name ->
        newFolder = false
        actions.run { app.repo.createFolder(spaceId, path, name.trim()); loader.reload() }
    }
    newFile?.let { ext ->
        TextPrompt(tr("android-space-new-file", "New file"), "untitled.$ext", confirm = tr("android-create", "Create"), onDismiss = { newFile = null }) { name ->
            newFile = null
            actions.run {
                val it = app.repo.createFile(spaceId, path, name.trim(), if (ext == "md") "text/markdown" else "text/plain", 0)
                app.repo.writeText(spaceId, it.id, TEMPLATES[ext].orEmpty())
                open(it)
            }
        }
    }
    renaming?.let { it -> TextPrompt(tr("android-space-rename", "Rename"), it.name, confirm = tr("android-save", "Save"), onDismiss = { renaming = null }) { n -> renaming = null; actions.run { app.repo.renameItem(it.id, n.trim()); loader.reload() } } }
    moving?.let { it -> TextPrompt(tr("android-space-move-to", "Move to folder (path inside the Space, empty = top level)"), path, confirm = tr("android-space-move", "Move"), onDismiss = { moving = null }) { to -> moving = null; actions.run { app.repo.moveItem(it.id, to.trim().trim('/')); loader.reload() } } }
    deleting?.let { it -> Confirm(tr("android-delete", "Delete"), "\"${it.name}\"?", tr("android-delete", "Delete"), { deleting = null }) { actions.run { app.repo.deleteItem(it.id); loader.reload() } } }
    if (sync) ModalBottomSheet({ sync = false }) { SpaceSyncPanel(spaceId) }
    if (renameSpace && listing != null) TextPrompt(tr("android-space-rename", "Rename Space"), listing.space.name, confirm = tr("android-save", "Save"), onDismiss = { renameSpace = false }) { n -> renameSpace = false; actions.run { app.repo.renameSpace(spaceId, n.trim()); loader.reload() } }
    if (deleteSpace && listing != null) Confirm(tr("android-space-delete", "Delete Space"), "\"${listing.space.name}\" " + tr("android-space-delete-text", "and every file in it?"), tr("android-delete", "Delete"), { deleteSpace = false }) {
        actions.run { app.repo.deleteSpace(spaceId); nav.popBackStack() }
    }
}

private fun tr0(s: String) = s
