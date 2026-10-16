package cloud.crowdly.app.ui.create

import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.selection.selectable
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.MenuBook
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.FileOpen
import androidx.compose.material.icons.filled.Folder
import androidx.compose.material.icons.filled.Image
import androidx.compose.material.icons.filled.Link
import androidx.compose.material.icons.filled.Movie
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExtendedFloatingActionButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import cloud.crowdly.app.crowdly
import cloud.crowdly.app.data.Space
import cloud.crowdly.app.data.WorkKind
import cloud.crowdly.app.data.WorkSummary
import cloud.crowdly.app.i18n.AppText
import cloud.crowdly.app.i18n.tr
import cloud.crowdly.app.ui.LocalNav
import cloud.crowdly.app.ui.Routes
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
import cloud.crowdly.core.formats.parseComic
import cloud.crowdly.core.formats.parseScreenplay
import cloud.crowdly.core.formats.parseStory
import cloud.crowdly.core.formats.screenplayFromMarkdown
import cloud.crowdly.core.formats.storyFromMarkdown

private data class Home(val stories: List<WorkSummary>, val screenplays: List<WorkSummary>, val comics: List<WorkSummary>, val spaces: List<Space>)

fun kindIcon(kind: WorkKind): ImageVector = when (kind) {
    WorkKind.STORY -> Icons.AutoMirrored.Filled.MenuBook
    WorkKind.SCREENPLAY -> Icons.Filled.Movie
    WorkKind.COMIC -> Icons.Filled.Image
}

/** Accepts an id or any Crowdly URL (/story/:id, /screenplay/:id, /comic/:id), like docs.ts parseWorkRef. */
fun parseWorkRef(input: String): Pair<WorkKind?, String>? {
    val s = input.trim()
    if (s.isEmpty()) return null
    Regex("/(story|screenplay|comic)/([0-9a-fA-F-]{8,})").find(s)?.let { return WorkKind.of(it.groupValues[1]) to it.groupValues[2] }
    if (Regex("^[0-9a-fA-F-]{8,}$").matches(s)) return null to s
    return null
}

/** Creation start page (apps/web CreationHome.tsx): the user's works and Spaces, New, Open by link, Import. */
@Composable
fun CreateHomeScreen() {
    val app = crowdly
    val nav = LocalNav.current
    val context = LocalContext.current
    val actions = rememberActions()
    val loader = rememberLoader { Home(app.repo.myStories(), app.repo.myScreenplays(), app.repo.myComics(), app.repo.mySpaces()) }
    var newKind by remember { mutableStateOf<WorkKind?>(null) }
    var newSpace by remember { mutableStateOf(false) }
    var openLink by remember { mutableStateOf(false) }
    var menu by remember { mutableStateOf(false) }
    val notFound = tr("android-home-not-found", "No story, screenplay or comic with that id.")

    val importer = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
        if (uri != null) actions.run {
            val f = readPicked(context, uri, "file")
            val text = f.bytes.toString(Charsets.UTF_8)
            val title = f.name.substringBeforeLast('.')
            val route = when (f.name.substringAfterLast('.').lowercase()) {
                "story" -> Routes.story(app.io.createStoryFromDoc(parseStory(text), null))
                "screenplay" -> Routes.screenplay(app.io.createScreenplayFromDoc(parseScreenplay(text)))
                "comic" -> Routes.comic(app.io.createComicFromDoc(parseComic(text)) { null }.first)
                "fountain" -> Routes.screenplay(app.io.createScreenplayFromDoc(screenplayFromMarkdown(text, title)))
                else -> Routes.story(app.io.createStoryFromDoc(storyFromMarkdown(text, title), null))
            }
            nav.navigate(route)
        }
    }

    Screen(
        tr("android-home-title", "Create"),
        actions = {
            IconButton({ loader.reload() }) { Icon(Icons.Filled.Refresh, tr("android-refresh", "Refresh")) }
            IconButton({ menu = true }) { Icon(Icons.Filled.FileOpen, tr("android-home-open", "Open")) }
            DropdownMenu(menu, { menu = false }) {
                DropdownMenuItem({ AppText("android-home-open-link", "Open by link or id") }, { menu = false; openLink = true }, leadingIcon = { Icon(Icons.Filled.Link, null) })
                DropdownMenuItem({ AppText("android-home-import", "Import a file") }, { menu = false; importer.launch(arrayOf("*/*")) }, leadingIcon = { Icon(Icons.Filled.FileOpen, null) })
                DropdownMenuItem({ AppText("android-home-new-space", "New Space") }, { menu = false; newSpace = true }, leadingIcon = { Icon(Icons.Filled.Folder, null) })
            }
        },
        floating = { ExtendedFloatingActionButton(onClick = { newKind = WorkKind.STORY }, icon = { Icon(Icons.Filled.Add, null) }, text = { AppText("android-home-new", "New") }) },
    ) { pad ->
        val labels = listOf(
            tr("android-home-stories", "Stories"), tr("android-home-stories-empty", "No stories yet."),
            tr("android-home-screenplays", "Screenplays"), tr("android-home-screenplays-empty", "No screenplays yet."),
            tr("android-home-comics", "Comics & manga"), tr("android-home-comics-empty", "No comics yet."),
            tr("android-home-spaces", "Spaces"), tr("android-home-new-space", "New Space"), tr("android-home-spaces-empty", "No Spaces yet."), tr("android-home-shared", "shared"),
        )
        Loaded(loader, Modifier.padding(pad)) { home ->
            LazyColumn(Modifier.padding(pad).fillMaxSize()) {
                section(labels[0], home.stories, labels[1], { newKind = WorkKind.STORY }) { nav.navigate(Routes.story(it.id)) }
                section(labels[2], home.screenplays, labels[3], { newKind = WorkKind.SCREENPLAY }) { nav.navigate(Routes.screenplay(it.id)) }
                section(labels[4], home.comics, labels[5], { newKind = WorkKind.COMIC }) { nav.navigate(Routes.comic(it.id)) }
                item { SectionTitle(labels[6]) { IconButton({ newSpace = true }) { Icon(Icons.Filled.Add, labels[7]) } } }
                if (home.spaces.isEmpty()) item { Empty(labels[8]) }
                items(home.spaces, key = { "space-" + it.id }) { s ->
                    ListRow(
                        s.name, subtitle = s.description, leading = { Icon(Icons.Filled.Folder, null) },
                        trailing = if (s.userId != app.session.userId) ({ Pill(labels[9]) }) else null,
                        onClick = { nav.navigate(Routes.space(s.id)) },
                    )
                }
                item { androidx.compose.foundation.layout.Spacer(Modifier.padding(40.dp)) }
            }
        }
    }

    newKind?.let { kind ->
        NewWorkDialog(kind, loader.value?.spaces.orEmpty(), onDismiss = { newKind = null }) { k, title, spaceId ->
            newKind = null
            actions.run {
                val route = when (k) {
                    WorkKind.STORY -> Routes.story(app.repo.createStory(title, spaceId).first)
                    WorkKind.SCREENPLAY -> Routes.screenplay(app.repo.createScreenplay(title))
                    WorkKind.COMIC -> Routes.comic(app.repo.createComic(title))
                }
                nav.navigate(route)
            }
        }
    }
    if (newSpace) TextPrompt(tr("android-home-new-space", "New Space"), label = tr("android-name", "Name"), confirm = tr("android-create", "Create"), onDismiss = { newSpace = false }) { name ->
        newSpace = false
        actions.run { nav.navigate(Routes.space(app.repo.createSpace(name.trim()).id)) }
    }
    if (openLink) TextPrompt(tr("android-home-open-link", "Open by link or id"), label = "https://crowdly.cloud/story/…", confirm = tr("android-open", "Open"), onDismiss = { openLink = false }) { input ->
        openLink = false
        actions.run {
            val ref = parseWorkRef(input) ?: throw IllegalArgumentException(notFound)
            val kind = ref.first ?: app.repo.resolveWorkKind(ref.second) ?: throw IllegalArgumentException(notFound)
            nav.navigate(Routes.work(kind.key, ref.second))
        }
    }
}

private fun androidx.compose.foundation.lazy.LazyListScope.section(
    title: String, works: List<WorkSummary>, empty: String, onNew: () -> Unit, open: (WorkSummary) -> Unit,
) {
    item { SectionTitle(title) { IconButton(onNew) { Icon(Icons.Filled.Add, null) } } }
    if (works.isEmpty()) item { Empty(empty) }
    items(works, key = { it.kind.key + it.id }) { w ->
        ListRow(
            w.title.ifBlank { "Untitled" },
            subtitle = w.date?.take(10),
            leading = { Icon(kindIcon(w.kind), null) },
            trailing = if (w.visibility == "private") ({ Pill("private") }) else null,
            onClick = { open(w) },
        )
    }
}

/** New story / screenplay / comic (shell/dialogs.tsx NewDocumentDialog); stories can go into a Space. */
@Composable
fun NewWorkDialog(initial: WorkKind, spaces: List<Space>, onDismiss: () -> Unit, onCreate: (WorkKind, String, String?) -> Unit) {
    var kind by remember { mutableStateOf(initial) }
    var title by remember { mutableStateOf("") }
    var spaceId by remember { mutableStateOf<String?>(null) }
    val focus = androidx.compose.ui.platform.LocalFocusManager.current
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { AppText("android-new-title", "New") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                listOf(
                    WorkKind.STORY to tr("android-new-story", "Story"),
                    WorkKind.SCREENPLAY to tr("android-new-screenplay", "Screenplay"),
                    WorkKind.COMIC to tr("android-new-comic", "Comic or manga"),
                ).forEach { (k, label) ->
                    Row(Modifier.fillMaxWidth().selectable(kind == k) { kind = k }, verticalAlignment = Alignment.CenterVertically) {
                        RadioButton(kind == k, { kind = k })
                        Icon(kindIcon(k), null)
                        Text("  $label")
                    }
                }
                OutlinedTextField(title, { title = it }, Modifier.fillMaxWidth(), label = { AppText("android-title", "Title") }, singleLine = true)
                if (kind == WorkKind.STORY && spaces.isNotEmpty()) {
                    AppText("android-new-space", "Keep it in a Space (optional)", style = MaterialTheme.typography.labelMedium)
                    var open by remember { mutableStateOf(false) }
                    TextButton({ open = true }) { Text(spaces.firstOrNull { it.id == spaceId }?.name ?: tr("android-none", "None")) }
                    DropdownMenu(open, { open = false }) {
                        DropdownMenuItem({ AppText("android-none", "None") }, { spaceId = null; open = false })
                        spaces.forEach { s -> DropdownMenuItem({ Text(s.name) }, { spaceId = s.id; open = false }) }
                    }
                }
            }
        },
        confirmButton = { Button({ focus.clearFocus(force = true); onCreate(kind, title.trim(), spaceId) }) { AppText("android-create", "Create") } },
        dismissButton = { TextButton(onDismiss) { AppText("android-cancel", "Cancel") } },
    )
}
