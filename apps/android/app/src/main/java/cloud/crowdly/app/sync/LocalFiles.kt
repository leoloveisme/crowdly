package cloud.crowdly.app.sync

import android.content.Context
import android.content.Intent
import android.net.Uri
import androidx.documentfile.provider.DocumentFile
import cloud.crowdly.app.data.Db
import cloud.crowdly.app.net.JsonCodec
import cloud.crowdly.app.net.asObjects
import cloud.crowdly.app.net.jsonOf
import cloud.crowdly.app.net.s
import cloud.crowdly.app.net.str
import cloud.crowdly.core.sync.IgnoreRules
import java.security.MessageDigest
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive

/** A folder on the phone the user opened (a Storage Access Framework tree), optionally linked to a Space. */
data class LocalFolder(val uri: String, val name: String, val spaceId: String?, val lastSyncedAt: String?) {
    fun json() = jsonOf("uri" to uri, "name" to name, "spaceId" to spaceId, "lastSyncedAt" to lastSyncedAt)
    companion object { fun from(o: JsonObject) = LocalFolder(o.s("uri"), o.s("name"), o.str("spaceId"), o.str("lastSyncedAt")) }
}

data class LocalEntry(val path: String, val name: String, val isDir: Boolean, val uri: Uri)

/**
 * Files on this phone, through the Storage Access Framework: the Android
 * counterpart of apps/web/src/lib/localfs.ts (File System Access API) and the
 * desktop's local Spaces. Folder permissions are persisted, so a folder stays
 * open across restarts.
 */
class LocalFiles(private val context: Context, private val db: Db) {
    fun folders(): List<LocalFolder> =
        db.cacheGet("local:folders")?.let { runCatching { (JsonCodec.parseToJsonElement(it) as JsonArray).asObjects().map { o -> LocalFolder.from(o) } }.getOrNull() }.orEmpty()

    fun saveFolders(list: List<LocalFolder>) = db.cachePut("local:folders", JsonArray(list.map { it.json() }).toString())

    fun addFolder(uri: Uri): LocalFolder {
        context.contentResolver.takePersistableUriPermission(uri, Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_WRITE_URI_PERMISSION)
        val name = DocumentFile.fromTreeUri(context, uri)?.name ?: uri.lastPathSegment ?: "Folder"
        val f = LocalFolder(uri.toString(), name, null, null)
        saveFolders(folders().filter { it.uri != f.uri } + f)
        return f
    }

    fun update(f: LocalFolder) = saveFolders(folders().map { if (it.uri == f.uri) f else it })

    fun forget(f: LocalFolder) {
        runCatching { context.contentResolver.releasePersistableUriPermission(Uri.parse(f.uri), Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_WRITE_URI_PERMISSION) }
        saveFolders(folders().filter { it.uri != f.uri })
    }

    private fun root(tree: String) = DocumentFile.fromTreeUri(context, Uri.parse(tree)) ?: error("The folder isn't available any more")

    suspend fun ignoreRules(tree: String): IgnoreRules = withContext(Dispatchers.IO) {
        IgnoreRules(root(tree).findFile(".gitignore")?.let { readText(it.uri) })
    }

    /** Every file and folder under [tree], minus dot-files and .gitignore'd paths. */
    suspend fun listTree(tree: String): List<LocalEntry> = withContext(Dispatchers.IO) {
        val rules = ignoreRules(tree)
        val out = mutableListOf<LocalEntry>()
        fun walk(dir: DocumentFile, prefix: String) {
            for (f in dir.listFiles()) {
                val name = f.name ?: continue
                val path = if (prefix.isEmpty()) name else "$prefix/$name"
                if (rules.ignored(path, f.isDirectory)) continue
                out += LocalEntry(path, name, f.isDirectory, f.uri)
                if (f.isDirectory) walk(f, path)
            }
        }
        walk(root(tree), "")
        out.sortedBy { it.path.lowercase() }
    }

    suspend fun readBytes(uri: Uri): ByteArray = withContext(Dispatchers.IO) { context.contentResolver.openInputStream(uri)!!.use { it.readBytes() } }
    suspend fun readText(uri: Uri): String = readBytes(uri).toString(Charsets.UTF_8)

    suspend fun writeText(uri: Uri, text: String) = withContext(Dispatchers.IO) {
        context.contentResolver.openOutputStream(uri, "wt")!!.use { it.write(text.toByteArray()) }
    }

    /** Writes [bytes] at [path] inside [tree], creating folders and the file as needed. */
    suspend fun write(tree: String, path: String, bytes: ByteArray, mime: String = "application/octet-stream"): Uri = withContext(Dispatchers.IO) {
        var dir = root(tree)
        val parts = path.split('/').filter { it.isNotEmpty() }
        for (p in parts.dropLast(1)) dir = dir.findFile(p)?.takeIf { it.isDirectory } ?: dir.createDirectory(p) ?: error("Couldn't create $p")
        val name = parts.last()
        val file = dir.findFile(name) ?: dir.createFile(mime, name) ?: error("Couldn't create $name")
        context.contentResolver.openOutputStream(file.uri, "wt")!!.use { it.write(bytes) }
        file.uri
    }

    /** Finds a file at [path] (relative to [tree]). */
    suspend fun find(tree: String, path: String): Uri? = withContext(Dispatchers.IO) {
        var d: DocumentFile? = root(tree)
        for (p in path.split('/').filter { it.isNotEmpty() && it != "." }) d = d?.findFile(p)
        d?.takeIf { it.isFile }?.uri
    }

    fun name(uri: Uri): String = DocumentFile.fromSingleUri(context, uri)?.name ?: uri.lastPathSegment?.substringAfterLast('/') ?: "file"

    companion object {
        fun sha256(bytes: ByteArray): String = MessageDigest.getInstance("SHA-256").digest(bytes).joinToString("") { "%02x".format(it) }
        fun strings(a: JsonArray?) = a?.mapNotNull { (it as? JsonPrimitive)?.content }.orEmpty()
    }
}
