package cloud.crowdly.app.ui.discover

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ViewList
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.AutoAwesome
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.DragHandle
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.GridView
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.FilterChip
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import cloud.crowdly.app.crowdly
import cloud.crowdly.app.data.RULE_FIELDS
import cloud.crowdly.app.data.Shelf
import cloud.crowdly.app.data.SmartRule
import cloud.crowdly.app.data.SmartRules
import cloud.crowdly.app.i18n.AppText
import cloud.crowdly.app.i18n.tr
import cloud.crowdly.app.ui.LocalNav
import cloud.crowdly.app.ui.Routes
import cloud.crowdly.app.ui.components.Confirm
import cloud.crowdly.app.ui.components.Empty
import cloud.crowdly.app.ui.components.ListRow
import cloud.crowdly.app.ui.components.Loaded
import cloud.crowdly.app.ui.components.ReorderableColumn
import cloud.crowdly.app.ui.components.Screen
import cloud.crowdly.app.ui.components.SectionTitle
import cloud.crowdly.app.ui.components.TextPrompt
import cloud.crowdly.app.ui.components.rememberActions
import cloud.crowdly.app.ui.components.rememberLoader

private val SYSTEM_TITLES = mapOf(
    "favorites" to ("android-shelf-favorites" to "Favorites"),
    "living" to ("android-shelf-living" to "Living"),
    "lived" to ("android-shelf-lived" to "Lived"),
    "newest" to ("android-shelf-newest" to "Newest"),
    "most_active" to ("android-shelf-active" to "Most active"),
    "most_popular" to ("android-shelf-popular" to "Most popular"),
)

/**
 * Shelves (ShelvesPage.tsx, desktop smart_shelf_dialog.py): the system
 * shelves, manual shelves you fill yourself and smart shelves defined by
 * rules. Create, rename, drag to reorder and delete.
 */
@Composable
fun ShelvesScreen() {
    val app = crowdly
    val nav = LocalNav.current
    val actions = rememberActions()
    val loader = rememberLoader { app.discovery.shelves() }
    var newManual by remember { mutableStateOf(false) }
    var smart by remember { mutableStateOf(false) }
    Screen(
        tr("android-tab-shelves", "Shelves"),
        actions = {
            IconButton({ newManual = true }) { Icon(Icons.Filled.Add, tr("android-shelves-new", "New shelf")) }
            IconButton({ smart = true }) { Icon(Icons.Filled.AutoAwesome, tr("android-shelves-new-smart", "New smart shelf")) }
        },
    ) { pad ->
        Loaded(loader, Modifier.padding(pad)) { (system, custom) ->
            Column(Modifier.padding(pad).fillMaxSize().verticalScroll(rememberScrollState())) {
                system.forEach { (key, count) ->
                    val (id, en) = SYSTEM_TITLES[key] ?: ("android-shelf-$key" to key)
                    ListRow(tr(id, en), trailing = count?.let { { Text("$it", color = MaterialTheme.colorScheme.onSurfaceVariant) } }, onClick = { nav.navigate(Routes.shelf(key)) })
                }
                HorizontalDivider()
                SectionTitle(tr("android-shelves-mine", "My shelves"))
                if (custom.isEmpty()) Empty(tr("android-shelves-empty", "No shelves of your own yet. Make a shelf and add books to it, or a smart shelf that fills itself."))
                ReorderableColumn(custom, key = { it.id }, onMove = { order -> actions.run { app.discovery.reorderShelves(order.map { it.id }); loader.reload() } }) { s, handle ->
                    Row(Modifier.fillMaxWidth().clickable { nav.navigate(Routes.shelf(s.id)) }.padding(horizontal = 8.dp, vertical = 10.dp), verticalAlignment = Alignment.CenterVertically) {
                        Icon(Icons.Filled.DragHandle, tr("android-drag", "Drag to reorder"), handle.padding(8.dp))
                        if (s.kind == "smart") Icon(Icons.Filled.AutoAwesome, null, Modifier.size(16.dp), tint = MaterialTheme.colorScheme.tertiary)
                        Text(s.name, Modifier.weight(1f).padding(horizontal = 8.dp))
                        Text(s.count?.toString().orEmpty(), color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                }
            }
        }
    }
    if (newManual) TextPrompt(tr("android-shelves-new", "New shelf"), label = tr("android-name", "Name"), confirm = tr("android-create", "Create"), onDismiss = { newManual = false }) { name ->
        newManual = false
        actions.run { val s = app.discovery.createShelf(name.trim(), "manual"); loader.reload(); nav.navigate(Routes.shelf(s.id)) }
    }
    if (smart) SmartShelfDialog(null, onDismiss = { smart = false }) { name, rules ->
        smart = false
        actions.run { val s = app.discovery.createShelf(name, "smart", rules); loader.reload(); nav.navigate(Routes.shelf(s.id)) }
    }
}

/** One shelf's items: a grid, or for manual shelves a list that can be dragged into order. */
@Composable
fun ShelfScreen(key: String) {
    val app = crowdly
    val nav = LocalNav.current
    val actions = rememberActions()
    val shelves = rememberLoader { app.discovery.shelves().second }
    val items = rememberLoader(key) { app.discovery.shelfItems(key) }
    val shelf = shelves.value?.firstOrNull { it.id == key }
    var listMode by remember { mutableStateOf(false) }
    var renaming by remember { mutableStateOf(false) }
    var editingSmart by remember { mutableStateOf(false) }
    var deleting by remember { mutableStateOf(false) }
    val title = shelf?.name ?: SYSTEM_TITLES[key]?.let { tr(it.first, it.second) } ?: key
    Screen(
        title,
        back = { nav.popBackStack() },
        subtitle = shelf?.let { if (it.kind == "smart") tr("android-shelves-smart", "Smart shelf") else null },
        actions = {
            if (shelf?.kind == "manual") IconButton({ listMode = !listMode }) { Icon(if (listMode) Icons.Filled.GridView else Icons.AutoMirrored.Filled.ViewList, tr("android-shelves-arrange", "Arrange")) }
            if (shelf != null) {
                IconButton({ if (shelf.kind == "smart") editingSmart = true else renaming = true }) { Icon(Icons.Filled.Edit, tr("android-shelves-edit", "Edit")) }
                IconButton({ deleting = true }) { Icon(Icons.Filled.Delete, tr("android-delete", "Delete")) }
            }
        },
    ) { pad ->
        Loaded(items, Modifier.padding(pad)) { list ->
            Column(Modifier.padding(pad).fillMaxSize()) {
                if (list.isEmpty()) { Empty(tr("android-shelves-items-empty", "Nothing on this shelf yet.")); return@Column }
                if (listMode && shelf != null) Column(Modifier.verticalScroll(rememberScrollState())) {
                    ReorderableColumn(list, key = { it.entryId ?: it.id }, onMove = { order -> actions.run { app.discovery.reorderShelfItems(shelf.id, order.mapNotNull { it.entryId }); items.reload() } }) { i, handle ->
                        Row(Modifier.fillMaxWidth().padding(horizontal = 8.dp, vertical = 6.dp), verticalAlignment = Alignment.CenterVertically) {
                            Icon(Icons.Filled.DragHandle, tr("android-drag", "Drag to reorder"), handle.padding(8.dp))
                            Icon(formatIcon(if (i.type == "library_item") i.format ?: "text" else i.type), null)
                            Text(i.title, Modifier.weight(1f).padding(horizontal = 8.dp))
                            IconButton({ actions.run { app.discovery.removeFromShelf(shelf.id, i.type, i.id); items.reload() } }) { Icon(Icons.Filled.Delete, tr("android-item-remove", "Remove")) }
                        }
                    }
                } else ItemGrid(list, onRemove = if (shelf?.kind == "manual") ({ i -> actions.run { app.discovery.removeFromShelf(shelf.id, i.type, i.id); items.reload() } }) else null) { items.reload() }
            }
        }
    }
    if (renaming && shelf != null) TextPrompt(tr("android-shelves-rename", "Rename shelf"), shelf.name, confirm = tr("android-save", "Save"), onDismiss = { renaming = false }) { n ->
        renaming = false; actions.run { app.discovery.updateShelf(shelf.id, name = n.trim()); shelves.reload() }
    }
    if (editingSmart && shelf != null) SmartShelfDialog(shelf, onDismiss = { editingSmart = false }) { name, rules ->
        editingSmart = false; actions.run { app.discovery.updateShelf(shelf.id, name, rules); shelves.reload(); items.reload() }
    }
    if (deleting && shelf != null) Confirm(tr("android-shelves-delete", "Delete shelf"), "“${shelf.name}” — " + tr("android-shelves-delete-text", "the books stay in your library."), tr("android-delete", "Delete"), { deleting = false }) {
        actions.run { app.discovery.deleteShelf(shelf.id); nav.popBackStack() }
    }
}

/** Smart shelf rules (SmartShelfDialog): match all/any of field-op-value rules. */
@Composable
fun SmartShelfDialog(initial: Shelf?, onDismiss: () -> Unit, onSave: (String, SmartRules) -> Unit) {
    var name by remember { mutableStateOf(initial?.name.orEmpty()) }
    var match by remember { mutableStateOf(initial?.rules?.match ?: "all") }
    val rules = remember { mutableStateListOf<SmartRule>().apply { addAll(initial?.rules?.rules ?: listOf(SmartRule("format", "is", "epub"))) } }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { AppText("android-smart-title", "Smart shelf") },
        text = {
            Column(Modifier.heightIn(max = 520.dp).verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedTextField(name, { name = it }, Modifier.fillMaxWidth(), singleLine = true, label = { AppText("android-name", "Name") })
                Row(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalAlignment = Alignment.CenterVertically) {
                    AppText("android-smart-match", "Match")
                    FilterChip(match == "all", { match = "all" }, { AppText("android-smart-all", "all rules") })
                    FilterChip(match == "any", { match = "any" }, { AppText("android-smart-any", "any rule") })
                }
                rules.forEachIndexed { i, r ->
                    val spec = RULE_FIELDS[r.field]
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                        var fieldMenu by remember { mutableStateOf(false) }
                        OutlinedButton({ fieldMenu = true }) { Text(spec?.label ?: r.field, maxLines = 1) }
                        DropdownMenu(fieldMenu, { fieldMenu = false }) {
                            RULE_FIELDS.forEach { (k, f) -> DropdownMenuItem({ Text(f.label) }, { fieldMenu = false; rules[i] = SmartRule(k, f.ops[0], f.values?.first() ?: if (f.type == "days") "30" else "") }) }
                        }
                        Text(when (r.op) { "contains" -> "∋"; "lte" -> "≤"; else -> "=" })
                        if (spec?.values != null) {
                            var valueMenu by remember { mutableStateOf(false) }
                            OutlinedButton({ valueMenu = true }, Modifier.weight(1f)) { Text(r.value, maxLines = 1) }
                            DropdownMenu(valueMenu, { valueMenu = false }) { spec.values.forEach { v -> DropdownMenuItem({ Text(v) }, { valueMenu = false; rules[i] = r.copy(value = v) }) } }
                        } else OutlinedTextField(
                            r.value, { rules[i] = r.copy(value = it) }, Modifier.weight(1f), singleLine = true,
                            keyboardOptions = KeyboardOptions(keyboardType = if (spec?.type == "days") KeyboardType.Number else KeyboardType.Text),
                        )
                        IconButton({ rules.removeAt(i) }) { Icon(Icons.Filled.Delete, tr("android-smart-remove-rule", "Remove rule")) }
                    }
                }
                TextButton({ rules += SmartRule("title", "contains", "") }) { Icon(Icons.Filled.Add, null); AppText("android-smart-add-rule", "Add rule") }
            }
        },
        confirmButton = { Button({ onSave(name.trim(), SmartRules(match, rules.toList())) }, enabled = name.isNotBlank() && rules.isNotEmpty()) { AppText("android-save", "Save") } },
        dismissButton = { TextButton(onDismiss) { AppText("android-cancel", "Cancel") } },
    )
}
