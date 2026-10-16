package cloud.crowdly.core.formats

// .screenplay ⇄ the backend's scene/block model. Twin of
// apps/web/src/formats/screenplay.ts and format/screenplay_markup.py; element
// names match screenplay_block.block_type.

val SCREENPLAY_ELEMENTS = listOf("action", "character", "dialogue", "parenthetical", "transition", "shot", "general")

/** An alternative version of one element; ids are present on files synced with Crowdly. */
data class ScreenplayBranchDoc(val name: String, val text: String, val id: String? = null)

data class ScreenplayBlockDoc(
    val type: String,
    val text: String,
    val id: String? = null,
    val branches: List<ScreenplayBranchDoc>? = null,
)

data class ScreenplaySceneDoc(val slugline: String, val blocks: List<ScreenplayBlockDoc>, val id: String? = null)

data class ScreenplayDoc(val title: String, val scenes: List<ScreenplaySceneDoc>)

fun isScreenplayElement(t: String) = t in SCREENPLAY_ELEMENTS

fun parseScreenplay(text: String): ScreenplayDoc {
    var title = ""
    class Scene(val slugline: String, val id: String?) { val blocks = mutableListOf<ScreenplayBlockDoc>() }
    val scenes = mutableListOf<Scene>()
    fun current(): Scene {
        if (scenes.isEmpty()) scenes += Scene("", null)
        return scenes.last()
    }
    for (b in parseBlocks(text)) {
        val id = b.attrs["id"]?.takeIf { it.isNotEmpty() }
        when (b.tag) {
            "screenplay_title" -> title = b.body.trim()
            "scene_slugline", "scene_heading" -> scenes += Scene(b.body.trim(), id)
            "branch" -> {
                // An alternative for the element just before it.
                val blocks = current().blocks
                if (blocks.isEmpty()) blocks += ScreenplayBlockDoc("action", "")
                val last = blocks.last()
                blocks[blocks.lastIndex] = last.copy(branches = last.branches.orEmpty() + ScreenplayBranchDoc(b.attrs["name"].orEmpty(), b.body, id))
            }
            else -> current().blocks += ScreenplayBlockDoc(if (isScreenplayElement(b.tag)) b.tag else "action", b.body, id)
        }
    }
    return ScreenplayDoc(title, scenes.map { ScreenplaySceneDoc(it.slugline, it.blocks.toList(), it.id) })
}

fun screenplayToDsl(doc: ScreenplayDoc): String {
    val lines = mutableListOf(block("screenplay_title", doc.title.ifEmpty { "Untitled Screenplay" }, mapOf("align" to "center")), "")
    for (sc in doc.scenes) {
        lines += block("scene_slugline", sc.slugline, mapOf("align" to "left", "id" to sc.id.orEmpty()))
        lines += ""
        for (b in sc.blocks) {
            lines += block(if (isScreenplayElement(b.type)) b.type else "action", b.text, mapOf("id" to b.id.orEmpty()))
            lines += ""
            for (br in b.branches.orEmpty()) {
                lines += block("branch", br.text, mapOf("name" to br.name, "id" to br.id.orEmpty()))
                lines += ""
            }
        }
    }
    return lines.joinToString("\n").trimEnd() + "\n"
}

/** Fountain-style guess for one plain line, given the element before it (same rules as the desktop). */
fun guessElement(text: String, previous: String?): String {
    val t = text.trim()
    val upper = t == t.uppercase() && t.any { it in 'A'..'Z' || it in 'a'..'z' }
    if (t.startsWith("(") && t.endsWith(")") && (previous == "character" || previous == "dialogue")) return "parenthetical"
    if (previous == "character" || previous == "parenthetical") return "dialogue"
    if (upper && t.endsWith("TO:")) return "transition"
    if (upper && t.length <= 40 && '\n' !in t) return "character"
    return "action"
}

private val SLUG = Regex("^(INT|EXT|INT\\./EXT|I/E)[. ]", RegexOption.IGNORE_CASE)
private val HEADING = Regex("^(#{1,3})\\s+(.*)$")

/** Markdown (# title, ## sluglines, paragraphs) → screenplay doc. */
fun screenplayFromMarkdown(md: String, fallbackTitle: String = ""): ScreenplayDoc {
    var title = fallbackTitle
    class Scene(val slugline: String) { val blocks = mutableListOf<ScreenplayBlockDoc>() }
    val scenes = mutableListOf<Scene>()
    var prev: String? = null
    for (para in splitParagraphs(md)) {
        val p = para.trim()
        if (p.isEmpty()) continue
        val h = HEADING.find(p)
        if (h != null && h.groupValues[1].length == 1 && title.isEmpty()) {
            title = h.groupValues[2].trim()
        } else if (h != null || SLUG.containsMatchIn(p)) {
            scenes += Scene((h?.groupValues?.get(2) ?: p).trim())
            prev = null
        } else {
            if (scenes.isEmpty()) scenes += Scene("")
            val type = guessElement(p, prev)
            scenes.last().blocks += ScreenplayBlockDoc(type, p)
            prev = type
        }
    }
    return ScreenplayDoc(title.ifEmpty { "Untitled Screenplay" }, scenes.map { ScreenplaySceneDoc(it.slugline, it.blocks.toList()) })
}

/** Screenplay doc → Markdown for the exporters (PDF/FDX/Fountain…). */
fun screenplayToMarkdown(doc: ScreenplayDoc): String {
    val out = mutableListOf("# ${doc.title}")
    for (sc in doc.scenes) {
        out += "## ${sc.slugline}"
        for (b in sc.blocks) out += if (b.type == "character" || b.type == "transition") b.text.uppercase() else b.text
    }
    return out.joinToString("\n\n") + "\n"
}
