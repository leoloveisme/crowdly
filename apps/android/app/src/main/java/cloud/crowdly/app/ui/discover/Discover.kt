package cloud.crowdly.app.ui.discover

import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.MenuBook
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.AutoAwesome
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Description
import androidx.compose.material.icons.filled.Favorite
import androidx.compose.material.icons.filled.Headphones
import androidx.compose.material.icons.filled.Image
import androidx.compose.material.icons.filled.MoreVert
import androidx.compose.material.icons.filled.Movie
import androidx.compose.material.icons.filled.PictureAsPdf
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.Upload
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExtendedFloatingActionButton
import androidx.compose.material3.FilterChip
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import cloud.crowdly.app.crowdly
import cloud.crowdly.app.data.LibraryItem
import cloud.crowdly.app.data.Shelf
import cloud.crowdly.app.data.ShelfItem
import cloud.crowdly.app.i18n.AppText
import cloud.crowdly.app.i18n.tr
import cloud.crowdly.app.ui.LocalNav
import cloud.crowdly.app.ui.Routes
import cloud.crowdly.app.ui.components.Confirm
import cloud.crowdly.app.ui.components.Empty
import cloud.crowdly.app.ui.components.ListRow
import cloud.crowdly.app.ui.components.Loaded
import cloud.crowdly.app.ui.components.Screen
import cloud.crowdly.app.ui.components.SectionTitle
import cloud.crowdly.app.ui.components.readPicked
import cloud.crowdly.app.ui.components.rememberActions
import cloud.crowdly.app.ui.components.rememberLoader
import coil3.compose.AsyncImage

/** Discovery rows (DiscoveryHome.tsx ROW_TITLES). */
private val ROW_TITLES = mapOf(
    "continue" to ("android-disc-row-continue" to "Continue reading"),
    "favorites" to ("android-disc-row-favorites" to "Favorites"),
    "newest" to ("android-disc-row-newest" to "Newest stories"),
    "newest_screenplays" to ("android-disc-row-newest-sp" to "Newest screenplays"),
    "most_popular" to ("android-disc-row-popular" to "Most popular"),
    "most_popular_screenplays" to ("android-disc-row-popular-sp" to "Most popular screenplays"),
    "most_active" to ("android-disc-row-active" to "Most active"),
    "most_active_screenplays" to ("android-disc-row-active-sp" to "Most active screenplays"),
    "living" to ("android-disc-row-living" to "Living (experiencing now)"),
    "lived" to ("android-disc-row-lived" to "Lived (experienced)"),
)

fun formatIcon(kind: String): ImageVector = when (kind) {
    "screenplay" -> Icons.Filled.Movie
    "comic" -> Icons.Filled.Image
    "audio" -> Icons.Filled.Headphones
    "pdf" -> Icons.Filled.PictureAsPdf
    "text" -> Icons.Filled.Description
    else -> Icons.AutoMirrored.Filled.MenuBook
}

/** One tile (ItemCard.tsx): cover or format icon, title, progress, favorite; a menu to favorite or shelve it. */
@Composable
fun ItemCard(item: ShelfItem, modifier: Modifier = Modifier, onRemove: (() -> Unit)? = null, onChanged: () -> Unit = {}) {
    val app = crowdly
    val nav = LocalNav.current
    val actions = rememberActions()
    var menu by remember { mutableStateOf(false) }
    var shelves by remember { mutableStateOf<List<Shelf>?>(null) }
    var favorite by remember(item) { mutableStateOf(item.favorite) }
    val kind = if (item.type == "library_item") item.format ?: "text" else item.type
    val cover = item.cover?.let { app.api.mediaUrl(it) } ?: if (item.type == "library_item") app.discovery.libraryCoverUrl(item.id) else null
    Column(modifier.clickable { nav.navigate(Routes.read(item.readKind, item.id)) }) {
        Box(Modifier.fillMaxWidth().aspectRatio(2f / 3f).clip(RoundedCornerShape(6.dp)).background(MaterialTheme.colorScheme.surfaceVariant), contentAlignment = Alignment.Center) {
            var coverOk by remember(cover) { mutableStateOf(cover != null) }
            if (!coverOk) Icon(formatIcon(kind), null, Modifier.size(36.dp), tint = MaterialTheme.colorScheme.onSurfaceVariant)
            if (cover != null && coverOk) AsyncImage(cover, null, Modifier.fillMaxSize(), contentScale = ContentScale.Crop, onError = { coverOk = false })
            item.progress?.takeIf { it > 0 }?.let { p ->
                Box(Modifier.align(Alignment.BottomStart).fillMaxWidth((p / 100).toFloat().coerceIn(0f, 1f)).height(3.dp).background(MaterialTheme.colorScheme.secondary))
            }
            if (favorite) Icon(Icons.Filled.Favorite, null, Modifier.align(Alignment.TopStart).padding(6.dp).size(16.dp), tint = Color(0xFFF43F5E))
            Box(Modifier.align(Alignment.TopEnd)) {
                IconButton({ menu = true; if (shelves == null) actions.run { shelves = app.discovery.shelves().second.filter { it.kind == "manual" } } }, Modifier.size(32.dp)) {
                    Icon(Icons.Filled.MoreVert, tr("android-more", "More"), Modifier.background(MaterialTheme.colorScheme.surface.copy(alpha = 0.7f), RoundedCornerShape(50)))
                }
                DropdownMenu(menu, { menu = false }) {
                    if (item.type != "library_item") DropdownMenuItem(
                        { Text(if (favorite) tr("android-item-unfavorite", "Remove from favorites") else tr("android-item-favorite", "Add to favorites")) },
                        { menu = false; actions.run { app.discovery.setStatus(item.type, item.id, favorite = !favorite); favorite = !favorite; onChanged() } },
                    )
                    HorizontalDivider()
                    Text(tr("android-item-add-to-shelf", "Add to shelf"), Modifier.padding(horizontal = 12.dp, vertical = 4.dp), style = MaterialTheme.typography.labelMedium)
                    if (shelves?.isEmpty() == true) DropdownMenuItem({ AppText("android-item-no-shelves", "No shelves yet") }, {}, enabled = false)
                    shelves?.forEach { s -> DropdownMenuItem({ Text(s.name) }, { menu = false; actions.run("Added to ${s.name}") { app.discovery.addToShelf(s.id, item.type, item.id); onChanged() } }) }
                    if (onRemove != null) { HorizontalDivider(); DropdownMenuItem({ AppText("android-item-remove", "Remove") }, { menu = false; onRemove() }) }
                }
            }
        }
        Text(item.title.ifBlank { "Untitled" }, Modifier.padding(top = 4.dp), style = MaterialTheme.typography.bodySmall, fontWeight = FontWeight.Medium, maxLines = 2, overflow = TextOverflow.Ellipsis)
        (item.author ?: item.subtitle)?.takeIf { it.isNotBlank() }?.let { Text(it, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1, overflow = TextOverflow.Ellipsis) }
    }
}

@Composable
fun ItemGrid(items: List<ShelfItem>, modifier: Modifier = Modifier, onRemove: ((ShelfItem) -> Unit)? = null, onChanged: () -> Unit = {}) {
    LazyVerticalGrid(GridCells.Adaptive(108.dp), modifier.fillMaxSize().padding(horizontal = 12.dp), horizontalArrangement = Arrangement.spacedBy(10.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        items(items, key = { it.type + it.id + (it.entryId ?: "") }) { i -> ItemCard(i, onRemove = onRemove?.let { r -> { r(i) } }, onChanged = onChanged) }
    }
}

/** Discovery start page (DiscoveryHome.tsx): rows of what to read, plus search. */
@Composable
fun DiscoverScreen() {
    val app = crowdly
    val nav = LocalNav.current
    val loader = rememberLoader { app.discovery.home() }
    var q by remember { mutableStateOf("") }
    var query by remember { mutableStateOf("") }
    var results by remember { mutableStateOf<List<cloud.crowdly.app.data.Discovery.SearchResult>?>(null) }
    LaunchedEffect(query) { results = if (query.length > 1) runCatching { app.discovery.search(query) }.getOrNull() else null }
    Screen(tr("android-tab-discover", "Discover")) { pad ->
        LazyColumn(Modifier.padding(pad).fillMaxSize()) {
            item {
                OutlinedTextField(
                    q, { q = it }, Modifier.fillMaxWidth().padding(horizontal = 16.dp), singleLine = true,
                    leadingIcon = { Icon(Icons.Filled.Search, null) }, placeholder = { AppText("android-disc-search", "Search stories, screenplays and comics") },
                    keyboardOptions = KeyboardOptions(imeAction = ImeAction.Search), keyboardActions = KeyboardActions(onSearch = { query = q.trim() }),
                )
            }
            results?.let { rs ->
                item { SectionTitle(tr("android-disc-results", "Results")) }
                if (rs.isEmpty()) item { Empty(tr("android-disc-no-results", "Nothing found.")) }
                items(rs, key = { "r" + it.type + it.id }) { r -> ListRow(r.title, subtitle = listOfNotNull(r.type, r.subtitle).joinToString(" · "), leading = { Icon(formatIcon(r.type), null) }, onClick = { nav.navigate(Routes.read(r.type, r.id)) }) }
            }
            when (val st = loader.state.value) {
                is cloud.crowdly.app.ui.components.LoadState.Ready -> st.value.filter { it.second.isNotEmpty() }.forEach { (key, list) ->
                    item(key = "row-$key") {
                        val (id, en) = ROW_TITLES[key] ?: ("android-disc-row-$key" to key)
                        SectionTitle(tr(id, en))
                        LazyRow(Modifier.fillMaxWidth(), contentPadding = androidx.compose.foundation.layout.PaddingValues(horizontal = 16.dp), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                            items(list.take(16), key = { it.type + it.id }) { i -> ItemCard(i, Modifier.width(112.dp)) { loader.reload() } }
                        }
                    }
                }
                is cloud.crowdly.app.ui.components.LoadState.Failed -> item { Empty(st.message) }
                else -> item { Empty("…") }
            }
            item { Spacer(Modifier.height(24.dp)) }
        }
    }
}

private val RIGHTS = listOf(
    "personal_copy" to ("android-lib-rights-personal" to "A copy I own, for my own reading"),
    "own_work" to ("android-lib-rights-own" to "My own work"),
    "public_domain" to ("android-lib-rights-pd" to "Public domain"),
    "cc_licensed" to ("android-lib-rights-cc" to "Creative Commons"),
)

/** My library (LibraryPage.tsx): import EPUB, PDF, text/Markdown and audio books, refusing DRM-protected files. */
@Composable
fun LibraryScreen() {
    val app = crowdly
    val context = LocalContext.current
    val actions = rememberActions()
    val loader = rememberLoader { app.discovery.library() }
    var rights by remember { mutableStateOf("personal_copy") }
    var rightsMenu by remember { mutableStateOf(false) }
    var removing by remember { mutableStateOf<LibraryItem?>(null) }
    val picker = rememberLauncherForActivityResult(ActivityResultContracts.OpenMultipleDocuments()) { uris ->
        if (uris.isNotEmpty()) actions.run {
            var added = 0
            for (u in uris) {
                val f = readPicked(context, u, "file")
                app.discovery.importBook(f.name, f.bytes, rights); added++
            }
            loader.reload()
        }
    }
    Screen(
        tr("android-lib-title", "My library"),
        floating = { ExtendedFloatingActionButton(onClick = { picker.launch(arrayOf("application/epub+zip", "application/pdf", "text/*", "audio/*", "application/octet-stream")) }, icon = { Icon(Icons.Filled.Upload, null) }, text = { AppText("android-lib-add", "Add books") }) },
    ) { pad ->
        Column(Modifier.padding(pad).fillMaxSize()) {
            Row(Modifier.padding(horizontal = 16.dp), verticalAlignment = Alignment.CenterVertically) {
                AppText("android-lib-privacy", "Books you add stay private to your account. DRM-protected books can't be added.", Modifier.weight(1f), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            Box {
                FilterChip(true, { rightsMenu = true }, { Text(RIGHTS.first { it.first == rights }.second.let { tr(it.first, it.second) }) }, Modifier.padding(horizontal = 16.dp))
                DropdownMenu(rightsMenu, { rightsMenu = false }) { RIGHTS.forEach { (v, l) -> DropdownMenuItem({ Text(tr(l.first, l.second)) }, { rights = v; rightsMenu = false }) } }
            }
            Loaded(loader) { items ->
                if (items.isEmpty()) Empty(tr("android-lib-empty", "Your library is empty. Add EPUB, PDF, text or audio books."))
                else ItemGrid(
                    items.map { i ->
                        val story = i.kind == "crowdly_story" && i.storyId != null
                        ShelfItem(if (story) "story" else "library_item", if (story) i.storyId!! else i.id, null, i.title, null, i.author, i.format, null, false, false, false, null)
                    },
                    onRemove = { s -> removing = items.firstOrNull { it.id == s.id || it.storyId == s.id } },
                )
            }
        }
    }
    removing?.let { i -> Confirm(tr("android-item-remove", "Remove"), "“${i.title}” — " + tr("android-lib-remove-text", "remove it from your library?"), tr("android-item-remove", "Remove"), { removing = null }) {
        actions.run { app.discovery.deleteLibraryItem(i.id); loader.reload() }
    } }
}
