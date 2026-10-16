package cloud.crowdly.app.data

import cloud.crowdly.app.net.Api
import cloud.crowdly.app.net.ApiError
import cloud.crowdly.app.net.asObject
import cloud.crowdly.app.net.asObjects
import cloud.crowdly.app.net.bool
import cloud.crowdly.app.net.double
import cloud.crowdly.app.net.enc
import cloud.crowdly.app.net.int
import cloud.crowdly.app.net.jsonOf
import cloud.crowdly.app.net.obj
import cloud.crowdly.app.net.objects
import cloud.crowdly.app.net.qs
import cloud.crowdly.app.net.s
import cloud.crowdly.app.net.str
import java.security.MessageDigest
import java.util.zip.ZipInputStream
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.RequestBody.Companion.toRequestBody

// Discovery mode (apps/web/src/lib/discovery.ts; backend shelves.js and
// library.js): browse Crowdly, my library, shelves (manual + smart), reading
// positions, sessions and highlights.

data class ShelfItem(
    val type: String, val id: String, val entryId: String?, val title: String, val subtitle: String?, val author: String?,
    val format: String?, val progress: Double?, val favorite: Boolean, val living: Boolean, val lived: Boolean, val cover: String?,
) {
    /** The reader route kind: library items read as "library". */
    val readKind get() = if (type == "library_item") "library" else type
    companion object {
        fun from(o: JsonObject): ShelfItem {
            val st = o.obj("status")
            return ShelfItem(
                o.s("type"), o.s("id"), o.str("entry_id"), o.s("title"), o.str("subtitle"), o.str("author"), o.str("format"), o.double("progress"),
                st?.bool("favorite") == true, st?.bool("living") == true, st?.bool("lived") == true, o.str("cover_url"),
            )
        }
    }
}

data class SmartRule(val field: String, val op: String, val value: String)
data class SmartRules(val match: String, val rules: List<SmartRule>) {
    fun json() = jsonOf("match" to match, "rules" to rules.map { r ->
        val spec = RULE_FIELDS[r.field]
        buildJsonObject { put("field", r.field); put("op", r.op); if (spec?.type == "days") put("value", r.value.toIntOrNull() ?: 30) else put("value", r.value) }
    })
    companion object {
        fun from(o: JsonObject?) = o?.let { SmartRules(it.str("match") ?: "all", it.objects("rules").map { r -> SmartRule(r.s("field"), r.s("op"), (r["value"] as? JsonPrimitive)?.content.orEmpty()) }) }
    }
}

data class Shelf(val id: String, val name: String, val description: String?, val kind: String, val rules: SmartRules?, val count: Int?) {
    companion object { fun from(o: JsonObject) = Shelf(o.s("id"), o.s("name"), o.str("description"), o.str("kind") ?: "manual", SmartRules.from(o.obj("rules")), o.int("count")) }
}

data class LibraryItem(val id: String, val kind: String, val storyId: String?, val title: String, val author: String?, val format: String, val size: Long?, val hasFile: Boolean, val hasCover: Boolean, val rights: String) {
    companion object {
        fun from(o: JsonObject) = LibraryItem(o.s("id"), o.s("kind"), o.str("story_title_id"), o.s("title"), o.str("author"), o.str("format") ?: "text", o.int("size")?.toLong(), o.bool("has_file"), o.bool("has_cover"), o.s("rights_status"))
    }
}

data class RuleField(val label: String, val ops: List<String>, val values: List<String>? = null, val type: String? = null)

val RULE_FIELDS = linkedMapOf(
    "source" to RuleField("Source", listOf("is"), listOf("library", "crowdly")),
    "format" to RuleField("Format", listOf("is"), listOf("epub", "pdf", "audio", "text", "story", "screenplay", "comic")),
    "language" to RuleField("Language", listOf("is"), type = "text"),
    "title" to RuleField("Title", listOf("contains"), type = "text"),
    "author" to RuleField("Author", listOf("contains"), type = "text"),
    "status" to RuleField("Status", listOf("is"), listOf("favorite", "living", "lived")),
    "progress" to RuleField("Progress", listOf("is"), listOf("unread", "reading", "finished")),
    "added_within_days" to RuleField("Added in the last … days", listOf("lte"), type = "days"),
    "read_within_days" to RuleField("Read in the last … days", listOf("lte"), type = "days"),
)

/** Library formats by file extension (discovery.ts FORMAT_BY_EXT). */
val FORMAT_BY_EXT = mapOf(
    "epub" to "epub", "pdf" to "pdf", "txt" to "text", "md" to "text", "markdown" to "text",
    "mp3" to "audio", "m4a" to "audio", "m4b" to "audio", "ogg" to "audio", "opus" to "audio", "wav" to "audio", "flac" to "audio", "aac" to "audio",
)

class Discovery(private val api: Api, private val prefs: Prefs) {
    suspend fun home(): List<Pair<String, List<ShelfItem>>> =
        api.getCached("/discover/home", "disc:").asObject().objects("rows").map { it.s("key") to it.objects("items").map { i -> ShelfItem.from(i) } }

    data class SearchResult(val type: String, val id: String, val title: String, val subtitle: String?)
    suspend fun search(q: String) = api.get("/search" + qs("q" to q, "limit" to 30)).asObject().objects("results").map {
        SearchResult(it.s("type"), it.s("id").substringAfter(':'), it.s("title"), it.str("subtitle"))
    }.filter { it.type != "user" }

    suspend fun shelves(): Pair<List<Pair<String, Int?>>, List<Shelf>> {
        val o = api.getCached("/shelves", "disc:").asObject()
        return o.objects("system").map { it.s("key") to it.int("count") } to o.objects("custom").map { Shelf.from(it) }
    }
    suspend fun shelfItems(key: String) = api.getCached("/shelves/${enc(key)}/items", "disc:").asObject().objects("items").map { ShelfItem.from(it) }
    suspend fun createShelf(name: String, kind: String, rules: SmartRules? = null) = Shelf.from(api.post("/shelves", jsonOf("name" to name, "kind" to kind, "rules" to rules?.json())).asObject().obj("shelf")!!)
    suspend fun updateShelf(id: String, name: String? = null, rules: SmartRules? = null) = api.patch("/shelves/$id", jsonOf("name" to name, "rules" to rules?.json()))
    suspend fun deleteShelf(id: String) = api.delete("/shelves/$id")
    suspend fun reorderShelves(ids: List<String>) = api.put("/shelves/order", jsonOf("ids" to ids))
    suspend fun addToShelf(shelfId: String, type: String, id: String) = api.post("/shelves/$shelfId/items", jsonOf("type" to type, "id" to id))
    suspend fun removeFromShelf(shelfId: String, type: String, id: String) = api.delete("/shelves/$shelfId/items/${enc(id)}" + qs("type" to type))
    suspend fun reorderShelfItems(shelfId: String, entryIds: List<String>) = api.put("/shelves/$shelfId/items/order", jsonOf("ids" to entryIds))
    suspend fun setStatus(type: String, id: String, favorite: Boolean? = null, living: Boolean? = null, lived: Boolean? = null) =
        api.put("/me/story-status", jsonOf(
            "contentType" to type,
            (when (type) { "story" -> "storyTitleId"; "screenplay" -> "screenplayId"; else -> "comicId" }) to id,
            "isFavorite" to favorite, "isLiving" to living, "isLived" to lived,
        ))

    suspend fun library() = api.getCached("/library/items", "disc:").asObject().objects("items").map { LibraryItem.from(it) }
    suspend fun libraryItem(id: String) = library().firstOrNull { it.id == id }
    suspend fun addLibraryStory(storyId: String) = LibraryItem.from(api.post("/library/items", jsonOf("kind" to "crowdly_story", "storyTitleId" to storyId)).asObject().obj("item")!!)
    suspend fun deleteLibraryItem(id: String) = api.delete("/library/items/$id")
    fun libraryFilePath(id: String) = "/library/items/$id/file"
    fun libraryCoverUrl(id: String) = api.url("/library/items/$id/cover")

    /** Imports a book (discovery.ts importToLibrary): refuses DRM-protected EPUB/PDF files. */
    suspend fun importBook(name: String, bytes: ByteArray, rights: String): LibraryItem {
        val ext = name.substringAfterLast('.', "").lowercase()
        val format = FORMAT_BY_EXT[ext] ?: throw ApiError(400, "This file type isn't supported (EPUB, PDF, text, Markdown or audio).")
        if (format == "epub" && isDrmEpub(bytes)) throw ApiError(400, "This book is DRM-protected, so it can't be added to your library.")
        if (format == "pdf" && String(bytes, 0, minOf(bytes.size, 4_000_000), Charsets.ISO_8859_1).contains("/Encrypt"))
            throw ApiError(400, "This PDF is encrypted (DRM), so it can't be added to your library.")
        val title = name.substringBeforeLast('.').replace(Regex("[_-]+"), " ")
        val sha = MessageDigest.getInstance("SHA-256").digest(bytes).joinToString("") { "%02x".format(it) }
        val item = LibraryItem.from(api.post("/library/items", jsonOf("kind" to "imported_book", "title" to title, "format" to format, "sha256" to sha, "size" to bytes.size, "rightsStatus" to rights)).asObject().obj("item")!!)
        if (!item.hasFile) api.request("PUT", "/library/items/${item.id}/file", bytes.toRequestBody("application/octet-stream".toMediaType()))
        return item
    }

    /** EPUBs with an encryption.xml carrying non-font algorithms are DRM-locked (desktop library/drm.py). */
    private fun isDrmEpub(bytes: ByteArray): Boolean {
        var enc: String? = null
        var rights = false
        ZipInputStream(bytes.inputStream()).use { z ->
            while (true) {
                val e = z.nextEntry ?: break
                if (e.name == "META-INF/encryption.xml") enc = z.readBytes().toString(Charsets.UTF_8)
                if (e.name == "META-INF/rights.xml") rights = true
            }
        }
        val xml = enc ?: return rights
        val algos = Regex("Algorithm=\"([^\"]+)\"").findAll(xml).map { it.groupValues[1] }.toList()
        return rights || algos.any { !Regex("obfuscation|font|xmlenc#aes|fonts", RegexOption.IGNORE_CASE).containsMatchIn(it) } || Regex("adept|rights\\.xml", RegexOption.IGNORE_CASE).containsMatchIn(xml)
    }

    // --- reading data ---
    suspend fun position(itemId: String): Pair<Double, JsonObject>? = runCatching {
        api.get("/reading/positions/$itemId").asObject().obj("position")?.let { (it.double("percent") ?: 0.0) to (it.obj("locator") ?: JsonObject(emptyMap())) }
    }.getOrNull()
    suspend fun savePosition(itemId: String, percent: Double, locator: JsonObject) =
        api.request("PUT", "/reading/positions/$itemId", jsonOf("percent" to percent, "locator" to locator, "updatedAt" to java.time.Instant.now().toString()), offlineKey = "pos:$itemId")
    suspend fun sendSession(itemId: String, startedAt: String, endedAt: String, seconds: Int) =
        api.request("POST", "/reading/sessions", jsonOf("sessions" to listOf(mapOf("id" to java.util.UUID.randomUUID().toString(), "libraryItemId" to itemId, "startedAt" to startedAt, "endedAt" to endedAt, "seconds" to seconds))), offlineKey = "session:${java.util.UUID.randomUUID()}")

    data class Highlight(val id: String, val color: String, val note: String, val quote: String, val block: Int, val deleted: Boolean = false, val updatedAt: String = java.time.Instant.now().toString()) {
        fun json() = jsonOf("id" to id, "color" to color, "note" to note, "quote" to quote, "locator" to mapOf("block" to block), "deleted" to deleted, "updatedAt" to updatedAt)
        companion object {
            fun from(o: JsonObject) = Highlight(o.s("id"), o.str("color") ?: "yellow", o.s("note"), o.s("quote"), o.obj("locator")?.int("block") ?: 0, o.bool("deleted"), o.str("updated_at") ?: o.str("updatedAt") ?: "")
        }
    }

    /** Two-way highlight sync for a library item; returns the server's set and the new "since" mark. */
    suspend fun syncHighlights(itemId: String, since: Long, changes: List<Highlight>): Pair<List<Highlight>, Long> {
        val o = api.post("/reading/highlights/sync", jsonOf("libraryItemId" to itemId, "deviceId" to prefs.deviceId, "since" to since, "changes" to changes.map { it.json() })).asObject()
        return o.objects("highlights").map { Highlight.from(it) } to (o["ack"] as? JsonPrimitive)?.content?.toLongOrNull().let { it ?: since }
    }
}
