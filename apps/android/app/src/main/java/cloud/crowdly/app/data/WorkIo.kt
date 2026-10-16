package cloud.crowdly.app.data

import cloud.crowdly.app.net.Api
import cloud.crowdly.core.export.markdownToHtml
import cloud.crowdly.core.export.markdownToPlain
import cloud.crowdly.core.export.screenplayToFdx
import cloud.crowdly.core.export.screenplayToFountain
import cloud.crowdly.core.formats.ComicAlternativeDoc
import cloud.crowdly.core.formats.ComicDoc
import cloud.crowdly.core.formats.ComicIssueDoc
import cloud.crowdly.core.formats.ComicLayerDoc
import cloud.crowdly.core.formats.ComicPageDoc
import cloud.crowdly.core.formats.ScreenplayBlockDoc
import cloud.crowdly.core.formats.ScreenplayBranchDoc
import cloud.crowdly.core.formats.ScreenplayDoc
import cloud.crowdly.core.formats.ScreenplaySceneDoc
import cloud.crowdly.core.formats.StoryBranch
import cloud.crowdly.core.formats.StoryChapterDoc
import cloud.crowdly.core.formats.StoryDoc
import cloud.crowdly.core.formats.comicToDsl
import cloud.crowdly.core.formats.screenplayToDsl
import cloud.crowdly.core.formats.screenplayToMarkdown
import cloud.crowdly.core.formats.storyToDsl
import cloud.crowdly.core.formats.storyToMarkdown
import cloud.crowdly.core.text.safeFileName

/**
 * Works ⇄ the shared format docs, the Android twin of
 * apps/web/src/creation/io.ts: load a work as a StoryDoc/ScreenplayDoc/
 * ComicDoc (with Crowdly ids, so a saved file can sync back), create a work
 * from a doc (imports, "Make it a Crowdly story"), and export.
 */
class WorkIo(private val repo: Repo, private val api: Api) {
    suspend fun storyDoc(id: String): StoryDoc {
        val s = repo.story(id)
        val chapters = repo.chapters(id)
        val branches = repo.storyBranches(id)
        return StoryDoc(s.title, chapters.map { c ->
            val br = branches.filter { it.chapterId == c.id }.groupBy { it.paragraphIndex.toString() }
                .mapValues { (_, l) -> l.map { StoryBranch(it.name.orEmpty(), it.text, it.id) } }
            StoryChapterDoc(c.title, c.paragraphs, br, c.id)
        })
    }

    suspend fun screenplayDoc(id: String): ScreenplayDoc {
        val sp = repo.screenplay(id)
        val (scenes, blocks) = repo.scenes(id)
        val branches = repo.blockBranches(id)
        return ScreenplayDoc(sp.title, scenes.map { sc ->
            ScreenplaySceneDoc(
                sc.slugline,
                blocks.filter { it.sceneId == sc.id && it.type != "scene_heading" }.sortedBy { it.index }.map { b ->
                    val alts = branches.filter { it.blockId == b.id }.map { ScreenplayBranchDoc(it.name.orEmpty(), it.text, it.id) }
                    ScreenplayBlockDoc(b.type, b.text.trim(), b.id, alts.ifEmpty { null })
                },
                sc.id,
            )
        })
    }

    suspend fun comicDoc(id: String): ComicDoc {
        val c = repo.comic(id)
        val branches = repo.pageBranches(id)
        val issues = c.issues.ifEmpty { listOf(ComicIssue("", 0, "Issue 1", true)) }
        fun layers(o: List<Overlay>) = o.map { ComicLayerDoc(it.text, it.x, it.y, it.style) }.ifEmpty { null }
        return ComicDoc(c.title, c.direction, issues.map { i ->
            ComicIssueDoc(
                i.title,
                c.pages.filter { i.id.isEmpty() || it.issueId == i.id }.sortedBy { it.index }.map { p ->
                    val alts = branches.filter { it.pageId == p.id }.map { ComicAlternativeDoc(api.mediaUrl(it.imageUrl), it.name.orEmpty(), it.id, layers(it.overlays)) }
                    ComicPageDoc(api.mediaUrl(p.imageUrl), p.alt.orEmpty(), p.id, layers(p.overlays), alts.ifEmpty { null })
                },
                i.id.ifEmpty { null },
            )
        })
    }

    suspend fun createStoryFromDoc(doc: StoryDoc, spaceId: String?): String {
        val first = doc.chapters.firstOrNull()
        val (storyId, firstChapter) = repo.createStory(doc.title, spaceId, first?.title?.ifBlank { null } ?: "Chapter 1", first?.paragraphs?.ifEmpty { null } ?: listOf(""))
        val ids = mutableListOf(firstChapter)
        doc.chapters.drop(1).forEachIndexed { i, ch ->
            ids += repo.createChapter(storyId, ch.title.ifBlank { "Chapter ${i + 2}" }, ch.paragraphs.ifEmpty { listOf("") }, i + 2).id
        }
        doc.chapters.forEachIndexed { ci, ch ->
            for ((idx, list) in ch.branches) for (b in list) runCatching {
                repo.createBranch(ids[ci], idx.toInt(), ch.paragraphs.getOrNull(idx.toInt()).orEmpty(), b.text, b.name)
            }
        }
        return storyId
    }

    suspend fun createScreenplayFromDoc(doc: ScreenplayDoc): String {
        val id = repo.createScreenplay(doc.title)
        // The template comes with a sample scene; replace it with the imported ones.
        repo.scenes(id).first.forEach { runCatching { repo.deleteScene(it.id) } }
        doc.scenes.forEachIndexed { i, sc ->
            val scene = repo.createScene(id, i + 1, sc.slugline.ifBlank { "SCENE ${i + 1}" })
            var after: String? = null
            for (b in sc.blocks) {
                val created = repo.createBlock(id, scene.id, b.type, b.text, after)
                after = created.id
                b.branches.orEmpty().forEach { br -> runCatching { repo.createBlockBranch(created.id, br.text, br.name.ifBlank { null }) } }
            }
        }
        return id
    }

    /** Pages are fetched from their source ([resolve] for Space-relative or local paths, else http) and uploaded. */
    suspend fun createComicFromDoc(doc: ComicDoc, resolve: suspend (String) -> Api.FilePart?): Pair<String, Int> {
        val comicId = repo.createComic(doc.title)
        if (doc.direction == "rtl") runCatching { repo.updateComicSettings(comicId, "reading_direction" to "rtl") }
        val comic = repo.comic(comicId)
        var skipped = 0
        doc.issues.forEachIndexed { i, issue ->
            val issueId = if (i == 0) comic.issues.firstOrNull()?.id else runCatching { repo.createIssue(comicId, issue.title.ifBlank { "Issue ${i + 1}" }, null).id }.getOrNull()
            val files = mutableListOf<Api.FilePart>()
            val sources = mutableListOf<ComicPageDoc>()
            for (p in issue.pages) {
                val f = fetch(p.src, resolve)
                if (f != null) { files += f.copy(field = "images"); sources += p } else skipped++
            }
            if (files.isEmpty()) return@forEachIndexed
            val created = repo.uploadPages(comicId, issueId, files)
            created.forEachIndexed { n, page ->
                val src = sources.getOrNull(n) ?: return@forEachIndexed
                src.layers?.let { ls -> runCatching { repo.updatePage(page.id, overlays = ls.map { Overlay(it.text, it.x, it.y, it.style) }) } }
                for (alt in src.alternatives.orEmpty()) {
                    val f = fetch(alt.src, resolve)
                    if (f == null) { skipped++; continue }
                    val branch = runCatching { repo.createPageBranch(page.id, alt.name.ifBlank { null }, f.copy(field = "image")) }.getOrNull()
                    if (branch != null && !alt.layers.isNullOrEmpty()) runCatching { repo.updatePageBranch(branch.id, overlays = alt.layers!!.map { Overlay(it.text, it.x, it.y, it.style) }) }
                }
            }
        }
        return comicId to skipped
    }

    private suspend fun fetch(src: String, resolve: suspend (String) -> Api.FilePart?): Api.FilePart? = runCatching {
        resolve(src) ?: if (Regex("^(https?:|/)").containsMatchIn(src)) {
            val bytes = api.bytes(api.mediaUrl(src))
            val ext = src.substringAfterLast('.', "png").substringBefore('?').lowercase().take(4)
            Api.FilePart("images", "page.$ext", mimeOf(ext), bytes)
        } else null
    }.getOrNull()

    // --- export -----------------------------------------------------------------------

    data class Exported(val name: String, val mime: String, val bytes: ByteArray)

    enum class Format(val ext: String, val label: String) {
        NATIVE("", "Crowdly file"), MD("md", "Markdown"), TXT("txt", "Plain text"), HTML("html", "Web page (HTML)"), PDF("pdf", "PDF"),
        FOUNTAIN("fountain", "Fountain"), FDX("fdx", "Final Draft (FDX)"),
    }

    fun formatsFor(kind: WorkKind) = when (kind) {
        WorkKind.SCREENPLAY -> Format.entries.toList()
        else -> listOf(Format.NATIVE, Format.MD, Format.TXT, Format.HTML, Format.PDF)
    }

    fun markdownOf(doc: Any): Pair<String, String> = when (doc) {
        is StoryDoc -> doc.title to storyToMarkdown(doc)
        is ScreenplayDoc -> doc.title to screenplayToMarkdown(doc)
        is ComicDoc -> doc.title to (listOf("# ${doc.title}") + doc.issues.flatMap { i -> listOf("## ${i.title}") + i.pages.mapIndexed { n, p -> "![${p.alt.ifBlank { "Page ${n + 1}" }}](${p.src})" } }).joinToString("\n\n") + "\n"
        else -> "Untitled" to ""
    }

    /** The bytes for every format except PDF, which the app prints from [html]. */
    fun export(doc: Any, format: Format): Exported {
        val (title, md) = markdownOf(doc)
        val base = safeFileName(title)
        return when (format) {
            Format.NATIVE -> when (doc) {
                is StoryDoc -> Exported("$base.story", "text/plain", storyToDsl(doc).toByteArray())
                is ScreenplayDoc -> Exported("$base.screenplay", "text/plain", screenplayToDsl(doc).toByteArray())
                is ComicDoc -> Exported("$base.comic", "text/plain", comicToDsl(doc).toByteArray())
                else -> error("unknown doc")
            }
            Format.MD -> Exported("$base.md", "text/markdown", md.toByteArray())
            Format.TXT -> Exported("$base.txt", "text/plain", markdownToPlain(md).toByteArray())
            Format.HTML, Format.PDF -> Exported("$base.html", "text/html", markdownToHtml(md, title, api::mediaUrl).toByteArray())
            Format.FOUNTAIN -> Exported("$base.fountain", "text/plain", screenplayToFountain(doc as ScreenplayDoc).toByteArray())
            Format.FDX -> Exported("$base.fdx", "application/xml", screenplayToFdx(doc as ScreenplayDoc).toByteArray())
        }
    }

    suspend fun loadDoc(kind: WorkKind, id: String): Any = when (kind) {
        WorkKind.STORY -> storyDoc(id)
        WorkKind.SCREENPLAY -> screenplayDoc(id)
        WorkKind.COMIC -> comicDoc(id)
    }

    companion object {
        fun mimeOf(ext: String) = when (ext.lowercase()) {
            "jpg", "jpeg" -> "image/jpeg"; "png" -> "image/png"; "gif" -> "image/gif"; "webp" -> "image/webp"; "svg" -> "image/svg+xml"
            "mp3" -> "audio/mpeg"; "m4a", "m4b" -> "audio/mp4"; "ogg", "opus" -> "audio/ogg"; "wav" -> "audio/wav"; "flac" -> "audio/flac"; "aac" -> "audio/aac"
            "md", "markdown" -> "text/markdown"; "html", "htm" -> "text/html"; "pdf" -> "application/pdf"; "epub" -> "application/epub+zip"
            "story", "screenplay", "comic", "master", "txt", "fountain" -> "text/plain"
            else -> "application/octet-stream"
        }
    }
}
