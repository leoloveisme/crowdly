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
import androidx.compose.material.icons.filled.BugReport
import androidx.compose.material.icons.filled.Computer
import androidx.compose.material.icons.filled.Feedback
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
    var reporting by remember { mutableStateOf(false) }
    Screen(tr("android-tab-more", "More")) { pad ->
        Column(Modifier.padding(pad).fillMaxSize().verticalScroll(rememberScrollState())) {
            ListRow(user?.email.orEmpty(), subtitle = user?.roles?.joinToString(" · "), leading = { Icon(Icons.Filled.Person, null) })
            HorizontalDivider()
            ListRow(tr("android-more-local", "Files on this phone"), subtitle = tr("android-more-local-sub", ".story, .screenplay, .comic and .master files, synced with Crowdly"), leading = { Icon(Icons.Filled.Folder, null) }, onClick = { nav.navigate("local") })
            ListRow(tr("android-more-settings", "Settings"), leading = { Icon(Icons.Filled.Settings, null) }, onClick = { nav.navigate("settings") })
            ListRow(tr("android-more-platform", "Open the Crowdly platform"), subtitle = app.prefs.platformUrl, leading = { Icon(Icons.AutoMirrored.Filled.OpenInNew, null) }, onClick = { openInBrowser(context, app.prefs.platformUrl) })
            HorizontalDivider()
            SectionTitle(tr("android-more-help", "Help"))
            ListRow(tr("android-more-bug", "Report a bug"), leading = { Icon(Icons.Filled.BugReport, null) }, onClick = { reporting = true })
            ListRow(tr("android-more-feedback", "Send feedback"), leading = { Icon(Icons.Filled.Feedback, null) }, onClick = { openInBrowser(context, "${app.prefs.platformUrl}/feedback") })
            ListRow(tr("android-more-desktop", "Get the desktop app"), leading = { Icon(Icons.Filled.Computer, null) }, onClick = { openInBrowser(context, "${app.prefs.platformUrl}/software") })
            HorizontalDivider()
            ListRow(tr("android-more-signout", "Sign out"), leading = { Icon(Icons.AutoMirrored.Filled.Logout, null) }, onClick = { confirmSignOut = true })
        }
    }
    if (reporting) ReportBugDialog { reporting = false }
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

            SectionTitle(tr("android-settings-start", "When the app starts"))
            var startTab by remember { mutableStateOf(app.prefs.startTab) }
            listOf("create" to tr("android-settings-start-create", "Start in Create"), "discover" to tr("android-settings-start-discover", "Start in Discover")).forEach { (v, label) ->
                Row(Modifier.fillMaxWidth().clickable { app.prefs.startTab = v; startTab = v }.padding(horizontal = 16.dp, vertical = 4.dp), verticalAlignment = Alignment.CenterVertically) {
                    RadioButton(startTab == v, onClick = { app.prefs.startTab = v; startTab = v })
                    Text(label)
                }
            }

            var restore by remember { mutableStateOf(app.prefs.launchRestore) }
            Row(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                AppText("android-settings-restore", "Reopen what I had open last time", Modifier.weight(1f))
                Switch(restore, { app.prefs.launchRestore = it; restore = it })
            }

            SectionTitle(tr("android-settings-editor", "Editor"))
            val live by app.prefs.liveCollab.collectAsState()
            Row(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) {
                    AppText("android-settings-live", "Live co-editing")
                    AppText("android-settings-live-sub", "See others' edits in a chapter you both have open, as they type.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
                Switch(live, { app.prefs.setLiveCollab(it) })
            }

            SectionTitle(tr("android-settings-reader", "Reader"))
            var readerTheme by remember { mutableStateOf(app.db.cacheGet("reader:theme") ?: "light") }
            var readerSize by remember { mutableStateOf(app.db.cacheGet("reader:size")?.toIntOrNull() ?: 18) }
            Row(Modifier.padding(horizontal = 16.dp), verticalAlignment = Alignment.CenterVertically) {
                listOf("light", "sepia", "dark").forEach { k ->
                    androidx.compose.material3.FilterChip(readerTheme == k, { readerTheme = k; app.db.cachePut("reader:theme", k) }, { Text(k) }, Modifier.padding(end = 6.dp))
                }
            }
            Row(Modifier.padding(horizontal = 16.dp), verticalAlignment = Alignment.CenterVertically) {
                AppText("android-settings-font", "Text size", Modifier.weight(1f))
                TextButton({ readerSize = (readerSize - 2).coerceAtLeast(12); app.db.cachePut("reader:size", "$readerSize") }) { Text("A−") }
                Text("$readerSize")
                TextButton({ readerSize = (readerSize + 2).coerceAtMost(32); app.db.cachePut("reader:size", "$readerSize") }) { Text("A+") }
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

            SectionTitle(tr("android-settings-account", "Account"))
            ListRow(tr("android-settings-signed-in", "Signed in as") + " " + user?.email.orEmpty())
            val ctx = androidx.compose.ui.platform.LocalContext.current
            ListRow(tr("android-settings-account-link", "Account, password and privacy on the platform"), onClick = { openInBrowser(ctx, "${app.prefs.platformUrl}/account-administration") })

            SectionTitle(tr("android-settings-about", "About"))
            ListRow("Crowdly for Android ${BuildConfig.VERSION_NAME} (${BuildConfig.VERSION_CODE})", subtitle = app.prefs.server)
        }
    }
}

/**
 * Help → Report a bug (the web app's ReportBugDialog): the same
 * support-requests pipeline as the platform and the desktop, tagged as
 * coming from the Android app.
 */
@Composable
fun ReportBugDialog(onDismiss: () -> Unit) {
    val app = crowdly
    val actions = rememberActions()
    val user by app.session.user.collectAsState()
    var subject by remember { mutableStateOf("") }
    var actual by remember { mutableStateOf("") }
    var expected by remember { mutableStateOf("") }
    val sent = tr("android-bug-sent", "Thank you, your report was sent.")
    androidx.compose.material3.AlertDialog(
        onDismissRequest = onDismiss,
        title = { AppText("android-more-bug", "Report a bug") },
        text = {
            Column(verticalArrangement = androidx.compose.foundation.layout.Arrangement.spacedBy(8.dp)) {
                OutlinedTextField(subject, { subject = it }, Modifier.fillMaxWidth(), singleLine = true, label = { AppText("android-bug-subject", "What went wrong, in a few words") })
                OutlinedTextField(actual, { actual = it }, Modifier.fillMaxWidth(), minLines = 3, label = { AppText("android-bug-actual", "What happened") })
                OutlinedTextField(expected, { expected = it }, Modifier.fillMaxWidth(), minLines = 2, label = { AppText("android-bug-expected", "What you expected") })
            }
        },
        confirmButton = {
            androidx.compose.material3.Button({
                actions.run(sent) {
                    val details = cloud.crowdly.app.net.jsonOf(
                        "area" to "android_app", "expected" to expected, "actual" to actual,
                        "appVersion" to "${BuildConfig.VERSION_NAME} (${BuildConfig.VERSION_CODE})",
                        "device" to "${android.os.Build.MANUFACTURER} ${android.os.Build.MODEL}, Android ${android.os.Build.VERSION.RELEASE}",
                    )
                    app.api.upload("POST", "/api/support-requests", mapOf(
                        "kind" to "bug", "name" to user?.email.orEmpty(), "email" to user?.email.orEmpty(), "category" to "other",
                        "subject" to subject.trim(), "message" to actual.trim().ifEmpty { subject.trim() }, "source" to "android", "details" to details.toString(),
                    ), emptyList())
                    onDismiss()
                }
            }, enabled = subject.isNotBlank()) { AppText("android-bug-send", "Send") }
        },
        dismissButton = { TextButton(onDismiss) { AppText("android-cancel", "Cancel") } },
    )
}
