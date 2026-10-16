package cloud.crowdly.app.data

import cloud.crowdly.app.net.bool
import cloud.crowdly.app.net.double
import cloud.crowdly.app.net.int
import cloud.crowdly.app.net.obj
import cloud.crowdly.app.net.objects
import cloud.crowdly.app.net.s
import cloud.crowdly.app.net.str
import cloud.crowdly.app.net.strings
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.put

// The backend's rows as the app uses them; each mirrors an interface in
// apps/web/src/lib or the platform's src/lib API modules, parsed leniently.

enum class WorkKind(val key: String) {
    STORY("story"), SCREENPLAY("screenplay"), COMIC("comic");
    companion object { fun of(k: String) = entries.firstOrNull { it.key == k } }
}

data class WorkSummary(val kind: WorkKind, val id: String, val title: String, val date: String?, val visibility: String?, val published: Boolean?, val cover: String?) {
    companion object {
        fun story(o: JsonObject) = WorkSummary(WorkKind.STORY, o.s("story_title_id"), o.s("title"), o.str("updated_at") ?: o.str("created_at"), o.str("visibility"), o["published"]?.let { o.bool("published") }, o.str("cover_image_url"))
        fun screenplay(o: JsonObject) = WorkSummary(WorkKind.SCREENPLAY, o.s("screenplay_id"), o.s("title"), o.str("created_at"), o.str("visibility"), o["published"]?.let { o.bool("published") }, null)
        fun comic(o: JsonObject) = WorkSummary(WorkKind.COMIC, o.str("comic_id") ?: o.s("id"), o.s("title"), o.str("created_at"), o.str("visibility"), null, o.str("cover_image_url"))
    }
}

data class Space(val id: String, val userId: String, val name: String, val description: String?, val visibility: String?, val published: Boolean) {
    companion object { fun from(o: JsonObject) = Space(o.s("id"), o.s("user_id"), o.s("name"), o.str("description"), o.str("visibility"), o.bool("published")) }
}

// --- stories ---------------------------------------------------------------

data class StoryTitle(
    val id: String, val title: String, val creatorId: String?, val description: String?, val genre: String?, val tags: List<String>,
    val visibility: String, val published: Boolean, val language: String?, val cover: String?, val spaceId: String?, val completion: String?,
) {
    companion object {
        fun from(o: JsonObject) = StoryTitle(
            o.s("story_title_id"), o.s("title"), o.str("creator_id"), o.str("description"), o.str("genre"), o.strings("tags"),
            o.str("visibility") ?: "public", o.bool("published"), o.str("language"), o.str("cover_image_url"), o.str("creative_space_id"), o.str("completion_status"),
        )
    }
}

data class Chapter(val id: String, val storyId: String, val title: String, val paragraphs: List<String>, val index: Int?, val published: Boolean) {
    companion object {
        fun from(o: JsonObject) = Chapter(o.s("chapter_id"), o.s("story_title_id"), o.s("chapter_title"), o.strings("paragraphs"), o.int("chapter_index"), o["published"]?.let { o.bool("published", true) } ?: true)
    }
}

data class ParagraphBranch(val id: String, val chapterId: String, val paragraphIndex: Int, val text: String, val name: String?, val userId: String?, val language: String?, val createdAt: String?) {
    companion object {
        fun from(o: JsonObject) = ParagraphBranch(o.s("id"), o.s("chapter_id"), o.int("parent_paragraph_index") ?: 0, o.s("branch_text"), o.str("branch_name"), o.str("user_id"), o.str("language"), o.str("created_at"))
    }
}

data class Proposal(
    val id: String, val targetType: String, val chapterId: String?, val path: String?, val text: String, val authorEmail: String?, val createdAt: String?,
    // screenplay / comic proposals
    val partTitle: String? = null, val currentText: String? = null,
) {
    companion object {
        fun from(o: JsonObject) = Proposal(o.s("id"), o.s("target_type"), o.str("target_chapter_id"), o.str("target_path"), o.s("proposed_text"), o.str("author_email"), o.str("created_at"), o.str("part_title"), o.str("current_text"))
    }
}

data class CollabRequest(val id: String, val message: String, val status: String, val who: String) {
    companion object {
        fun from(o: JsonObject): CollabRequest {
            val r = o.obj("requester")
            val who = r?.let { it.str("name") ?: it.str("nickname") ?: it.str("username") ?: it.str("email") } ?: o.str("requester_email") ?: o.str("email") ?: "Someone"
            return CollabRequest(o.s("id"), o.s("message"), o.s("status"), who)
        }
    }
}

data class Comment(val id: String, val userId: String, val body: String, val createdAt: String, val chapterId: String?, val author: String) {
    companion object {
        fun from(o: JsonObject) = Comment(o.s("id"), o.s("user_id"), o.s("body"), o.s("created_at"), o.str("chapter_id"), o.str("username") ?: o.str("author_email") ?: o.str("email") ?: "")
    }
}

data class Locale(val code: String, val english: String, val native: String) {
    companion object { fun from(o: JsonObject) = Locale(o.s("code"), o.s("english_name"), o.s("native_name")) }
}

data class StoryVersion(val id: String, val title: String, val language: String, val isOriginal: Boolean, val isOfficial: Boolean, val creator: String?, val chapters: Int, val translated: Int, val stale: Int, val mine: Boolean) {
    companion object {
        fun from(o: JsonObject) = StoryVersion(o.s("story_title_id"), o.s("title"), o.s("language"), o.bool("is_original"), o.bool("is_official"), o.str("creator_name"), o.int("chapter_count") ?: 0, o.int("translated_count") ?: 0, o.int("stale_count") ?: 0, o.bool("is_mine"))
    }
}

data class Translations(val canTranslate: Boolean, val canMarkOfficial: Boolean, val versions: List<StoryVersion>)

data class Edition(val id: String, val name: String, val description: String?, val status: String, val creator: String?, val branchCount: Int, val mine: Boolean) {
    companion object {
        fun from(o: JsonObject) = Edition(o.s("id"), o.s("name"), o.str("description"), o.str("status") ?: "draft", o.str("creator_name"), o.int("branch_count") ?: 0, o.bool("is_mine"))
    }
}

// --- chapter media (audio / cartoon / video), AI ------------------------------

data class Overlay(val text: String, val x: Double, val y: Double, val style: String) {
    fun json() = buildJsonObject { put("text", text); put("x", x); put("y", y); put("style", style) }
    companion object {
        fun from(o: JsonObject) = Overlay(o.s("text"), o.double("x") ?: 50.0, o.double("y") ?: 50.0, if (o.str("style") == "box") "box" else "bubble")
        fun list(a: List<JsonObject>) = a.map { from(it) }
    }
}

data class MediaFrame(val id: String, val imageUrl: String, val caption: String?, val overlays: List<Overlay>, val anchorStart: Int?, val anchorEnd: Int?) {
    companion object {
        fun from(o: JsonObject) = MediaFrame(o.s("id"), o.s("image_url"), o.str("caption"), Overlay.list(o.objects("overlays")), o.int("anchor_start"), o.int("anchor_end"))
    }
}

data class ChapterMedia(
    val id: String, val kind: String, val source: String, val label: String?, val url: String?, val mime: String?, val duration: Double?,
    val status: String, val primary: Boolean, val creator: String?, val mine: Boolean, val frames: List<MediaFrame>, val editionName: String?,
) {
    companion object {
        fun from(o: JsonObject) = ChapterMedia(
            o.s("id"), o.s("kind"), o.s("source"), o.str("label"), o.str("url"), o.str("mime"), o.double("duration_seconds"),
            o.s("status"), o.bool("is_primary"), o.str("creator_name"), o.bool("is_mine"), o.objects("frames").map { MediaFrame.from(it) }, o.str("edition_name"),
        )
    }
}

data class MediaList(val canModerate: Boolean, val canNarrate: Boolean, val directUpload: Boolean, val media: List<ChapterMedia>)

data class AiConnection(val id: String, val name: String, val capabilities: List<String>) {
    companion object { fun from(o: JsonObject) = AiConnection(o.s("id"), o.str("label") ?: o.s("provider_label"), o.strings("capabilities")) }
}

data class AiJob(val id: String, val kind: String, val status: String, val error: String?, val progress: Double?, val chapterTitle: String?, val mine: Boolean) {
    companion object {
        fun from(o: JsonObject) = AiJob(o.s("id"), o.s("kind"), o.s("status"), o.str("error"), o.double("progress"), o.str("chapter_title"), o.bool("is_mine"))
    }
}

// --- screenplays -------------------------------------------------------------

data class Screenplay(val id: String, val title: String, val creatorId: String?, val description: String?, val genre: String?, val visibility: String?, val published: Boolean) {
    companion object {
        fun from(o: JsonObject) = Screenplay(o.s("screenplay_id"), o.s("title"), o.str("creator_id"), o.str("description"), o.str("genre"), o.str("visibility"), o.bool("published"))
    }
}

data class Scene(val id: String, val index: Int, val slugline: String, val synopsis: String?) {
    companion object { fun from(o: JsonObject) = Scene(o.s("scene_id"), o.int("scene_index") ?: 0, o.s("slugline"), o.str("synopsis")) }
}

data class ScriptBlock(val id: String, val sceneId: String?, val index: Int, val type: String, val text: String) {
    companion object { fun from(o: JsonObject) = ScriptBlock(o.s("block_id"), o.str("scene_id"), o.int("block_index") ?: 0, o.str("block_type") ?: "action", o.s("text")) }
}

data class BlockBranch(val id: String, val blockId: String, val text: String, val name: String?, val userId: String?, val authorEmail: String?) {
    companion object { fun from(o: JsonObject) = BlockBranch(o.s("id"), o.s("block_id"), o.s("text"), o.str("name"), o.str("user_id"), o.str("author_email")) }
}

/** /screenplays|comics/:id/my-access (src/lib/workApi.ts WorkAccess). */
data class WorkAccess(val role: String?, val explicit: Boolean, val isOwner: Boolean, val isAdmin: Boolean, val canClone: Boolean, val canExport: Boolean, val canTranslate: Boolean) {
    companion object {
        fun from(o: JsonObject) = WorkAccess(o.str("role"), o.bool("explicit"), o.bool("isOwner"), o.bool("isAdmin"), o.bool("can_clone"), o.bool("can_export", true), o.bool("can_translate"))
        val NONE = WorkAccess(null, false, false, false, false, true, false)
    }
}

// --- comics ------------------------------------------------------------------

data class ComicIssue(val id: String, val index: Int, val title: String, val published: Boolean) {
    companion object { fun from(o: JsonObject) = ComicIssue(o.s("issue_id"), o.int("issue_index") ?: 0, o.s("title"), o["published"]?.let { o.bool("published", true) } ?: true) }
}

data class ComicPage(val id: String, val issueId: String?, val index: Int, val imageUrl: String, val alt: String?, val overlays: List<Overlay>) {
    companion object { fun from(o: JsonObject) = ComicPage(o.s("page_id"), o.str("issue_id"), o.int("page_index") ?: 0, o.s("image_url"), o.str("alt_text"), Overlay.list(o.objects("overlays"))) }
}

data class Comic(val id: String, val title: String, val creatorId: String?, val direction: String, val visibility: String?, val published: Boolean, val issues: List<ComicIssue>, val pages: List<ComicPage>) {
    companion object {
        fun from(o: JsonObject) = Comic(
            o.str("comic_id") ?: o.s("id"), o.s("title"), o.str("creator_id"), o.str("reading_direction") ?: "ltr", o.str("visibility"), o.bool("published"),
            o.objects("issues").map { ComicIssue.from(it) }.sortedBy { it.index }, o.objects("pages").map { ComicPage.from(it) }.sortedBy { it.index },
        )
    }
}

data class PageBranch(val id: String, val pageId: String, val imageUrl: String, val overlays: List<Overlay>, val name: String?, val userId: String?) {
    companion object { fun from(o: JsonObject) = PageBranch(o.s("id"), o.s("page_id"), o.s("image_url"), Overlay.list(o.objects("overlays")), o.str("name"), o.str("user_id")) }
}

// --- Spaces ------------------------------------------------------------------

data class SpaceItem(
    val id: String, val spaceId: String, val name: String, val kind: String, val path: String, val mime: String?, val size: Long?,
    val updatedAt: String?, val linkedType: String?, val linkedTitle: String?, val linkedParentId: String?, val canWrite: Boolean,
) {
    val isFolder get() = kind == "folder"
    val isText get() = Regex("\\.(md|markdown|txt|story|screenplay|comic|master|fountain|fdx|json|html?|css|csv|ya?ml|xml)$", RegexOption.IGNORE_CASE).containsMatchIn(name) || mime.orEmpty().startsWith("text/")
    val isImage get() = Regex("\\.(png|jpe?g|gif|webp|svg)$", RegexOption.IGNORE_CASE).containsMatchIn(name) || mime.orEmpty().startsWith("image/")
    val isAudio get() = Regex("\\.(mp3|m4a|m4b|ogg|opus|wav|flac|aac)$", RegexOption.IGNORE_CASE).containsMatchIn(name)

    companion object {
        fun from(o: JsonObject) = SpaceItem(
            o.s("id"), o.s("space_id"), o.s("name"), o.s("kind"), o.s("relative_path"), o.str("mime_type"), o.int("size_bytes")?.toLong(), o.str("updated_at"),
            o.str("linked_type"), o.str("linked_title"), o.str("linked_parent_id"), o["can_write"]?.let { o.bool("can_write") } ?: true,
        )
    }
}

data class Crumb(val name: String, val path: String)

data class SyncStatus(val github: JsonObject?, val drive: JsonObject?)

// --- revisions ---------------------------------------------------------------

data class Revision(val number: Int, val heads: List<String>, val createdAt: String?, val by: String?, val changes: Int, val snapshot: JsonObject) {
    companion object {
        fun from(o: JsonObject) = Revision(o.int("revisionNumber") ?: 0, o.strings("heads"), o.str("createdAt"), o.str("createdByName") ?: o.str("createdBy"), o.int("changeCount") ?: 0, o.obj("snapshot") ?: JsonObject(emptyMap()))
    }

    /** The revision's text, for comparing: a chapter's title + paragraphs, or a scene's blocks. */
    fun text(): String {
        val title = snapshot.str("title") ?: snapshot.str("slugline")
        val paragraphs = (snapshot["paragraphs"] as? JsonArray)?.mapNotNull { (it as? JsonPrimitive)?.contentOrNull }
        val blocks = snapshot.objects("blocks").map { it.s("text") }
        return listOfNotNull(title?.takeIf { it.isNotBlank() }).plus(paragraphs ?: blocks).joinToString("\n\n")
    }
}
