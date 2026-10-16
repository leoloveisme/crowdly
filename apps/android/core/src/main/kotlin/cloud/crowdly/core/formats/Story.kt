package cloud.crowdly.core.formats

// .story ⇄ the backend's chapter model (title + paragraphs[] + branches by
// paragraph index). Twin of apps/web/src/formats/story.ts and
// apps/desktop/src/editor/format/story_markup.py.

/** An alternative version of a paragraph; [id] is set on files synced with Crowdly (Documentation/branching-api.md). */
data class StoryBranch(val name: String, val text: String, val id: String? = null)

data class StoryChapterDoc(
    val title: String,
    val paragraphs: List<String>,
    /** Branches by paragraph index (as a string key, like the JSON fixtures). */
    val branches: Map<String, List<StoryBranch>> = emptyMap(),
    val id: String? = null,
)

data class StoryDoc(val title: String, val chapters: List<StoryChapterDoc>)

private class MutableChapter(val title: String, val id: String?) {
    val paragraphs = mutableListOf<String>()
    val branches = LinkedHashMap<String, MutableList<StoryBranch>>()
    fun freeze() = StoryChapterDoc(title, paragraphs.toList(), branches.mapValues { it.value.toList() }, id)
}

fun parseStory(text: String): StoryDoc {
    var title = ""
    val chapters = mutableListOf<MutableChapter>()
    fun current(): MutableChapter {
        if (chapters.isEmpty()) chapters += MutableChapter("", null)
        return chapters.last()
    }
    for (b in parseBlocks(text)) {
        when (b.tag) {
            "story_title" -> title = b.body.trim()
            "chapter_title" -> chapters += MutableChapter(b.body.trim(), b.attrs["id"]?.takeIf { it.isNotEmpty() })
            "branch" -> {
                val ch = current()
                if (ch.paragraphs.isEmpty()) ch.paragraphs += ""
                val key = (ch.paragraphs.size - 1).toString()
                ch.branches.getOrPut(key) { mutableListOf() } += StoryBranch(b.attrs["name"].orEmpty(), b.body, b.attrs["id"]?.takeIf { it.isNotEmpty() })
            }
            "image" -> current().paragraphs += "![${b.attrs["alt"].orEmpty()}](${imageSource(b.body)})"
            else -> current().paragraphs += b.body
        }
    }
    return StoryDoc(title, chapters.map { it.freeze() })
}

fun storyToDsl(doc: StoryDoc): String {
    val lines = mutableListOf(block("story_title", doc.title.ifEmpty { "Untitled" }, mapOf("align" to "center")), "")
    for (ch in doc.chapters) {
        lines += block("chapter_title", ch.title, mapOf("align" to "left", "id" to ch.id.orEmpty()))
        lines += ""
        ch.paragraphs.forEachIndexed { i, p ->
            lines += block("paragraph", p, mapOf("align" to "left"))
            lines += ""
            for (br in ch.branches[i.toString()].orEmpty()) {
                lines += block("branch", br.text, mapOf("name" to br.name, "id" to br.id.orEmpty()))
                lines += ""
            }
        }
    }
    return lines.joinToString("\n").trimEnd() + "\n"
}

/** Markdown with # / ## headings → story doc (chapters split at the chapter-level heading). */
fun storyFromMarkdown(md: String, fallbackTitle: String = ""): StoryDoc {
    val text = md.replace("\r\n", "\n")
    val h1 = Regex("^# (.+)$", RegexOption.MULTILINE).findAll(text).toList()
    val h2 = Regex("^## (.+)$", RegexOption.MULTILINE).findAll(text).toList()
    // One "#" + several "##" → # is the title; several "#" → each is a chapter.
    val chapterMark = if (h2.isNotEmpty()) "## " else if (h1.size > 1) "# " else null
    var title = fallbackTitle
    if (chapterMark == "## " && h1.isNotEmpty()) title = h1[0].groupValues[1].trim()
    val chapters = mutableListOf<MutableChapter>()
    var cur: MutableChapter? = null
    for (para in splitParagraphs(text)) {
        val p = para.trim()
        if (p.isEmpty()) continue
        if (chapterMark != null && p.startsWith(chapterMark) && '\n' !in p) {
            cur = MutableChapter(p.substring(chapterMark.length).trim(), null)
            chapters += cur
        } else if (p.startsWith("# ") && '\n' !in p && chapterMark == "## ") {
            continue // the story title
        } else {
            if (cur == null) {
                cur = MutableChapter("Chapter 1", null)
                chapters += cur
            }
            cur.paragraphs += p
        }
    }
    if (chapters.isEmpty()) chapters += MutableChapter("Chapter 1", null).apply { paragraphs += "" }
    return StoryDoc(title.ifEmpty { "Untitled" }, chapters.map { it.freeze() })
}

fun storyToMarkdown(doc: StoryDoc): String {
    val out = mutableListOf("# ${doc.title}")
    for (ch in doc.chapters) {
        out += "## ${ch.title}"
        for (p in ch.paragraphs) if (p.isNotBlank()) out += p
    }
    return out.joinToString("\n\n") + "\n"
}
