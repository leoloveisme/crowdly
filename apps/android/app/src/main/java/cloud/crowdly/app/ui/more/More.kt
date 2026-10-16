package cloud.crowdly.app.ui.more

import android.net.Uri
import androidx.browser.customtabs.CustomTabsIntent
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Logout
import androidx.compose.material.icons.automirrored.filled.OpenInNew
import androidx.compose.material.icons.filled.Folder
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import cloud.crowdly.app.BuildConfig
import cloud.crowdly.app.crowdly
import cloud.crowdly.app.i18n.AppText
import cloud.crowdly.app.i18n.UI_LANGUAGES
import cloud.crowdly.app.i18n.tr
import cloud.crowdly.app.ui.LocalNav
import cloud.crowdly.app.ui.components.Confirm
import cloud.crowdly.app.ui.components.ListRow
import cloud.crowdly.app.ui.components.Screen
import cloud.crowdly.app.ui.components.SectionTitle
import cloud.crowdly.app.ui.components.rememberActions

fun openInBrowser(context: android.content.Context, url: String) {
    CustomTabsIntent.Builder().build().launchUrl(context, Uri.parse(url))
}

@Composable
fun MoreScreen() {
    val app = crowdly
    val nav = LocalNav.current
    val context = LocalContext.current
    val user by app.session.user.collectAsState()
    val actions = rememberActions()
    var confirmSignOut by remember { mutableStateOf(false) }
    Screen(tr("android-tab-more", "More")) { pad ->
        Column(Modifier.padding(pad).fillMaxSize().verticalScroll(rememberScrollState())) {
            ListRow(user?.email.orEmpty(), subtitle = user?.roles?.joinToString(" · "), leading = { Icon(Icons.Filled.Person, null) })
            HorizontalDivider()
            ListRow(tr("android-more-local", "Files on this phone"), subtitle = tr("android-more-local-sub", ".story, .screenplay, .comic and .master files, synced with Crowdly"), leading = { Icon(Icons.Filled.Folder, null) }, onClick = { nav.navigate("local") })
            ListRow(tr("android-more-settings", "Settings"), leading = { Icon(Icons.Filled.Settings, null) }, onClick = { nav.navigate("settings") })
            ListRow(tr("android-more-platform", "Open the Crowdly platform"), subtitle = app.prefs.platformUrl, leading = { Icon(Icons.AutoMirrored.Filled.OpenInNew, null) }, onClick = { openInBrowser(context, app.prefs.platformUrl) })
            HorizontalDivider()
            ListRow(tr("android-more-signout", "Sign out"), leading = { Icon(Icons.AutoMirrored.Filled.Logout, null) }, onClick = { confirmSignOut = true })
        }
    }
    if (confirmSignOut) {
        val pending = app.outbox.count.value
        Confirm(
            tr("android-more-signout", "Sign out"),
            if (pending > 0) tr("android-more-signout-pending", "Edits not yet sent to Crowdly will be lost on this phone.") else tr("android-more-signout-text", "You can sign in again any time."),
            tr("android-more-signout", "Sign out"),
            onDismiss = { confirmSignOut = false },
        ) { actions.run { app.session.signOut() } }
    }
}

@Composable
fun SettingsScreen() {
    val app = crowdly
    val nav = LocalNav.current
    val actions = rememberActions()
    val language by app.prefs.language.collectAsState()
    val theme by app.prefs.theme.collectAsState()
    val editInterface by app.prefs.editInterface.collectAsState()
    val user by app.session.user.collectAsState()
    val pending by app.outbox.count.collectAsState()
    var server by remember { mutableStateOf(app.prefs.server) }
    var platform by remember { mutableStateOf(app.prefs.platformUrl) }
    var cacheBytes by remember { mutableLongStateOf(app.db.cacheSize()) }

    Screen(tr("android-more-settings", "Settings"), back = { nav.popBackStack() }) { pad ->
        Column(Modifier.padding(pad).fillMaxSize().verticalScroll(rememberScrollState())) {
            SectionTitle(tr("android-settings-language", "Interface language"))
            UI_LANGUAGES.forEach { (value, label) ->
                Row(
                    Modifier.fillMaxWidth().selectable(language == value) { app.prefs.setLanguage(value) }.padding(horizontal = 16.dp, vertical = 4.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    RadioButton(language == value, onClick = { app.prefs.setLanguage(value) })
                    Text(label)
                }
            }
            if (user?.isTranslator == true) {
                Row(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                    Column(Modifier.weight(1f)) {
                        AppText("android-settings-edit-ui", "Edit interface text")
                        AppText("android-settings-edit-ui-sub", "Long-press any label to translate it into the current language.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                    Switch(editInterface, { app.prefs.setEditInterface(it) })
                }
            }

            SectionTitle(tr("android-settings-theme", "Theme"))
            listOf("system" to tr("android-settings-theme-system", "Follow the phone"), "light" to tr("android-settings-theme-light", "Light"), "dark" to tr("android-settings-theme-dark", "Dark")).forEach { (v, label) ->
                Row(Modifier.fillMaxWidth().clickable { app.prefs.setTheme(v) }.padding(horizontal = 16.dp, vertical = 4.dp), verticalAlignment = Alignment.CenterVertically) {
                    RadioButton(theme == v, onClick = { app.prefs.setTheme(v) })
                    Text(label)
                }
            }

            SectionTitle(tr("android-settings-offline", "Offline"))
            ListRow(
                tr("android-settings-outbox", "Unsent edits"),
                subtitle = "$pending",
                trailing = {
                    val sent = tr("android-settings-sent", "Sent")
                    Row {
                        TextButton({ actions.run(sent) { app.api.flushOutbox() } }, enabled = pending > 0) { AppText("android-settings-send-now", "Send now") }
                    }
                },
            )
            ListRow(
                tr("android-settings-cache", "Saved for offline"),
                subtitle = "${cacheBytes / 1024} KB",
                trailing = { TextButton({ app.db.cacheDelete("work:"); app.db.cacheDelete("space:"); cacheBytes = app.db.cacheSize() }) { AppText("android-settings-clear", "Clear") } },
            )

            SectionTitle(tr("android-settings-server", "Server"))
            OutlinedTextField(server, { server = it }, Modifier.fillMaxWidth().padding(horizontal = 16.dp), singleLine = true, label = { AppText("android-signin-server-url", "Server address") })
            OutlinedTextField(platform, { platform = it }, Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp), singleLine = true, label = { AppText("android-settings-platform-url", "Platform address") })
            OutlinedButton(
                onClick = {
                    val changed = server.trimEnd('/') != app.prefs.server
                    app.prefs.server = server
                    app.prefs.platformUrl = platform
                    // A session belongs to one server: sign in again on the new one.
                    if (changed) app.session.forget()
                },
                modifier = Modifier.padding(horizontal = 16.dp),
            ) { AppText("android-save", "Save") }

            SectionTitle(tr("android-settings-about", "About"))
            ListRow("Crowdly for Android ${BuildConfig.VERSION_NAME} (${BuildConfig.VERSION_CODE})", subtitle = app.prefs.server)
        }
    }
}
