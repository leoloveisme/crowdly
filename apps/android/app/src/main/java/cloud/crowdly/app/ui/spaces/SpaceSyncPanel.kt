package cloud.crowdly.app.ui.spaces

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import cloud.crowdly.app.crowdly
import cloud.crowdly.app.data.SyncStatus
import cloud.crowdly.app.i18n.AppText
import cloud.crowdly.app.i18n.tr
import cloud.crowdly.app.net.bool
import cloud.crowdly.app.net.objects
import cloud.crowdly.app.net.str
import cloud.crowdly.app.ui.components.ListRow
import cloud.crowdly.app.ui.components.SectionTitle
import cloud.crowdly.app.ui.components.rememberActions
import cloud.crowdly.app.ui.more.openInBrowser

/**
 * A Space's GitHub and Google Drive sync (SpaceSyncPanel.tsx). Connecting
 * for the first time starts on crowdly.cloud, where the OAuth and GitHub App
 * callbacks point (Documentation/Web_app_deploy.md, "How sign-in works");
 * after that everything works here.
 */
@Composable
fun SpaceSyncPanel(spaceId: String) {
    val app = crowdly
    val context = LocalContext.current
    val actions = rememberActions()
    var status by remember { mutableStateOf<SyncStatus?>(null) }
    var repos by remember { mutableStateOf<List<String>?>(null) }
    var trail by remember { mutableStateOf(listOf("root" to "My Drive")) }
    var folders by remember { mutableStateOf<List<Pair<String, String>>?>(null) }
    var tick by remember { mutableIntStateOf(0) }
    LaunchedEffect(spaceId, tick) { status = app.repo.syncStatus(spaceId) }
    fun connectOnPlatform() = openInBrowser(context, "${app.prefs.platformUrl}/creative_space/$spaceId")
    fun whenText(d: String?) = d?.take(16)?.replace('T', ' ') ?: "—"

    Column(Modifier.heightIn(max = 640.dp).verticalScroll(rememberScrollState()).padding(bottom = 24.dp)) {
        AppText("android-sync-title", "Sync this Space", Modifier.padding(horizontal = 16.dp), style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
        val gh = status?.github
        SectionTitle("GitHub")
        when {
            gh == null -> AppText("android-sync-github-off", "GitHub sync isn't available on this server.", Modifier.padding(horizontal = 16.dp))
            gh.bool("connected") -> {
                ListRow("${gh.str("repo")} (${gh.str("branch")})", subtitle = tr("android-sync-last", "last synced") + " " + whenText(gh.str("lastSyncedAt")))
                Row(Modifier.padding(horizontal = 16.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Switch(gh.bool("enabled"), { v -> actions.run { app.repo.githubToggle(spaceId, v); tick++ } })
                    AppText("android-sync-on", "Sync on")
                    OutlinedButton({ actions.run(tr0("Synced")) { app.repo.githubRun(spaceId); tick++ } }) { AppText("android-sync-now", "Sync now") }
                    TextButton({ actions.run { app.repo.githubDisconnect(spaceId); tick++ } }) { AppText("android-sync-disconnect", "Disconnect") }
                }
            }
            gh.str("existingInstallationId") != null -> {
                Text("${tr("android-sync-github-pick", "Choose a repository from")} ${gh.str("existingInstallationAccount") ?: "GitHub"}:", Modifier.padding(horizontal = 16.dp))
                if (repos == null) TextButton({ actions.run { repos = app.repo.githubRepos(spaceId, gh.str("existingInstallationId")!!) } }, Modifier.padding(horizontal = 8.dp)) { AppText("android-sync-github-list", "Show repositories") }
                repos?.forEach { r -> ListRow(r, onClick = { actions.run { app.repo.githubConnect(spaceId, gh.str("existingInstallationId")!!, r); tick++ } }) }
            }
            else -> Button({ connectOnPlatform() }, Modifier.padding(horizontal = 16.dp)) { AppText("android-sync-github-connect", "Connect a GitHub repository") }
        }

        val drive = status?.drive
        SectionTitle("Google Drive")
        when {
            drive == null || !drive.bool("configured", true) -> AppText("android-sync-drive-off", "Google Drive sync isn't available on this server.", Modifier.padding(horizontal = 16.dp))
            drive.bool("connected") -> {
                ListRow("${drive.str("folderName")} (${drive.str("googleEmail").orEmpty()})", subtitle = tr("android-sync-last", "last synced") + " " + whenText(drive.str("lastSyncedAt")))
                Row(Modifier.padding(horizontal = 16.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Switch(drive.bool("enabled"), { v -> actions.run { app.repo.driveToggle(spaceId, v); tick++ } })
                    AppText("android-sync-on", "Sync on")
                    OutlinedButton({ actions.run(tr0("Synced")) { app.repo.driveRun(spaceId); tick++ } }) { AppText("android-sync-now", "Sync now") }
                    TextButton({ actions.run { app.repo.driveDisconnect(spaceId); tick++ } }) { AppText("android-sync-disconnect", "Disconnect") }
                }
                val log = drive.objects("recentLog")
                if (log.isNotEmpty()) {
                    AppText("android-sync-drive-log", "Sync log", Modifier.padding(start = 16.dp, top = 8.dp), fontWeight = FontWeight.SemiBold)
                    log.take(10).forEach { e -> Text("${whenText(e.str("created_at"))} ${e.str("action").orEmpty()} ${e.str("path") ?: e.str("detail") ?: e.str("message").orEmpty()}", Modifier.padding(horizontal = 16.dp), style = MaterialTheme.typography.bodySmall) }
                }
            }
            drive.bool("hasGoogleAccount") -> {
                Text(trail.joinToString(" / ") { it.second }, Modifier.padding(horizontal = 16.dp), fontWeight = FontWeight.SemiBold)
                if (folders == null) TextButton({ actions.run { folders = app.repo.driveFolders(spaceId, trail.last().first) } }, Modifier.padding(horizontal = 8.dp)) { AppText("android-sync-drive-browse", "Choose a folder") }
                folders?.forEach { (fid, fname) -> ListRow(fname, onClick = { trail = trail + (fid to fname); actions.run { folders = app.repo.driveFolders(spaceId, fid) } }) }
                if (folders != null) Button({ actions.run { app.repo.driveConnect(spaceId, trail.last().first); tick++ } }, Modifier.padding(horizontal = 16.dp)) { AppText("android-sync-drive-use", "Sync this Space with this folder") }
            }
            else -> Button({ connectOnPlatform() }, Modifier.padding(horizontal = 16.dp)) { AppText("android-sync-drive-connect", "Connect Google Drive") }
        }
    }
}

private fun tr0(s: String) = s
