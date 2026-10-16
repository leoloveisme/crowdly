package cloud.crowdly.core.sync

import cloud.crowdly.core.formats.SCREENPLAY_ELEMENTS
import cloud.crowdly.core.formats.block
import cloud.crowdly.core.formats.imageSource
import cloud.crowdly.core.formats.num
import cloud.crowdly.core.formats.parseBlocks
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.doubleOrNull
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.put

/*
 * Branch / id sync between .story, .screenplay, .comic files and Crowdly: the
 * Kotlin port of apps/desktop/src/editor/branch_sync.py (pure text
 * transformations, no network; the caller passes `send`). Backend contract:
 * Documentation/branching-api.md.
 *
 * - After a content sync the server's ids are written back into the file as
 *   `id=` attributes, keeping every other attribute as it was.
 * - Branches are reconciled with POST /…/branches/sync: entries carry their id
 *   when they have one, branches whose id disappeared from the file since the
 *   last sync are sent as deleted, and branches on the server that the file
 *   doesn't have (someone else's) are inserted after what they belong to.
 */

/** A block that can be changed in place (the parser's blocks are immutable). */
class SyncBlock(var tag: String, val attrs: MutableMap<String, String>, var body: String)

data class BranchSyncOutcome(val text: String, val knownIds: List<String>, val results: List<JsonObject>)

private fun blocksOf(text: String) = parseBlocks(text).map { SyncBlock(it.tag, LinkedHashMap(it.attrs), it.body) }.toMutableList()

/** dsl.serialize: raw text as is, every other block re-tagged, separated by blank lines. */
fun serializeBlocks(blocks: List<SyncBlock>): String =
    blocks.flatMap { listOf(if (it.tag == "raw") it.body else block(it.tag, it.body, it.attrs), "") }.joinToString("\n").trimEnd() + "\n"

private fun withId(b: SyncBlock, value: String?) {
    if (!value.isNullOrEmpty()) b.attrs["id"] = value
}

private fun JsonObject.str(k: String): String? = (this[k] as? JsonPrimitive)?.takeIf { it !is JsonNull }?.contentOrNull
private fun JsonObject.objs(k: String): List<JsonObject> = (this[k] as? JsonArray)?.filterIsInstance<JsonObject>().orEmpty()
private fun JsonElement?.objList(): List<JsonObject> = (this as? JsonArray)?.filterIsInstance<JsonObject>().orEmpty()

// ---------------------------------------------------------------------------
// .screenplay content
// ---------------------------------------------------------------------------

private data class Walk(val kind: String, val scene: Int, val block: SyncBlock)

/** (kind, scene_no, block) in sync order: kind is "scene", "element" or "branch". Untagged text counts as action. */
private fun screenplayWalk(blocks: List<SyncBlock>): List<Walk> {
    var sceneNo = -1
    val out = mutableListOf<Walk>()
    for (b in blocks) {
        when (b.tag) {
            "scene_slugline", "scene_heading" -> { sceneNo++; out += Walk("scene", sceneNo, b) }
            "screenplay_title" -> Unit
            "branch" -> out += Walk("branch", maxOf(sceneNo, 0), b)
            else -> {
                if (sceneNo < 0) sceneNo = 0 // elements before the first slugline: an implicit first scene
                out += Walk("element", sceneNo, b)
            }
        }
    }
    return out
}

data class ScreenplayPayload(val title: String, val scenes: List<JsonObject>)

/** (title, scenes) for POST /screenplays/:id/sync-desktop, with the ids already in the file. */
fun screenplaySyncPayload(text: String): ScreenplayPayload {
    val blocks = blocksOf(text)
    val title = blocks.firstOrNull { it.tag == "screenplay_title" }?.body?.trim().orEmpty()
    class Scene(val index: Int) { var slugline = ""; var id: String? = null; val blocks = mutableListOf<JsonObject>() }
    val scenes = mutableListOf<Scene>()
    for ((kind, sceneNo, b) in screenplayWalk(blocks)) {
        while (scenes.size <= sceneNo) scenes += Scene(scenes.size + 1)
        val scene = scenes[sceneNo]
        if (kind == "scene") {
            scene.slugline = b.body.trim()
            b.attrs["id"]?.takeIf { it.isNotEmpty() }?.let { scene.id = it }
        } else if (kind == "element" && b.body.isNotBlank()) {
            scene.blocks += buildJsonObject {
                put("text", b.body)
                put("blockType", if (b.tag in SCREENPLAY_ELEMENTS) b.tag else "action")
                b.attrs["id"]?.takeIf { it.isNotEmpty() }?.let { put("blockId", it) }
            }
        }
    }
    return ScreenplayPayload(
        title.ifEmpty { "Untitled Screenplay" },
        scenes.map { s ->
            buildJsonObject {
                put("sceneIndex", s.index)
                put("slugline", s.slugline)
                put("blocks", JsonArray(s.blocks))
                s.id?.let { put("sceneId", it) }
            }
        },
    )
}

/** Writes the ids the sync returned onto sluglines and elements. Untagged text becomes [action] to hold its id. */
fun applyScreenplayIds(text: String, responseScenes: List<JsonObject>): String {
    val blocks = blocksOf(text)
    val counters = HashMap<Int, Int>()
    for ((kind, sceneNo, b) in screenplayWalk(blocks)) {
        if (sceneNo >= responseScenes.size) continue
        val scene = responseScenes[sceneNo]
        if (kind == "scene") withId(b, scene.str("sceneId"))
        else if (kind == "element" && b.body.isNotBlank()) {
            val n = counters[sceneNo] ?: 0
            counters[sceneNo] = n + 1
            val rows = scene.objs("blocks")
            if (n < rows.size) {
                if (b.tag == "raw") b.tag = "action"
                withId(b, rows[n].str("blockId"))
            }
        }
    }
    return serializeBlocks(blocks)
}

// ---------------------------------------------------------------------------
// .story content
// ---------------------------------------------------------------------------

/** chapters[] for POST /story-titles/:id/sync-desktop (matched by position on the server). */
fun storySyncChapters(text: String): Pair<String, List<JsonObject>> {
    val doc = cloud.crowdly.core.formats.parseStory(text)
    val chapters = doc.chapters.ifEmpty { listOf(cloud.crowdly.core.formats.StoryChapterDoc("Chapter 1", listOf(""))) }
    return doc.title.ifEmpty { "Untitled" } to chapters.map { ch ->
        buildJsonObject {
            put("chapterTitle", ch.title.ifEmpty { "Chapter" })
            put("paragraphs", buildJsonArray { ch.paragraphs.forEach { add(JsonPrimitive(it)) } })
        }
    }
}

// ---------------------------------------------------------------------------
// .comic content
// ---------------------------------------------------------------------------

private fun layerOf(b: SyncBlock): JsonObject {
    fun pct(key: String) = (b.attrs[key]?.trim()?.toDoubleOrNull() ?: 0.0).coerceIn(0.0, 100.0)
    return buildJsonObject {
        put("text", b.body)
        put("x", pct("x"))
        put("y", pct("y"))
        put("style", if (b.attrs["style"] == "box") "box" else "bubble")
    }
}

/** POST /comics/:id/sync-desktop body. [imageUrl] returns the Crowdly URL of a page image (uploading it first when needed). */
fun comicSyncPayload(text: String, imageUrl: (String) -> String): JsonObject {
    val blocks = blocksOf(text)
    var title = ""
    var direction = "ltr"
    class Issue(val title: String, val id: String?) { val pages = mutableListOf<MutableMap<String, Any>>() }
    val issues = mutableListOf<Issue>()
    var page: MutableMap<String, Any>? = null
    var inAlt = false
    for (b in blocks) {
        when (b.tag) {
            "comic_title" -> { title = b.body.trim(); direction = if (b.attrs["direction"] == "rtl") "rtl" else "ltr" }
            "issue" -> { issues += Issue(b.body.trim(), b.attrs["id"]?.takeIf { it.isNotEmpty() }); page = null; inAlt = false }
            "page" -> {
                if (issues.isEmpty()) issues += Issue("Issue 1", null)
                val p = linkedMapOf<String, Any>("imageUrl" to imageUrl(imageSource(b.body)), "alt" to b.attrs["alt"].orEmpty(), "overlays" to mutableListOf<JsonObject>())
                b.attrs["id"]?.takeIf { it.isNotEmpty() }?.let { p["pageId"] = it }
                issues.last().pages += p
                page = p
                inAlt = false
            }
            "alt" -> inAlt = true // alternatives sync through the branch route
            "layer" -> if (page != null && !inAlt) {
                @Suppress("UNCHECKED_CAST")
                (page["overlays"] as MutableList<JsonObject>) += layerOf(b)
            }
        }
    }
    return buildJsonObject {
        put("title", title.ifEmpty { "Untitled comic" })
        put("direction", direction)
        put("issues", buildJsonArray {
            for (issue in issues) add(buildJsonObject {
                put("title", issue.title)
                put("pages", buildJsonArray {
                    for (p in issue.pages) add(buildJsonObject {
                        put("imageUrl", p["imageUrl"] as String)
                        put("alt", p["alt"] as String)
                        @Suppress("UNCHECKED_CAST")
                        put("overlays", JsonArray(p["overlays"] as List<JsonObject>))
                        (p["pageId"] as String?)?.let { put("pageId", it) }
                    })
                })
                issue.id?.let { put("issueId", it) }
            })
        })
    }
}

fun applyComicIds(text: String, responseIssues: List<JsonObject>): String {
    val blocks = blocksOf(text)
    var issueNo = -1
    var pageNo = -1
    for (b in blocks) {
        if (b.tag == "issue") {
            issueNo++
            pageNo = -1
            if (issueNo < responseIssues.size) withId(b, responseIssues[issueNo].str("issueId"))
        } else if (b.tag == "page") {
            if (issueNo < 0) issueNo = 0
            pageNo++
            val pages = if (issueNo < responseIssues.size) responseIssues[issueNo].objs("pages") else emptyList()
            if (pageNo < pages.size) withId(b, pages[pageNo].str("pageId"))
        }
    }
    return serializeBlocks(blocks)
}

// ---------------------------------------------------------------------------
// Branches
// ---------------------------------------------------------------------------

private fun reconcile(
    blocks: MutableList<SyncBlock>,
    refs: List<Pair<Int, JsonObject>>,
    knownIds: List<String>,
    send: (List<JsonObject>) -> JsonObject?,
    insertMissing: (MutableList<SyncBlock>, JsonObject) -> Unit,
): BranchSyncOutcome {
    val present = refs.mapNotNull { it.second.str("id") }.toSet()
    val deleted = knownIds.filter { it !in present }
    val entries = refs.map { it.second } + deleted.map { buildJsonObject { put("id", it); put("deleted", true) } }
    // Always sent: an empty list is a safe "pull" of the server's branches.
    val response = send(entries) ?: JsonObject(emptyMap())
    val results = response["results"].objList()
    for (res in results) {
        val idx = (res["index"] as? JsonPrimitive)?.intOrNull ?: continue
        val id = res.str("id")
        if (idx < refs.size && res.str("status") == "created" && !id.isNullOrEmpty()) blocks[refs[idx].first].attrs["id"] = id
    }
    val inFile = blocks.mapNotNull { it.attrs["id"]?.takeIf { id -> id.isNotEmpty() } }.toSet()
    for (sb in response["branches"].objList()) {
        val id = sb.str("id")
        if (!id.isNullOrEmpty() && id !in inFile) insertMissing(blocks, sb)
    }
    val known = blocks.filter { it.tag == "branch" || it.tag == "alt" }.mapNotNull { it.attrs["id"]?.takeIf { id -> id.isNotEmpty() } }.toSortedSet().toList()
    return BranchSyncOutcome(serializeBlocks(blocks), known, results)
}

private fun entry(vararg pairs: Pair<String, Any?>): JsonObject = buildJsonObject {
    for ((k, v) in pairs) when (v) {
        null -> Unit
        is String -> put(k, v)
        is Number -> put(k, v)
        is Boolean -> put(k, v)
        is JsonElement -> put(k, v)
    }
}

/** Paragraph branches of a .story file. [chapterIds] are the story's chapter ids in order. */
fun syncStoryBranches(text: String, chapterIds: List<String>, knownIds: List<String>, send: (List<JsonObject>) -> JsonObject?): BranchSyncOutcome {
    val blocks = blocksOf(text)
    val refs = mutableListOf<Pair<Int, JsonObject>>()
    // Where each (chapter, paragraph) ends, to insert pulled branches after it.
    val anchors = HashMap<Pair<Int, Int>, Int>()
    var chapter = -1
    var paragraph = -1
    blocks.forEachIndexed { i, b ->
        if (b.tag == "story_title") return@forEachIndexed
        if (b.tag == "chapter_title") { chapter++; paragraph = -1; return@forEachIndexed }
        if (chapter < 0) chapter = 0
        if (b.tag == "branch") {
            if (paragraph < 0) paragraph = 0
            anchors[chapter to paragraph] = i
            if (chapter < chapterIds.size) {
                refs += i to entry(
                    "chapterId" to chapterIds[chapter], "paragraphIndex" to paragraph, "text" to b.body, "name" to b.attrs["name"].orEmpty(),
                    "id" to b.attrs["id"]?.takeIf { it.isNotEmpty() },
                )
            }
        } else {
            paragraph++
            anchors[chapter to paragraph] = i
        }
    }
    val original = blocks.toList()
    return reconcile(blocks, refs, knownIds, send) { blks, br ->
        val ch = chapterIds.indexOf(br.str("chapterId"))
        if (ch < 0) return@reconcile
        val pIndex = (br["paragraphIndex"] as? JsonPrimitive)?.let { it.intOrNull ?: it.doubleOrNull?.toInt() } ?: 0
        val at = anchors[ch to pIndex] ?: return@reconcile
        val anchor = original[at]
        var pos = blks.indexOfFirst { it === anchor } + 1
        while (pos < blks.size && blks[pos].tag == "branch") pos++
        blks.add(pos, SyncBlock("branch", linkedMapOf("name" to br.str("name").orEmpty(), "id" to br.str("id")!!), br.str("text").orEmpty()))
    }
}

/** Element branches of a .screenplay file whose elements already carry their Crowdly ids. */
fun syncScreenplayBranches(text: String, knownIds: List<String>, send: (List<JsonObject>) -> JsonObject?): BranchSyncOutcome {
    val blocks = blocksOf(text)
    val refs = mutableListOf<Pair<Int, JsonObject>>()
    var last: SyncBlock? = null
    blocks.forEachIndexed { i, b ->
        when {
            b.tag in SCREENPLAY_ELEMENTS || b.tag == "raw" -> last = b
            b.tag == "scene_slugline" || b.tag == "scene_heading" -> last = null
            b.tag == "branch" && !last?.attrs?.get("id").isNullOrEmpty() ->
                refs += i to entry("blockId" to last!!.attrs["id"], "text" to b.body, "name" to b.attrs["name"].orEmpty(), "id" to b.attrs["id"]?.takeIf { it.isNotEmpty() })
        }
    }
    return reconcile(blocks, refs, knownIds, send) { blks, br ->
        val at = blks.indexOfFirst { it.tag in SCREENPLAY_ELEMENTS && it.attrs["id"] == br.str("blockId") }
        if (at < 0) return@reconcile
        var pos = at + 1
        while (pos < blks.size && blks[pos].tag == "branch") pos++
        blks.add(pos, SyncBlock("branch", linkedMapOf("name" to br.str("name").orEmpty(), "id" to br.str("id")!!), br.str("text").orEmpty()))
    }
}

/** Page alternatives of a .comic file whose pages carry their ids. New alternatives' images go through [imageUrl]. */
fun syncComicAlternatives(text: String, knownIds: List<String>, send: (List<JsonObject>) -> JsonObject?, imageUrl: (String) -> String): BranchSyncOutcome {
    val blocks = blocksOf(text)
    class Ref(val index: Int, val fields: LinkedHashMap<String, Any>, val overlays: MutableList<JsonObject>)
    val refs = mutableListOf<Ref>()
    var page: SyncBlock? = null
    var current: Ref? = null
    blocks.forEachIndexed { i, b ->
        when {
            b.tag == "page" -> { page = b; current = null }
            b.tag == "issue" -> { page = null; current = null }
            b.tag == "alt" && !page?.attrs?.get("id").isNullOrEmpty() -> {
                val fields = linkedMapOf<String, Any>("pageId" to page!!.attrs["id"]!!, "name" to b.attrs["name"].orEmpty())
                val r = Ref(i, fields, mutableListOf())
                val id = b.attrs["id"]
                if (!id.isNullOrEmpty()) fields["id"] = id else fields["imageUrl"] = imageUrl(imageSource(b.body))
                refs += r
                current = r
            }
            b.tag == "layer" && current != null -> current!!.overlays += layerOf(b)
        }
    }
    val pairs = refs.map { r ->
        r.index to buildJsonObject {
            put("pageId", r.fields["pageId"] as String)
            put("name", r.fields["name"] as String)
            put("overlays", JsonArray(r.overlays))
            (r.fields["id"] as String?)?.let { put("id", it) }
            (r.fields["imageUrl"] as String?)?.let { put("imageUrl", it) }
        }
    }
    return reconcile(blocks, pairs, knownIds, send) { blks, br ->
        val at = blks.indexOfFirst { it.tag == "page" && it.attrs["id"] == br.str("pageId") }
        if (at < 0) return@reconcile
        var pos = at + 1
        while (pos < blks.size && (blks[pos].tag == "layer" || blks[pos].tag == "alt")) pos++
        val new = mutableListOf(SyncBlock("alt", linkedMapOf("name" to br.str("name").orEmpty(), "id" to br.str("id")!!), "(${br.str("imageUrl").orEmpty()})"))
        for (o in br["overlays"].objList()) {
            val x = (o["x"] as? JsonPrimitive)?.doubleOrNull ?: 0.0
            val y = (o["y"] as? JsonPrimitive)?.doubleOrNull ?: 0.0
            new += SyncBlock("layer", linkedMapOf("x" to num(x), "y" to num(y), "style" to (o.str("style") ?: "bubble")), o.str("text").orEmpty())
        }
        blks.addAll(pos, new)
    }
}

// ---------------------------------------------------------------------------
// Suggestions for works the user can't change directly
// ---------------------------------------------------------------------------

/** Proposals (POST /screenplays/:id/proposals) for every element and slugline whose text differs from the server's, by id. */
fun screenplaySuggestions(text: String, serverBlocks: Map<String, String>, serverScenes: Map<String, String>): List<JsonObject> {
    val out = mutableListOf<JsonObject>()
    for ((kind, _, b) in screenplayWalk(blocksOf(text))) {
        val rid = b.attrs["id"]?.takeIf { it.isNotEmpty() } ?: continue
        if (kind == "scene" && rid in serverScenes && b.body.trim() != serverScenes[rid].orEmpty().trim())
            out += entry("targetType" to "scene", "targetSceneId" to rid, "proposedText" to b.body.trim())
        else if (kind == "element" && rid in serverBlocks && b.body.trim() != serverBlocks[rid].orEmpty().trim())
            out += entry("targetType" to "block", "targetBlockId" to rid, "proposedText" to b.body)
    }
    return out
}

/** page_layer proposals for pages whose text layers differ from the server's. */
fun comicSuggestions(text: String, serverOverlays: Map<String, List<JsonObject>>): List<JsonObject> {
    val out = mutableListOf<JsonObject>()
    var pageId: String? = null
    val layers = LinkedHashMap<String, MutableList<JsonObject>>()
    var inAlt = false
    for (b in blocksOf(text)) {
        when (b.tag) {
            "page" -> { pageId = b.attrs["id"]?.takeIf { it.isNotEmpty() }; inAlt = false; pageId?.let { layers.getOrPut(it) { mutableListOf() } } }
            "alt", "issue" -> inAlt = b.tag == "alt"
            "layer" -> if (pageId != null && !inAlt) layers[pageId]!! += layerOf(b)
        }
    }
    for ((pid, mine) in layers) {
        val theirs = serverOverlays[pid]?.map { o ->
            buildJsonObject {
                put("text", o.str("text").orEmpty())
                put("x", (o["x"] as? JsonPrimitive)?.doubleOrNull ?: 0.0)
                put("y", (o["y"] as? JsonPrimitive)?.doubleOrNull ?: 0.0)
                put("style", o.str("style") ?: "bubble")
            }
        }
        if (theirs != null && mine != theirs) out += entry("targetType" to "page_layer", "targetPageId" to pid, "proposedText" to JsonArray(mine).toString())
    }
    return out
}
