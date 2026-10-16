package cloud.crowdly.app.data

import cloud.crowdly.app.net.Api
import cloud.crowdly.app.net.ApiError
import cloud.crowdly.app.net.asObject
import cloud.crowdly.app.net.asObjects
import cloud.crowdly.app.net.bool
import cloud.crowdly.app.net.enc
import cloud.crowdly.app.net.jsonOf
import cloud.crowdly.app.net.objects
import cloud.crowdly.app.net.qs
import cloud.crowdly.app.net.s
import cloud.crowdly.app.net.str
import cloud.crowdly.app.net.toJson
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject

/**
 * Every backend route the app uses, grouped like apps/web/src/lib
 * (docs, story, collab, screenplay, comic, spaces) plus the platform modules
 * the web app reuses (src/lib: mediaApi.ts, translationsApi.ts, aiApi.ts,
 * workApi.ts). Reads of works go through [Api.getCached] so they open offline.
 */
class Repo(private val api: Api, private val session: Session) {
    private val uid get() = session.userId

    // --- docs (lib/docs.ts) ---------------------------------------------------
    suspend fun myStories() = api.getCached("/users/$uid/stories").asObjects().map { WorkSummary.story(it) }
    suspend fun myScreenplays() = api.getCached("/users/$uid/screenplays").asObjects().map { WorkSummary.screenplay(it) }
    suspend fun myComics() = runCatching { api.getCached("/users/$uid/comics").asObjects().map { WorkSummary.comic(it) } }.getOrDefault(emptyList())
    suspend fun mySpaces(): List<Space> {
        val mine = api.getCached("/creative-spaces" + qs("userId" to uid)).asObjects().map { Space.from(it) }
        val shared = runCatching { api.getCached("/creative-spaces/shared-with-me").asObjects().map { Space.from(it) } }.getOrDefault(emptyList())
        return mine + shared.filter { s -> mine.none { it.id == s.id } }
    }
    suspend fun space(id: String) = Space.from(api.getCached("/creative-spaces/$id" + qs("userId" to uid)).asObject())
    suspend fun createSpace(name: String, description: String? = null) = Space.from(api.post("/creative-spaces", jsonOf("userId" to uid, "name" to name, "description" to description)).asObject())
    suspend fun deleteSpace(id: String) = api.delete("/creative-spaces/$id", jsonOf("userId" to uid))
    suspend fun renameSpace(id: String, name: String) = api.patch("/creative-spaces/$id", jsonOf("userId" to uid, "name" to name))
    suspend fun cloneSpace(id: String) = Space.from(api.post("/creative-spaces/$id/clone", jsonOf("userId" to uid)).asObject())
    suspend fun updateSpace(id: String, visibility: String? = null, description: String? = null) =
        api.patch("/creative-spaces/$id", jsonOf("userId" to uid, "visibility" to visibility, "description" to description))

    suspend fun createStory(title: String, spaceId: String? = null, chapterTitle: String = "Chapter 1", paragraphs: List<String> = listOf("")): Pair<String, String> {
        val o = api.post("/stories/template", jsonOf("title" to title.ifBlank { "Untitled story" }, "chapterTitle" to chapterTitle.ifBlank { "Chapter 1" }, "paragraphs" to paragraphs.ifEmpty { listOf("") }, "userId" to uid, "creativeSpaceId" to spaceId)).asObject()
        return o.s("storyTitleId") to o.s("chapterId")
    }
    suspend fun createScreenplay(title: String): String {
        val o = api.post("/screenplays/template", jsonOf("title" to title.ifBlank { "Untitled screenplay" })).asObject()
        return o.str("screenplayId") ?: o.str("screenplay_id") ?: o.s("id")
    }
    suspend fun createComic(title: String): String {
        val o = api.post("/comics", jsonOf("title" to title.ifBlank { "Untitled comic" })).asObject()
        return o.str("comic_id") ?: o.str("comicId") ?: o.s("id")
    }

    /** For a bare id, probe which kind of work it is (docs.ts resolveWorkKind). */
    suspend fun resolveWorkKind(id: String): WorkKind? {
        for ((kind, path) in listOf(WorkKind.STORY to "/story-titles/$id", WorkKind.SCREENPLAY to "/screenplays/$id", WorkKind.COMIC to "/comics/$id")) {
            if (runCatching { api.get(path) }.isSuccess) return kind
        }
        return null
    }

    // --- stories (lib/story.ts) ---------------------------------------------------
    suspend fun story(id: String) = StoryTitle.from(api.getCached("/story-titles/$id" + qs("userId" to uid)).asObject())
    suspend fun chapters(id: String) = api.getCached("/chapters" + qs("storyTitleId" to id, "userId" to uid)).asObjects().map { Chapter.from(it) }
    suspend fun storyRole(id: String): String? = runCatching { api.getCached("/story-titles/$id/my-access").asObject().str("role") }.getOrNull()
    suspend fun saveChapter(chapterId: String, title: String, paragraphs: List<String>) =
        api.request("PATCH", "/chapters/$chapterId", jsonOf("chapterTitle" to title.ifBlank { "Untitled chapter" }, "paragraphs" to paragraphs), offlineKey = "chapter:$chapterId")
    suspend fun createChapter(storyId: String, title: String, paragraphs: List<String>, index: Int? = null) =
        Chapter.from(api.post("/chapters", jsonOf("storyTitleId" to storyId, "chapterTitle" to title, "paragraphs" to paragraphs, "chapterIndex" to index)).asObject())
    suspend fun deleteChapter(chapterId: String) = api.delete("/chapters/$chapterId")
    suspend fun reorderChapters(storyId: String, ids: List<String>) = api.patch("/stories/$storyId/chapters/reorder", jsonOf("chapterIds" to ids))
    suspend fun publishChapter(chapterId: String, published: Boolean) = api.patch("/chapters/$chapterId/publish", jsonOf("published" to published))
    suspend fun renameStory(id: String, title: String) = api.patch("/story-titles/$id", jsonOf("title" to title, "userId" to uid))
    suspend fun updateStorySettings(id: String, vararg fields: Pair<String, Any?>) = api.patch("/story-titles/$id/settings", jsonOf(*fields, "userId" to uid))
    suspend fun deleteStory(id: String) = api.delete("/story-titles/$id")
    suspend fun storyBranches(id: String) = runCatching { api.getCached("/stories/$id/branches").asObjects().map { ParagraphBranch.from(it) } }.getOrDefault(emptyList())
    suspend fun createBranch(chapterId: String, index: Int, parentText: String, text: String, name: String?) =
        api.post("/paragraph-branches", jsonOf("chapterId" to chapterId, "parentParagraphIndex" to index, "parentParagraphText" to parentText, "branchText" to text, "branchName" to name?.ifBlank { null }))
    suspend fun updateBranch(id: String, text: String, name: String?) = api.patch("/paragraph-branches/$id", jsonOf("branchText" to text, "branchName" to name))
    suspend fun deleteBranch(id: String) = api.delete("/paragraph-branches/$id")
    suspend fun uploadStoryImage(storyId: String, chapterId: String?, name: String, mime: String, bytes: ByteArray): String {
        val r = api.upload("POST", "/stories/${enc(storyId)}/gallery", listOfNotNull("kind" to "inline_illustration", chapterId?.let { "chapter_id" to it }).toMap(), listOf(Api.FilePart("images", name, mime, bytes)))
        return (r as? JsonArray)?.firstOrNull()?.asObject()?.s("image_url") ?: throw ApiError(500, "The server didn't return the image")
    }

    // --- collaboration (lib/collab.ts) ------------------------------------------
    suspend fun proposals(storyId: String) = runCatching { api.get("/stories/$storyId/proposals" + qs("status" to "undecided")).asObjects().map { Proposal.from(it) } }.getOrDefault(emptyList())
    suspend fun createProposal(storyId: String, body: JsonObject) = api.post("/stories/$storyId/proposals", body)
    suspend fun decideProposal(id: String, approve: Boolean) = api.post("/proposals/$id/${if (approve) "approve" else "decline"}")
    suspend fun cloneStory(storyId: String) = api.post("/stories/$storyId/clone", jsonOf("userId" to uid)).asObject().s("storyTitleId")
    suspend fun locales() = api.getCached("/locales").asObjects().map { Locale.from(it) }
    suspend fun requestCollaboration(storyId: String, message: String) = api.post("/stories/$storyId/collaboration-requests", jsonOf("message" to message))
    suspend fun myCollaborationRequest(storyId: String): CollabRequest? =
        runCatching { api.get("/stories/$storyId/collaboration-requests/mine").asObject().let { o -> (o["request"] as? JsonObject)?.let { CollabRequest.from(it) } } }.getOrNull()
    suspend fun collaborationRequests(storyId: String) =
        runCatching { api.get("/stories/$storyId/collaboration-requests").asObject().objects("requests").map { CollabRequest.from(it) } }.getOrDefault(emptyList())
    suspend fun decideCollaboration(id: String, approve: Boolean) = api.post("/collaboration-requests/$id/${if (approve) "approve" else "decline"}")
    suspend fun comments(storyId: String) = runCatching { api.getCached("/comments" + qs("storyTitleId" to storyId)).asObjects().map { Comment.from(it) } }.getOrDefault(emptyList())
    suspend fun postComment(storyId: String, chapterId: String?, body: String) = api.post("/comments", jsonOf("userId" to uid, "storyTitleId" to storyId, "chapterId" to chapterId, "body" to body))

    // --- translations, editions, chapter media, AI (src/lib/*Api.ts) --------------
    suspend fun translations(storyId: String): Translations? = runCatching {
        val o = api.get("/stories/$storyId/translations").asObject()
        Translations(o.bool("can_translate"), o.bool("can_mark_official"), o.objects("versions").map { StoryVersion.from(it) })
    }.getOrNull()
    suspend fun createTranslation(storyId: String, language: String, start: String, connectionId: String? = null) =
        api.post("/stories/$storyId/translations", jsonOf("language" to language, "start" to start, "connectionId" to connectionId)).asObject()
    suspend fun setOfficial(storyId: String, official: Boolean) = api.patch("/stories/$storyId/official", jsonOf("official" to official))

    suspend fun editions(kind: WorkKind, id: String) = runCatching {
        api.get(if (kind == WorkKind.STORY) "/stories/$id/editions" else "/${kind.key}s/$id/editions").asObjects().map { Edition.from(it) }
    }.getOrDefault(emptyList())
    suspend fun createEdition(kind: WorkKind, id: String, name: String, status: String, selections: Map<String, Map<String, String>>) =
        api.post(if (kind == WorkKind.STORY) "/stories/$id/editions" else "/${kind.key}s/$id/editions", jsonOf("name" to name, "status" to status, "selections" to selections))
    private fun editionPath(kind: WorkKind, editionId: String) = when (kind) {
        WorkKind.STORY -> "/stories/editions/$editionId"
        WorkKind.SCREENPLAY -> "/screenplay-editions/$editionId"
        WorkKind.COMIC -> "/comic-editions/$editionId"
    }
    suspend fun edition(kind: WorkKind, editionId: String) = api.getCached(editionPath(kind, editionId)).asObject()
    suspend fun updateEdition(kind: WorkKind, editionId: String, vararg fields: Pair<String, Any?>) = api.patch(editionPath(kind, editionId), jsonOf(*fields))
    suspend fun deleteEdition(kind: WorkKind, editionId: String) = api.delete(editionPath(kind, editionId))

    suspend fun chapterMedia(chapterId: String): MediaList {
        val o = api.get("/chapters/$chapterId/media").asObject()
        return MediaList(o.bool("can_moderate"), o.bool("can_narrate"), o.bool("direct_upload"), o.objects("media").map { ChapterMedia.from(it) })
    }
    suspend fun uploadNarration(chapterId: String, name: String, mime: String, bytes: ByteArray, label: String?) =
        api.upload("POST", "/chapters/$chapterId/media/audio", listOfNotNull(label?.let { "label" to it }).toMap(), listOf(Api.FilePart("file", name, mime, bytes)))
    suspend fun addVideoEmbed(chapterId: String, url: String, label: String?) = api.post("/chapters/$chapterId/media/embed", jsonOf("url" to url, "label" to label))
    suspend fun createPresentation(chapterId: String, images: List<Api.FilePart>, label: String?) =
        api.upload("POST", "/chapters/$chapterId/media/visual", listOfNotNull(label?.let { "label" to it }).toMap(), images)
    suspend fun addFrames(mediaId: String, images: List<Api.FilePart>) = api.upload("POST", "/chapters/media/$mediaId/frames", emptyMap(), images)
    suspend fun updateFrame(mediaId: String, frameId: String, caption: String?, overlays: List<Overlay>) =
        api.patch("/chapters/media/$mediaId/frames/$frameId", jsonOf("caption" to caption, "overlays" to overlays.map { it.json() }))
    suspend fun deleteFrame(mediaId: String, frameId: String) = api.delete("/chapters/media/$mediaId/frames/$frameId")
    suspend fun updateMedia(mediaId: String, vararg fields: Pair<String, Any?>) = api.patch("/chapters/media/$mediaId", jsonOf(*fields))
    suspend fun deleteMedia(mediaId: String) = api.delete("/chapters/media/$mediaId")

    suspend fun aiConnections() = runCatching { api.get("/users/me/ai-connections").asObject().objects("connections").map { AiConnection.from(it) } }.getOrDefault(emptyList())
    suspend fun aiJobs(storyId: String) = runCatching { api.get("/stories/$storyId/ai-jobs").asObjects().map { AiJob.from(it) } }.getOrDefault(emptyList())
    suspend fun cancelAiJob(jobId: String) = api.post("/stories/ai-jobs/$jobId/cancel")
    suspend fun aiNarrate(chapterId: String, connectionId: String, label: String?) = api.post("/chapters/$chapterId/ai/narrate", jsonOf("connectionId" to connectionId, "label" to label))
    suspend fun aiTranslateChapter(chapterId: String, connectionId: String) = api.post("/chapters/$chapterId/ai/translate", jsonOf("connectionId" to connectionId))
    suspend fun aiVideo(chapterId: String, connectionId: String, prompt: String, seconds: Int) = api.post("/chapters/$chapterId/ai/video", jsonOf("connectionId" to connectionId, "prompt" to prompt, "seconds" to seconds))
    suspend fun aiComic(chapterId: String, textConnectionId: String, imageConnectionId: String, anchorStart: Int, anchorEnd: Int, frames: Int, style: String?) =
        api.post("/chapters/$chapterId/ai/comic", jsonOf("textConnectionId" to textConnectionId, "imageConnectionId" to imageConnectionId, "anchorStart" to anchorStart, "anchorEnd" to anchorEnd, "frameCount" to frames, "style" to style))

    // --- revisions (CRDT REST, docs/mobile-crdt-spec.md §2a) -------------------------
    suspend fun ensureDoc(vararg ids: Pair<String, String>): String = api.post("/crdt/docs/ensure", jsonOf(*ids)).asObject().s("docKey")
    suspend fun history(docKey: String) = api.get("/crdt/docs/$docKey/history").asObject().objects("revisions").map { Revision.from(it) }
    suspend fun restore(docKey: String, heads: List<String>) = api.post("/crdt/docs/$docKey/restore", jsonOf("toHeads" to heads))
    suspend fun applyContent(docKey: String, value: JsonObject) = api.post("/crdt/docs/$docKey/apply-content", jsonOf("value" to value, "source" to "android-app"))

    // --- screenplays (lib/screenplay.ts, src/lib/screenplayApi.ts) -------------------
    suspend fun screenplay(id: String) = Screenplay.from(api.getCached("/screenplays/$id").asObject())
    suspend fun scenes(id: String): Pair<List<Scene>, List<ScriptBlock>> {
        val o = api.getCached("/screenplays/$id/scenes?includeBlocks=true").asObject()
        return o.objects("scenes").map { Scene.from(it) }.sortedBy { it.index } to o.objects("blocks").map { ScriptBlock.from(it) }.sortedBy { it.index }
    }
    suspend fun workAccess(kind: WorkKind, id: String) = runCatching { WorkAccess.from(api.getCached("/${kind.key}s/$id/my-access").asObject()) }.getOrDefault(WorkAccess.NONE)
    suspend fun updateScreenplay(id: String, vararg fields: Pair<String, Any?>) = api.patch("/screenplays/$id", jsonOf(*fields))
    suspend fun updateWorkSettings(kind: WorkKind, id: String, vararg fields: Pair<String, Any?>) = api.patch("/${kind.key}s/$id/settings", jsonOf(*fields))
    suspend fun deleteWork(kind: WorkKind, id: String) = api.delete("/${kind.key}s/$id")
    suspend fun cloneWork(kind: WorkKind, id: String) = api.post("/${kind.key}s/$id/clone").asObject().s("id")
    suspend fun createScene(screenplayId: String, index: Int, slugline: String) = Scene.from(api.post("/screenplays/$screenplayId/scenes", jsonOf("sceneIndex" to index, "slugline" to slugline)).asObject())
    suspend fun updateScene(sceneId: String, slugline: String) = api.request("PATCH", "/screenplay-scenes/$sceneId", jsonOf("slugline" to slugline), offlineKey = "scene:$sceneId")
    suspend fun deleteScene(sceneId: String) = api.delete("/screenplay-scenes/$sceneId")
    suspend fun reorderScenes(screenplayId: String, ids: List<String>) = api.patch("/screenplays/$screenplayId/scenes/reorder", jsonOf("sceneIds" to ids))
    // The backend rejects empty text; a single space is the established "empty block".
    suspend fun createBlock(screenplayId: String, sceneId: String, type: String, text: String, afterBlockId: String?) =
        ScriptBlock.from(api.post("/screenplays/$screenplayId/blocks", jsonOf("sceneId" to sceneId, "blockType" to type, "text" to text.ifEmpty { " " }, "afterBlockId" to afterBlockId)).asObject())
    suspend fun updateBlockText(blockId: String, text: String) = api.request("PATCH", "/screenplay-blocks/$blockId", jsonOf("text" to text.ifEmpty { " " }), offlineKey = "block:$blockId:text")
    suspend fun updateBlockType(blockId: String, type: String) = api.request("PATCH", "/screenplay-blocks/$blockId", jsonOf("blockType" to type), offlineKey = "block:$blockId:blockType")
    suspend fun deleteBlock(blockId: String) = api.delete("/screenplay-blocks/$blockId")
    suspend fun blockBranches(screenplayId: String) = runCatching { api.getCached("/screenplays/$screenplayId/branches").asObjects().map { BlockBranch.from(it) } }.getOrDefault(emptyList())
    suspend fun createBlockBranch(blockId: String, text: String, name: String?) = api.post("/screenplay-blocks/$blockId/branches", jsonOf("text" to text, "name" to name))
    suspend fun updateBlockBranch(id: String, text: String, name: String?) = api.patch("/screenplay-block-branches/$id", jsonOf("text" to text, "name" to name))
    suspend fun deleteBlockBranch(id: String) = api.delete("/screenplay-block-branches/$id")

    // --- work proposals and team requests (src/lib/workApi.ts) ------------------------
    suspend fun workProposals(kind: WorkKind, id: String) = runCatching { api.get("/${kind.key}s/$id/proposals?status=undecided").asObjects().map { Proposal.from(it) } }.getOrDefault(emptyList())
    suspend fun createWorkProposal(kind: WorkKind, id: String, body: JsonObject) = api.post("/${kind.key}s/$id/proposals", body)
    suspend fun workCollaborationRequests(kind: WorkKind, id: String) =
        runCatching { api.get("/${kind.key}s/$id/collaboration-requests").asObject().objects("requests").map { CollabRequest.from(it) } }.getOrDefault(emptyList())
    suspend fun requestWorkCollaboration(kind: WorkKind, id: String, message: String) = api.post("/${kind.key}s/$id/collaboration-requests", jsonOf("message" to message))
    suspend fun myWorkCollaborationRequest(kind: WorkKind, id: String) =
        runCatching { (api.get("/${kind.key}s/$id/collaboration-requests/mine").asObject()["request"] as? JsonObject)?.let { CollabRequest.from(it) } }.getOrNull()

    // --- comics (lib/comic.ts, src/lib/comicsApi.ts) ------------------------------------
    suspend fun comic(id: String) = Comic.from(api.getCached("/comics/$id").asObject())
    suspend fun updateComicSettings(id: String, vararg fields: Pair<String, Any?>) = api.patch("/comics/$id/settings", jsonOf(*fields))
    suspend fun uploadPages(comicId: String, issueId: String?, files: List<Api.FilePart>) =
        api.upload("POST", "/comics/$comicId/pages", listOfNotNull(issueId?.let { "issueId" to it }).toMap(), files).asObjects().map { ComicPage.from(it) }
    suspend fun reorderPages(comicId: String, ids: List<String>) = api.put("/comics/$comicId/pages/reorder", jsonOf("pageIds" to ids))
    suspend fun updatePage(pageId: String, alt: String? = null, overlays: List<Overlay>? = null) =
        api.patch("/comic-pages/$pageId", jsonOf("alt_text" to alt, "overlays" to overlays?.map { it.json() }))
    suspend fun deletePage(pageId: String) = api.delete("/comic-pages/$pageId")
    suspend fun createIssue(comicId: String, title: String, afterIssueId: String?) = ComicIssue.from(api.post("/comics/$comicId/issues", jsonOf("title" to title, "afterIssueId" to afterIssueId)).asObject())
    suspend fun renameIssue(issueId: String, title: String) = api.patch("/comic-issues/$issueId", jsonOf("title" to title))
    suspend fun publishIssue(issueId: String, published: Boolean) = api.patch("/comic-issues/$issueId/publish", jsonOf("published" to published))
    suspend fun deleteIssue(issueId: String) = api.delete("/comic-issues/$issueId")
    suspend fun reorderIssues(comicId: String, ids: List<String>) = api.put("/comics/$comicId/issues/reorder", jsonOf("issueIds" to ids))
    suspend fun pageBranches(comicId: String) = runCatching { api.getCached("/comics/$comicId/branches").asObjects().map { PageBranch.from(it) } }.getOrDefault(emptyList())
    suspend fun createPageBranch(pageId: String, name: String?, file: Api.FilePart) =
        PageBranch.from(api.upload("POST", "/comic-pages/$pageId/branches", listOfNotNull(name?.let { "name" to it }).toMap(), listOf(file)).asObject())
    suspend fun updatePageBranch(id: String, name: String? = null, overlays: List<Overlay>? = null) =
        api.patch("/comic-page-branches/$id", jsonOf("name" to name, "overlays" to overlays?.map { it.json() }))
    suspend fun deletePageBranch(id: String) = api.delete("/comic-page-branches/$id")
    suspend fun comicRevisions(comicId: String) = runCatching { api.get("/comics/$comicId/revisions").asObjects() }.getOrDefault(emptyList())

    // --- Spaces (lib/spaces.ts) --------------------------------------------------------
    suspend fun items(spaceId: String, path: String): Triple<String, List<SpaceItem>, List<Crumb>> {
        val o = api.getCached("/creative-spaces/$spaceId/items" + qs("path" to path, "userId" to uid), "space:").asObject()
        return Triple(o.s("path"), o.objects("items").map { SpaceItem.from(it) }, o.objects("breadcrumbs").map { Crumb(it.s("name"), it.s("path")) })
    }
    suspend fun contentItems(spaceId: String): List<WorkSummary> = runCatching {
        val o = api.getCached("/creative-spaces/$spaceId/content-items" + qs("userId" to uid), "space:").asObject()
        o.objects("stories").map { WorkSummary(WorkKind.STORY, it.s("story_title_id"), it.s("title"), null, null, null, null) } +
            o.objects("screenplays").map { WorkSummary(WorkKind.SCREENPLAY, it.s("screenplay_id"), it.s("title"), null, null, null, null) } +
            o.objects("comics").map { WorkSummary(WorkKind.COMIC, it.s("comic_id"), it.s("title"), null, null, null, null) }
    }.getOrDefault(emptyList())
    suspend fun item(spaceId: String, itemId: String) = SpaceItem.from(api.getCached("/creative-spaces/$spaceId/items/$itemId" + qs("userId" to uid), "space:").asObject())
    suspend fun createFolder(spaceId: String, parent: String, name: String) = api.post("/creative-spaces/$spaceId/items/folder", jsonOf("parentPath" to parent, "name" to name, "userId" to uid))
    suspend fun createFile(spaceId: String, parent: String, name: String, mime: String?, size: Long) =
        SpaceItem.from(api.post("/creative-spaces/$spaceId/items/file", jsonOf("parentPath" to parent, "name" to name, "userId" to uid, "mimeType" to mime, "sizeBytes" to size)).asObject())
    suspend fun renameItem(itemId: String, name: String) = api.patch("/creative-space-items/$itemId", jsonOf("newName" to name, "userId" to uid))
    suspend fun moveItem(itemId: String, parent: String) = api.patch("/creative-space-items/$itemId", jsonOf("newParentPath" to parent, "userId" to uid))
    suspend fun deleteItem(itemId: String) = api.delete("/creative-space-items/$itemId", jsonOf("userId" to uid))
    fun contentPath(spaceId: String, itemId: String) = "/creative-spaces/$spaceId/items/$itemId/content" + qs("userId" to uid)
    suspend fun readText(spaceId: String, itemId: String): String = try {
        (api.text(contentPath(spaceId, itemId)) ?: "").also { cloud.crowdly.app.crowdly.db.cachePut("file:$itemId", it) }
    } catch (e: java.io.IOException) {
        cloud.crowdly.app.crowdly.db.cacheGet("file:$itemId") ?: throw e
    }
    suspend fun writeText(spaceId: String, itemId: String, content: String): JsonElement {
        cloud.crowdly.app.crowdly.db.cachePut("file:$itemId", content)
        return api.request("PUT", "/creative-spaces/$spaceId/items/$itemId/content", jsonOf("content" to content, "userId" to uid), offlineKey = "file:$itemId")
    }
    suspend fun uploadContent(spaceId: String, itemId: String, name: String, mime: String, bytes: ByteArray) =
        api.upload("POST", "/creative-spaces/$spaceId/items/$itemId/content", mapOf("userId" to (uid ?: "")), listOf(Api.FilePart("file", name, mime, bytes)))
    suspend fun bytes(path: String) = api.bytes(path)

    /** Creates (or overwrites) a file at parent/name (spaces.ts saveFileToSpace). */
    suspend fun saveFileToSpace(spaceId: String, parent: String, name: String, content: String, mime: String): SpaceItem {
        val existing = items(spaceId, parent).second.firstOrNull { !it.isFolder && it.name == name }
        val item = existing ?: createFile(spaceId, parent, name, mime, content.toByteArray().size.toLong())
        writeText(spaceId, item.id, content)
        return item
    }

    suspend fun syncStatus(spaceId: String) = SyncStatus(
        runCatching { api.get("/creative-spaces/$spaceId/github-sync/status" + qs("userId" to uid)).asObject() }.getOrNull(),
        runCatching { api.get("/creative-spaces/$spaceId/drive-sync/status").asObject() }.getOrNull(),
    )
    suspend fun githubToggle(spaceId: String, enabled: Boolean) = api.patch("/creative-spaces/$spaceId/github-sync", jsonOf("userId" to uid, "enabled" to enabled))
    suspend fun githubRun(spaceId: String) = api.post("/creative-spaces/$spaceId/github-sync/run", jsonOf("userId" to uid))
    suspend fun githubDisconnect(spaceId: String) = api.post("/creative-spaces/$spaceId/github-sync/disconnect", jsonOf("userId" to uid))
    suspend fun githubRepos(spaceId: String, installationId: String) =
        api.get("/creative-spaces/$spaceId/github-sync/installation-repos" + qs("installationId" to installationId, "userId" to uid)).asObject().objects("repositories").map { it.s("fullName") }
    suspend fun githubConnect(spaceId: String, installationId: String, repo: String) =
        api.post("/creative-spaces/$spaceId/github-sync/connect", jsonOf("userId" to uid, "installationId" to installationId, "repo" to repo))
    suspend fun driveToggle(spaceId: String, enabled: Boolean) = api.patch("/creative-spaces/$spaceId/drive-sync", jsonOf("enabled" to enabled))
    suspend fun driveRun(spaceId: String) = api.post("/creative-spaces/$spaceId/drive-sync/run")
    suspend fun driveDisconnect(spaceId: String) = api.post("/creative-spaces/$spaceId/drive-sync/disconnect")
    suspend fun driveFolders(spaceId: String, parentId: String) = api.get("/creative-spaces/$spaceId/drive-sync/folders" + qs("parentId" to parentId)).asObject().objects("folders").map { it.s("id") to it.s("name") }
    suspend fun driveConnect(spaceId: String, folderId: String) = api.post("/creative-spaces/$spaceId/drive-sync/connect", jsonOf("folderId" to folderId))

    fun json(v: Any?) = toJson(v)
}
