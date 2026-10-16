package cloud.crowdly.app.reader

import cloud.crowdly.app.data.Discovery
import cloud.crowdly.app.data.Overlay
import cloud.crowdly.app.data.Repo
import cloud.crowdly.app.data.WorkKind
import cloud.crowdly.app.net.Api
import cloud.crowdly.app.net.ApiError
import cloud.crowdly.app.net.objects
import cloud.crowdly.app.net.s
import cloud.crowdly.app.net.str
import cloud.crowdly.app.net.strings
import cloud.crowdly.core.text.splitParagraphs
import java.io.File
import java.util.zip.ZipInputStream
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

/**
 * Turns anything readable into a flat list of blocks the reader can lay out,
 * locate positions in and anchor highlights to: the Android port of
 * apps/web/src/discovery/reader/content.ts. Stories, screenplays and comics
 * come from the API (or an edition's frozen snapshot); library books are
 * EPUB, PDF, audio or text.
 */
sealed interface ReaderBlock {
    val plain: String
    data class Heading(val level: Int, val text: String) : ReaderBlock { override val plain get() = text }
    /** One paragraph of Markdown-ish text. */
    data class Text(val markdown: String) : ReaderBlock { override val plain get() = markdown }
    /** One screenplay element. */
    data class Script(val type: String, val text: String) : ReaderBlock { override val plain get() = text }
    data class Image(val src: String, val alt: String, val overlays: List<Overlay> = emptyList()) : ReaderBlock { override val plain get() = alt }
}

sealed interface Readable {
    val title: String
    val libraryItemId: String?
    data class Blocks(override val title: String, val author: String?, val blocks: List<ReaderBlock>, val rtl: Boolean = false, val comic: Boolean = false, override val libraryItemId: String? = null) : Readable
    data class Pdf(override val title: String, val file: File, override val libraryItemId: String?) : Readable
    data class Audio(override val title: String, val url: String, override val libraryItemId: String?) : Readable
}

class ReaderContent(private val api: Api, private val repo: Repo, private val discovery: Discovery, private val cacheDir: File) {

    suspend fun load(kind: String, id: String, editionId: String?): Readable = when (kind) {
        "story" -> story(id, editionId)
        "screenplay" -> screenplay(id, editionId)
        "comic" -> comic(id, editionId)
        else -> library(id)
    }

    private suspend fun story(id: String, editionId: String?, libraryItemId: String? = null): Readable {
        val s = repo.story(id)
        val chapters: List<Pair<String, List<String>>> = if (editionId != null)
            repo.edition(WorkKind.STORY, editionId).objects("chapters").map { it.s("chapter_title") to it.strings("snapshot_paragraphs") }
        else repo.chapters(id).map { it.title to it.paragraphs }
        val blocks = mutableListOf<ReaderBlock>()
        for ((title, paragraphs) in chapters) {
            blocks += ReaderBlock.Heading(2, title)
            for (p in paragraphs) if (p.isNotBlank()) blocks += paragraphBlock(p)
        }
        return Readable.Blocks(s.title, null, blocks, libraryItemId = libraryItemId)
    }

    private fun paragraphBlock(p: String): ReaderBlock {
        val img = Regex("^!\\[([^\\]]*)\\]\\(([^)\\s]+)\\)$").find(p.trim())
        return if (img != null) ReaderBlock.Image(api.mediaUrl(img.groupValues[2]), img.groupValues[1]) else ReaderBlock.Text(p)
    }

    private suspend fun screenplay(id: String, editionId: String?): Readable {
        val sp = repo.screenplay(id)
        val scenes: List<Pair<String, List<Pair<String, String>>>> = if (editionId != null)
            repo.edition(WorkKind.SCREENPLAY, editionId).objects("parts").map { part -> part.s("title") to part.objects("snapshot").map { it.s("block_type") to it.s("text") } }
        else {
            val (sc, bl) = repo.scenes(id)
            sc.map { s -> s.slugline to bl.filter { it.sceneId == s.id }.sortedBy { it.index }.map { it.type to it.text } }
        }
        val out = mutableListOf<ReaderBlock>()
        for ((slug, blocks) in scenes) {
            out += ReaderBlock.Heading(3, slug)
            for ((t, text) in blocks) if (text.isNotBlank()) out += ReaderBlock.Script(t, text.trim())
        }
        return Readable.Blocks(sp.title, null, out)
    }

    private suspend fun comic(id: String, editionId: String?): Readable {
        val c = repo.comic(id)
        val pages: List<ReaderBlock.Image> = if (editionId != null)
            repo.edition(WorkKind.COMIC, editionId).objects("parts").flatMap { it.objects("snapshot") }.mapIndexed { i, p ->
                ReaderBlock.Image(api.mediaUrl(p.s("image_url")), p.str("alt_text") ?: "Page ${i + 1}", Overlay.list(p.objects("overlays")))
            }
        else {
            val order = c.issues.associate { it.id to it.index }
            c.pages.sortedWith(compareBy({ order[it.issueId] ?: 0 }, { it.index })).mapIndexed { i, p -> ReaderBlock.Image(api.mediaUrl(p.imageUrl), p.alt ?: "Page ${i + 1}", p.overlays) }
        }
        return Readable.Blocks(c.title, null, pages, rtl = c.direction == "rtl", comic = true)
    }

    private suspend fun library(id: String): Readable {
        val item = discovery.libraryItem(id) ?: throw ApiError(404, "This book isn't in your library.")
        if (item.kind == "crowdly_story" && item.storyId != null) return story(item.storyId, null, item.id)
        val path = discovery.libraryFilePath(id)
        return when (item.format) {
            "audio" -> Readable.Audio(item.title, path, item.id)
            "pdf" -> Readable.Pdf(item.title, download(id, path, "pdf"), item.id)
            "epub" -> {
                val (title, author, blocks) = epub(download(id, path, "epub"), id)
                Readable.Blocks(item.title.ifBlank { title }, item.author?.ifBlank { null } ?: author, blocks, libraryItemId = item.id)
            }
            else -> {
                val text = download(id, path, "txt").readText()
                val blocks = splitParagraphs(text).filter { it.isNotBlank() }.map { p ->
                    val h = Regex("^(#{1,3})\\s+(.*)$").find(p.trim())
                    if (h != null && '\n' !in p.trim()) ReaderBlock.Heading(h.groupValues[1].length, h.groupValues[2]) else ReaderBlock.Text(p)
                }
                Readable.Blocks(item.title, item.author, blocks, libraryItemId = item.id)
            }
        }
    }

    /** Library files are kept on the phone after the first download, so books read offline. */
    private suspend fun download(id: String, path: String, ext: String): File = withContext(Dispatchers.IO) {
        val dir = File(cacheDir, "library").apply { mkdirs() }
        val f = File(dir, "$id.$ext")
        if (!f.exists() || f.length() == 0L) {
            val tmp = File(dir, "$id.$ext.part")
            tmp.writeBytes(api.bytes(path))
            tmp.renameTo(f)
        }
        f
    }

    // --- a small EPUB reader (content.ts loadEpub): spine order, chapter bodies, images as files -----

    private data class Epub(val title: String, val author: String?, val blocks: List<ReaderBlock>)

    private suspend fun epub(file: File, id: String): Epub = withContext(Dispatchers.IO) {
        val entries = HashMap<String, ByteArray>()
        ZipInputStream(file.inputStream().buffered()).use { z ->
            while (true) { val e = z.nextEntry ?: break; if (!e.isDirectory) entries[e.name] = z.readBytes() }
        }
        fun text(n: String) = entries[n]?.toString(Charsets.UTF_8)
        val container = text("META-INF/container.xml") ?: error("Not an EPUB")
        val opfPath = Regex("full-path=\"([^\"]+)\"").find(container)?.groupValues?.get(1) ?: error("Not an EPUB")
        val base = opfPath.substringBeforeLast('/', "").let { if (it.isEmpty()) "" else "$it/" }
        val opf = text(opfPath) ?: error("Not an EPUB")
        val title = Regex("<dc:title[^>]*>([\\s\\S]*?)</dc:title>").find(opf)?.groupValues?.get(1)?.let(::decodeEntities)?.trim().orEmpty()
        val author = Regex("<dc:creator[^>]*>([\\s\\S]*?)</dc:creator>").find(opf)?.groupValues?.get(1)?.let(::decodeEntities)?.trim()
        val manifest = Regex("<item\\s[^>]*>").findAll(opf).associate { m ->
            val tag = m.value
            attr(tag, "id") to (attr(tag, "href") to attr(tag, "media-type"))
        }
        val spine = Regex("<itemref\\s[^>]*>").findAll(opf).map { attr(it.value, "idref") }.toList()
        val imgDir = File(cacheDir, "library/$id-img").apply { mkdirs() }
        val blocks = mutableListOf<ReaderBlock>()
        for (ref in spine) {
            val href = manifest[ref]?.first ?: continue
            val path = resolve(base, href)
            val html = text(path) ?: continue
            val body = Regex("<body[^>]*>([\\s\\S]*)</body>", RegexOption.IGNORE_CASE).find(html)?.groupValues?.get(1) ?: html
            blocks += htmlBlocks(body) { src ->
                val p = resolve(path.substringBeforeLast('/', "").let { if (it.isEmpty()) "" else "$it/" }, src)
                val bytes = entries[p] ?: return@htmlBlocks null
                val out = File(imgDir, p.replace('/', '_'))
                if (!out.exists()) out.writeBytes(bytes)
                out.toURI().toString()
            }
        }
        Epub(title, author, blocks)
    }

    private fun attr(tag: String, name: String) = Regex("\\s$name=\"([^\"]*)\"").find(tag)?.groupValues?.get(1).orEmpty()

    private fun resolve(base: String, href: String): String =
        (base + java.net.URLDecoder.decode(href.substringBefore('#'), "UTF-8")).split('/').fold(mutableListOf<String>()) { acc, p ->
            when (p) { "", "." -> Unit; ".." -> acc.removeLastOrNull(); else -> acc += p }
            acc
        }.joinToString("/")

    companion object {
        private val BLOCK_TAGS = setOf("p", "div", "h1", "h2", "h3", "h4", "h5", "h6", "li", "blockquote", "section", "article", "header", "footer", "pre", "tr", "dt", "dd", "figcaption")

        /** HTML → reader blocks: one block per paragraph-level element; bold/italic kept as Markdown marks. */
        fun htmlBlocks(html: String, image: (String) -> String?): List<ReaderBlock> {
            val out = mutableListOf<ReaderBlock>()
            val buf = StringBuilder()
            var heading = 0
            fun flush() {
                val t = buf.toString().replace(Regex("[ \\t\\r\\n]+"), " ").replace(Regex(" *\n *"), "\n").trim()
                if (t.isNotEmpty()) out += if (heading > 0) ReaderBlock.Heading(minOf(heading, 3), t.replace(Regex("[*_]"), "")) else ReaderBlock.Text(t)
                buf.clear()
                heading = 0
            }
            val stripped = html.replace(Regex("<(script|style)[\\s\\S]*?</\\1>", RegexOption.IGNORE_CASE), "")
            for (m in Regex("<[^>]+>|[^<]+").findAll(stripped)) {
                val tok = m.value
                if (!tok.startsWith("<")) { buf.append(decodeEntities(tok)); continue }
                val name = Regex("^</?\\s*([a-zA-Z0-9:]+)").find(tok)?.groupValues?.get(1)?.lowercase()?.substringAfter(':') ?: continue
                val closing = tok.startsWith("</")
                when {
                    name == "br" -> buf.append('\n')
                    name == "img" || name == "image" -> {
                        val src = Regex("(?:src|href)=\"([^\"]+)\"").find(tok)?.groupValues?.get(1) ?: continue
                        val alt = Regex("alt=\"([^\"]*)\"").find(tok)?.groupValues?.get(1).orEmpty()
                        flush()
                        val url = if (Regex("^(https?:|data:)").containsMatchIn(src)) src else image(src)
                        if (url != null) out += ReaderBlock.Image(url, decodeEntities(alt))
                    }
                    name in BLOCK_TAGS -> {
                        flush()
                        if (!closing && name.length == 2 && name[0] == 'h' && name[1].isDigit()) heading = name[1].digitToInt()
                    }
                    name == "b" || name == "strong" -> buf.append("**")
                    name == "i" || name == "em" -> buf.append('*')
                }
            }
            flush()
            return out
        }

        fun decodeEntities(s: String): String = Regex("&(#x[0-9a-fA-F]+|#\\d+|[a-zA-Z]+);").replace(s) { m ->
            val e = m.groupValues[1]
            when {
                e.startsWith("#x") -> e.substring(2).toIntOrNull(16)?.let { String(Character.toChars(it)) } ?: m.value
                e.startsWith("#") -> e.substring(1).toIntOrNull()?.let { String(Character.toChars(it)) } ?: m.value
                else -> mapOf("amp" to "&", "lt" to "<", "gt" to ">", "quot" to "\"", "apos" to "'", "nbsp" to "\u00a0", "mdash" to "—", "ndash" to "–", "hellip" to "…", "rsquo" to "’", "lsquo" to "‘", "rdquo" to "”", "ldquo" to "“")[e] ?: m.value
            }
        }
    }
}
