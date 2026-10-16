package cloud.crowdly.core.sync

// The rules for syncing a folder on the phone with a Crowdly Space, the same
// as apps/web/src/lib/localfs.ts (and the desktop's Google Drive engine):
//  - every path remembers the hash both sides agreed on last time (baseline);
//  - only one side changed → copy it over; both changed → keep both (the
//    Space's version is saved next to yours as "name (Crowdly copy).ext");
//  - nothing is ever deleted by sync;
//  - dot-files/folders and .gitignore'd paths never sync.

enum class SyncAction { NONE, AGREE, UPLOAD, DOWNLOAD, KEEP_BOTH }

/** What to do with one path, given its local hash, the Space's hash and the last agreed hash. */
fun decide(local: String?, remote: String?, remoteExists: Boolean, base: String?): SyncAction = when {
    local != null && remote != null && local == remote -> SyncAction.AGREE
    local != null && (!remoteExists || remote == null) -> SyncAction.UPLOAD // new here, or no content there yet
    local == null && remote != null -> if (base != null) SyncAction.NONE else SyncAction.DOWNLOAD // deleted here: never delete remotely
    local != null && remote != null -> when (base) {
        remote -> SyncAction.UPLOAD
        local -> SyncAction.DOWNLOAD
        else -> SyncAction.KEEP_BOTH
    }
    else -> SyncAction.NONE
}

/** "notes/a.md" → "notes/a (Crowdly copy).md". */
fun crowdlyCopyName(path: String): String {
    val dot = path.lastIndexOf('.')
    return if (dot > path.lastIndexOf('/')) "${path.substring(0, dot)} (Crowdly copy)${path.substring(dot)}" else "$path (Crowdly copy)"
}

/** .gitignore rules plus "dot-files never sync" (Documentation/Keep_git-ignored_and_dot-file_junk_out_of_Spaces_all_sync_paths.md). */
class IgnoreRules(gitignore: String?) {
    private data class Rule(val re: Regex, val dirOnly: Boolean)
    private val rules: List<Rule> = gitignore.orEmpty().lines().mapNotNull { raw ->
        var line = raw.trim()
        if (line.isEmpty() || line.startsWith("#") || line.startsWith("!")) return@mapNotNull null
        val dirOnly = line.endsWith("/")
        line = line.removeSuffix("/")
        val anchored = line.startsWith("/") || "/" in line
        val body = globToRe(line.removePrefix("/"))
        Rule(Regex(if (anchored) "^$body(/|$)" else "(^|/)$body(/|$)"), dirOnly)
    }

    fun ignored(path: String, isDir: Boolean): Boolean =
        path.split('/').any { it.startsWith(".") } || rules.any { (!it.dirOnly || isDir) && it.re.containsMatchIn(path) }

    private fun globToRe(glob: String): String = buildString {
        var i = 0
        while (i < glob.length) {
            val c = glob[i]
            when {
                c == '*' && i + 1 < glob.length && glob[i + 1] == '*' -> { append(".*"); i++ }
                c == '*' -> append("[^/]*")
                c == '?' -> append("[^/]")
                c in ".+^\${}()|[]\\" -> { append('\\'); append(c) }
                else -> append(c)
            }
            i++
        }
    }
}
