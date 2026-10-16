package cloud.crowdly.app.ui

import android.net.Uri
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.LibraryBooks
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.Explore
import androidx.compose.material.icons.filled.Menu
import androidx.compose.material.icons.filled.ViewList
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.dp
import androidx.navigation.NavHostController
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import cloud.crowdly.app.crowdly
import cloud.crowdly.app.i18n.AppText
import cloud.crowdly.app.i18n.ProvideStrings
import cloud.crowdly.app.i18n.tr
import cloud.crowdly.app.sync.OutboxWorker
import cloud.crowdly.app.ui.create.ComicEditorScreen
import cloud.crowdly.app.ui.create.CreateHomeScreen
import cloud.crowdly.app.ui.create.ScreenplayEditorScreen
import cloud.crowdly.app.ui.create.StoryEditorScreen
import cloud.crowdly.app.ui.discover.DiscoverScreen
import cloud.crowdly.app.ui.discover.LibraryScreen
import cloud.crowdly.app.ui.discover.ShelfScreen
import cloud.crowdly.app.ui.discover.ShelvesScreen
import cloud.crowdly.app.ui.local.LocalFileScreen
import cloud.crowdly.app.ui.local.LocalFolderScreen
import cloud.crowdly.app.ui.more.MoreScreen
import cloud.crowdly.app.ui.more.SettingsScreen
import cloud.crowdly.app.ui.reader.ReaderScreen
import cloud.crowdly.app.ui.spaces.FileEditorScreen
import cloud.crowdly.app.ui.spaces.MasterEditorScreen
import cloud.crowdly.app.ui.spaces.SpaceScreen

/** The app's NavController, for screens that open other screens. */
val LocalNav = staticCompositionLocalOf<NavHostController> { error("no nav") }

object Routes {
    fun story(id: String) = "story/$id"
    fun screenplay(id: String) = "screenplay/$id"
    fun comic(id: String) = "comic/$id"
    fun work(kind: String, id: String) = "$kind/$id"
    fun space(spaceId: String, path: String = "") = "space/$spaceId?path=${Uri.encode(path)}"
    fun file(spaceId: String, itemId: String) = "file/$spaceId/$itemId"
    fun master(spaceId: String, itemId: String) = "master/$spaceId/$itemId"
    fun read(kind: String, id: String, edition: String? = null) = "read/$kind/$id" + (edition?.let { "?edition=$it" } ?: "")
    fun shelf(key: String) = "shelf/${Uri.encode(key)}"
    // Navigation decodes arguments itself; a second decode would change content:// URIs.
    fun localFile(uri: String) = "localfile?uri=${Uri.encode(uri)}"
}

private data class Tab(val route: String, val id: String, val label: String, val icon: ImageVector)

private val TABS = listOf(
    Tab("create", "android-tab-create", "Create", Icons.Filled.Edit),
    Tab("discover", "android-tab-discover", "Discover", Icons.Filled.Explore),
    Tab("library", "android-tab-library", "Library", Icons.AutoMirrored.Filled.LibraryBooks),
    Tab("shelves", "android-tab-shelves", "Shelves", Icons.Filled.ViewList),
    Tab("more", "android-tab-more", "More", Icons.Filled.Menu),
)

@Composable
fun CrowdlyRoot(openedFile: String?, onOpened: () -> Unit) {
    val app = crowdly
    val user by app.session.user.collectAsState()
    val language by app.prefs.language.collectAsState()
    val online by app.connectivity.online.collectAsState()
    val unauthorized by app.api.unauthorized.collectAsState()

    LaunchedEffect(Unit) { app.session.refresh() }
    LaunchedEffect(language) { app.i18n.load(language) }
    LaunchedEffect(unauthorized) { if (unauthorized > 0) app.session.forget() }
    // Back online: send what was written offline (also scheduled by WorkManager).
    LaunchedEffect(online, user) { if (online && user != null) { app.api.flushOutbox(); OutboxWorker.schedule(app) } }

    val direction = if (language == "Arabic") LayoutDirection.Rtl else LocalLayoutDirection.current
    CompositionLocalProvider(LocalLayoutDirection provides direction) {
        ProvideStrings(app.i18n, app.prefs, app.session) {
            if (user == null) SignInScreen() else Shell(openedFile, onOpened)
        }
    }
}

@Composable
private fun Shell(openedFile: String?, onOpened: () -> Unit) {
    val nav = rememberNavController()
    val entry by nav.currentBackStackEntryAsState()
    val current = entry?.destination?.route
    LaunchedEffect(openedFile) {
        if (openedFile != null) { nav.navigate(Routes.localFile(openedFile)); onOpened() }
    }
    CompositionLocalProvider(LocalNav provides nav) {
        Column(Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background)) {
            NavHost(nav, startDestination = "create", modifier = Modifier.weight(1f)) {
                composable("create") { CreateHomeScreen() }
                composable("discover") { DiscoverScreen() }
                composable("library") { LibraryScreen() }
                composable("shelves") { ShelvesScreen() }
                composable("more") { MoreScreen() }
                composable("settings") { SettingsScreen() }
                composable("local") { LocalFolderScreen() }
                composable("localfile?uri={uri}", listOf(navArgument("uri") { type = NavType.StringType })) {
                    LocalFileScreen(it.arguments?.getString("uri").orEmpty())
                }
                composable("story/{id}") { StoryEditorScreen(it.arguments?.getString("id").orEmpty()) }
                composable("screenplay/{id}") { ScreenplayEditorScreen(it.arguments?.getString("id").orEmpty()) }
                composable("comic/{id}") { ComicEditorScreen(it.arguments?.getString("id").orEmpty()) }
                composable("space/{spaceId}?path={path}", listOf(navArgument("path") { type = NavType.StringType; defaultValue = "" })) {
                    SpaceScreen(it.arguments?.getString("spaceId").orEmpty(), it.arguments?.getString("path").orEmpty())
                }
                composable("file/{spaceId}/{itemId}") { FileEditorScreen(it.arguments?.getString("spaceId").orEmpty(), it.arguments?.getString("itemId").orEmpty()) }
                composable("master/{spaceId}/{itemId}") { MasterEditorScreen(it.arguments?.getString("spaceId").orEmpty(), it.arguments?.getString("itemId").orEmpty()) }
                composable("read/{kind}/{id}?edition={edition}", listOf(navArgument("edition") { type = NavType.StringType; nullable = true; defaultValue = null })) {
                    ReaderScreen(it.arguments?.getString("kind").orEmpty(), it.arguments?.getString("id").orEmpty(), it.arguments?.getString("edition"))
                }
                composable("shelf/{key}") { ShelfScreen(it.arguments?.getString("key").orEmpty()) }
            }
            StatusStrip()
            if (TABS.any { it.route == current }) {
                NavigationBar {
                    TABS.forEach { tab ->
                        NavigationBarItem(
                            selected = current == tab.route,
                            onClick = {
                                nav.navigate(tab.route) {
                                    popUpTo("create") { saveState = true }
                                    launchSingleTop = true
                                    restoreState = true
                                }
                            },
                            icon = { Icon(tab.icon, null) },
                            label = { AppText(tab.id, tab.label, maxLines = 1) },
                        )
                    }
                }
            }
        }
    }
}

/** Offline state and unsent writes, like the web app's StatusBar.tsx. Hidden while all is well. */
@Composable
private fun StatusStrip() {
    val app = crowdly
    val online by app.connectivity.online.collectAsState()
    val pending by app.outbox.count.collectAsState()
    val rejected by app.outbox.rejected.collectAsState()
    if (rejected.isNotEmpty()) Row(
        Modifier.fillMaxWidth().background(MaterialTheme.colorScheme.errorContainer).padding(horizontal = 16.dp, vertical = 6.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            "${rejected.size} " + tr("android-status-rejected", "edits made offline couldn't be applied: what you edited changed or was deleted while you were away."),
            Modifier.weight(1f), style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onErrorContainer,
        )
        androidx.compose.material3.TextButton({ app.outbox.dismissRejected() }) { AppText("android-ok", "OK") }
    }
    if (online && pending == 0) return
    Row(
        Modifier.fillMaxWidth().background(MaterialTheme.colorScheme.surfaceVariant).padding(horizontal = 16.dp, vertical = 6.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Text(
            buildString {
                append(if (online) tr("android-status-online", "Online") else tr("android-status-offline", "Offline: your edits are kept on this phone"))
                if (pending > 0) append(" · $pending ${tr("android-status-pending", "unsent")}")
            },
            style = MaterialTheme.typography.labelMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}
