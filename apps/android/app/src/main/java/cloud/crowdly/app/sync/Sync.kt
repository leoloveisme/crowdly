package cloud.crowdly.app.sync

import android.net.Uri
import cloud.crowdly.app.data.Db
import cloud.crowdly.app.data.Repo
import cloud.crowdly.app.data.Session
import cloud.crowdly.app.data.WorkIo
import cloud.crowdly.app.data.WorkKind
import cloud.crowdly.app.net.Api
import cloud.crowdly.app.net.ApiError
import cloud.crowdly.app.net.JsonCodec
import cloud.crowdly.app.net.asObject
import cloud.crowdly.app.net.asObjects
import cloud.crowdly.app.net.bool
import cloud.crowdly.app.net.jsonOf
import cloud.crowdly.app.net.objects
import cloud.crowdly.app.net.qs
import cloud.crowdly.app.net.s
import cloud.crowdly.app.net.str
import cloud.crowdly.app.ui.create.diffSuggestions
import cloud.crowdly.core.formats.parseComic
import cloud.crowdly.core.formats.parseScreenplay
import cloud.crowdly.core.formats.parseStory
import cloud.crowdly.core.sync.SyncAction
import cloud.crowdly.core.sync.applyComicIds
import cloud.crowdly.core.sync.applyScreenplayIds
import cloud.crowdly.core.sync.comicSuggestions
import cloud.crowdly.core.sync.comicSyncPayload
import cloud.crowdly.core.sync.crowdlyCopyName
import cloud.crowdly.core.sync.decide
import cloud.crowdly.core.sync.screenplaySuggestions
import cloud.crowdly.core.sync.screenplaySyncPayload
import cloud.crowdly.core.sync.storySyncChapters
import cloud.crowdly.core.sync.stripIds
import cloud.crowdly.core.sync.syncComicAlternatives
import cloud.crowdly.core.sync.syncScreenplayBranches
import cloud.crowdly.core.sync.syncStoryBranches
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

data class FolderReport(val uploaded: List<String>, val downloaded: List<String>, val conflicts: List<String>, val errors: List<String>)

/**
 * Two kinds of sync for files on the phone:
 * - [syncFolder]: a whole folder with a Crowdly Space (apps/web localfs.ts syncFolder);
 * - [syncWorkFile]: one .story/.screenplay/.comic file with its Crowdly work,
 *   the desktop's web sync (content sync, ids written back, branch sync,
 *   suggestions when the user isn't on the team; Documentation/branching-api.md).
 *   What the desktop keeps in xattrs lives in [Db] file_state, keyed by URI.
 */
class Syncer(private val api: Api, private val repo: Repo, private val io: WorkIo, private val session: Session, private val db: Db, private val files: LocalFiles) {

    suspend fun syncFolder(folder: LocalFolder, spaceId: String, progress: (String) -> Unit = {}): FolderReport = withContext(Dispatchers.IO) {
        val up = mutableListOf<String>(); val down = mutableListOf<String>(); val both = mutableListOf<String>(); val errors = mutableListOf<String>()
        fun base(p: String) = db.fileStateGet(folder.uri, "base:$p")
        fun setBase(p: String, h: String) = db.fileStatePut(folder.uri, "base:$p", h)

        progress("Reading the folder…")
        val local = files.listTree(folder.uri).filter { !it.isDir }.associate { e -> val b = files.readBytes(e.uri); e.path to (e to b) }
        val localHash = local.mapValues { LocalFiles.sha256(it.value.second) }

        progress("Reading the Space…")
        val items = api.get("/creative-spaces/$spaceId/sync" + qs("userId" to session.userId)).asObject().objects("items").filter { !it.bool("deleted") }
        val remote = items.filter { it.s("kind") == "file" }.associateBy { it.s("relative_path").trimStart('/') }
        val remoteFolders = items.filter { it.s("kind") == "folder" }.map { it.s("relative_path").trimStart('/') }.toMutableSet()
        val rules = files.ignoreRules(folder.uri)

        suspend fun ensureFolders(path: String) {
            val parts = path.split('/').dropLast(1)
            for (i in parts.indices) {
                val p = parts.subList(0, i + 1).joinToString("/")
                if (p in remoteFolders) continue
                runCatching { repo.createFolder(spaceId, parts.subList(0, i).joinToString("/"), parts[i]) }
                remoteFolders += p
            }
        }
        suspend fun upload(path: String, bytes: ByteArray, existing: JsonObject?) {
            ensureFolders(path)
            val parent = path.substringBeforeLast('/', "")
            val name = path.substringAfterLast('/')
            val mime = WorkIo.mimeOf(name.substringAfterLast('.', ""))
            val id = existing?.str("id") ?: repo.items(spaceId, parent).second.firstOrNull { !it.isFolder && it.name == name }?.id ?: repo.createFile(spaceId, parent, name, mime, bytes.size.toLong()).id
            repo.uploadContent(spaceId, id, name, mime, bytes)
        }
        suspend fun download(item: JsonObject) = repo.bytes(repo.contentPath(spaceId, item.s("id")))

        for (path in (local.keys + remote.keys).sorted()) {
            if (rules.ignored(path, false)) continue
            val l = local[path]
            val r = remote[path]
            val lh = localHash[path]
            val rh = r?.str("hash")
            try {
                when (decide(lh, rh, r != null, base(path))) {
                    SyncAction.AGREE -> setBase(path, lh!!)
                    SyncAction.UPLOAD -> { progress("Uploading $path"); upload(path, l!!.second, r); setBase(path, lh!!); up += path }
                    SyncAction.DOWNLOAD -> {
                        progress("Downloading $path")
                        files.write(folder.uri, path, download(r!!), WorkIo.mimeOf(path.substringAfterLast('.', "")))
                        setBase(path, rh!!); down += path
                    }
                    SyncAction.KEEP_BOTH -> {
                        progress("Keeping both versions of $path")
                        files.write(folder.uri, crowdlyCopyName(path), download(r!!))
                        upload(path, l!!.second, r)
                        setBase(path, lh!!); both += path
                    }
                    SyncAction.NONE -> Unit
                }
            } catch (e: Exception) { errors += "$path: ${e.message}" }
        }
        files.update(folder.copy(spaceId = spaceId, lastSyncedAt = java.time.Instant.now().toString()))
        FolderReport(up, down, both, errors)
    }

    data class WorkSync(val text: String, val kind: WorkKind, val id: String, val message: String)

    /**
     * Syncs one Crowdly-format file with its work and returns the new file text
     * (ids written back, others' branches pulled in). [folder]/[path] locate
     * the file inside an opened folder so relative comic images resolve.
     */
    suspend fun syncWorkFile(uri: Uri, text: String, folder: LocalFolder?, path: String?): WorkSync = withContext(Dispatchers.IO) {
        val key = uri.toString()
        val ext = files.name(uri).substringAfterLast('.').lowercase()
        fun state(n: String) = db.fileStateGet(key, n)
        fun setState(n: String, v: String) = db.fileStatePut(key, n, v)
        fun known() = state("branch_ids")?.let { LocalFiles.strings(JsonCodec.parseToJsonElement(it) as? JsonArray) }.orEmpty()
        fun setKnown(ids: List<String>) = setState("branch_ids", JsonArray(ids.map { JsonPrimitive(it) }).toString())
        fun send(path: String): (List<JsonObject>) -> JsonObject? = { entries -> runBlocking { api.post(path, jsonOf("branches" to entries)).asObject() } }

        when (ext) {
            "story" -> {
                var id = state("story_id")
                if (id == null) {
                    // First link: ids came from elsewhere; create the story, then sync branches as usual.
                    val clean = stripIds(text)
                    val doc = parseStory(clean)
                    id = io.createStoryFromDoc(doc.copy(chapters = doc.chapters.map { it.copy(branches = emptyMap()) }), folder?.spaceId)
                    setState("story_id", id)
                    val out = syncStoryBranches(clean, repo.chapters(id).map { it.id }, emptyList(), send("/stories/$id/branches/sync"))
                    setKnown(out.knownIds)
                    return@withContext WorkSync(out.text, WorkKind.STORY, id, "Created the story on Crowdly")
                }
                val (title, chapters) = storySyncChapters(text)
                try {
                    api.post("/story-titles/$id/sync-desktop", jsonOf("userId" to session.userId, "title" to title, "chapters" to chapters, "metadata" to JsonObject(emptyMap()), "bodyType" to "story", "creativeSpaceId" to folder?.spaceId))
                } catch (e: ApiError) {
                    if (e.status != 403) throw e
                    // Not on the team: send the differences as suggestions instead.
                    val server = repo.chapters(id)
                    val doc = parseStory(text)
                    var n = 0
                    doc.chapters.forEachIndexed { i, ch ->
                        val s = server.getOrNull(i) ?: return@forEachIndexed
                        for (p in diffSuggestions(s.id, s.title, ch.title, s.paragraphs, ch.paragraphs)) { repo.createProposal(id, p); n++ }
                    }
                    return@withContext WorkSync(text, WorkKind.STORY, id, "$n suggestion(s) sent to the author")
                }
                val chapterIds = repo.chapters(id).map { it.id }
                val out = syncStoryBranches(text, chapterIds, known(), send("/stories/$id/branches/sync"))
                setKnown(out.knownIds)
                WorkSync(out.text, WorkKind.STORY, id, "Synced with Crowdly")
            }
            "screenplay" -> {
                var id = state("screenplay_id")
                val text = if (id == null) stripIds(text) else text
                if (id == null) { id = repo.createScreenplay(parseScreenplay(text).title); setState("screenplay_id", id) }
                val payload = screenplaySyncPayload(text)
                val res = try {
                    api.post("/screenplays/$id/sync-desktop", jsonOf("title" to payload.title, "scenes" to payload.scenes)).asObject()
                } catch (e: ApiError) {
                    if (e.status != 403) throw e
                    val (scenes, blocks) = repo.scenes(id)
                    val proposals = screenplaySuggestions(text, blocks.associate { it.id to it.text }, scenes.associate { it.id to it.slugline })
                    proposals.forEach { repo.createWorkProposal(WorkKind.SCREENPLAY, id, it) }
                    return@withContext WorkSync(text, WorkKind.SCREENPLAY, id, "${proposals.size} suggestion(s) sent to the owner")
                }
                val withIds = applyScreenplayIds(text, res.objects("scenes"))
                val out = syncScreenplayBranches(withIds, known(), send("/screenplays/$id/branches/sync"))
                setKnown(out.knownIds)
                WorkSync(out.text, WorkKind.SCREENPLAY, id, "Synced with Crowdly")
            }
            "comic" -> {
                val text = if (state("comic_id") == null) stripIds(text) else text
                val doc = parseComic(text)
                var id = state("comic_id")
                if (id == null) { id = repo.createComic(doc.title); setState("comic_id", id) }
                // Upload each local image once; remember src → Crowdly URL (desktop: comic_image_urls).
                val urls = state("comic_image_urls")?.let { (JsonCodec.parseToJsonElement(it) as? JsonObject)?.mapValues { v -> (v.value as JsonPrimitive).content } }.orEmpty().toMutableMap()
                val sources = doc.issues.flatMap { i -> i.pages.flatMap { p -> listOf(p.src) + p.alternatives.orEmpty().map { it.src } } }.distinct()
                for (src in sources) {
                    if (src in urls || Regex("^(https?:|/)").containsMatchIn(src)) continue
                    val f = resolveLocal(uri, folder, path, src) ?: continue
                    val r = api.upload("POST", "/comics/$id/page-images", emptyMap(), listOf(Api.FilePart("image", f.name, f.mime, f.bytes))).asObject()
                    r.str("url")?.let { urls[src] = it }
                }
                setState("comic_image_urls", JsonObject(urls.mapValues { JsonPrimitive(it.value) }).toString())
                val imageUrl = { src: String -> urls[src] ?: src }
                val res = try {
                    api.post("/comics/$id/sync-desktop", comicSyncPayload(text, imageUrl)).asObject()
                } catch (e: ApiError) {
                    if (e.status != 403) throw e
                    val c = repo.comic(id)
                    val proposals = comicSuggestions(text, c.pages.associate { p -> p.id to p.overlays.map { it.json() } })
                    proposals.forEach { repo.createWorkProposal(WorkKind.COMIC, id, it) }
                    return@withContext WorkSync(text, WorkKind.COMIC, id, "${proposals.size} suggestion(s) sent to the owner")
                }
                val withIds = applyComicIds(text, res.objects("issues"))
                val out = syncComicAlternatives(withIds, known(), send("/comics/$id/branches/sync"), imageUrl)
                setKnown(out.knownIds)
                WorkSync(out.text, WorkKind.COMIC, id, "Synced with Crowdly")
            }
            else -> error("Only .story, .screenplay and .comic files sync with a Crowdly work")
        }
    }

    /** The Crowdly work a file is linked to, if it has synced before. */
    fun linkedWork(uri: Uri): Pair<WorkKind, String>? {
        val key = uri.toString()
        db.fileStateGet(key, "story_id")?.let { return WorkKind.STORY to it }
        db.fileStateGet(key, "screenplay_id")?.let { return WorkKind.SCREENPLAY to it }
        db.fileStateGet(key, "comic_id")?.let { return WorkKind.COMIC to it }
        return null
    }

    private suspend fun resolveLocal(uri: Uri, folder: LocalFolder?, path: String?, src: String): Api.FilePart? {
        if (folder == null || path == null) return null
        val dir = path.substringBeforeLast('/', "")
        val full = cloud.crowdly.app.ui.spaces.resolveLabel(dir, src)
        val u = files.find(folder.uri, full) ?: return null
        val name = full.substringAfterLast('/')
        return Api.FilePart("image", name, WorkIo.mimeOf(name.substringAfterLast('.', "")), files.readBytes(u))
    }
}

