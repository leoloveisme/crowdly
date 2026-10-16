package cloud.crowdly.core.text

// A chapter is stored as paragraphs[] (stories.paragraphs); in the editor it
// is one Markdown text with paragraphs separated by a blank line, the same
// model as apps/web/src/creation/markdown.ts and the desktop's Markdown pane.

fun splitParagraphs(markdown: String): List<String> {
    val parts = markdown.replace("\r\n", "\n").split(Regex("\n[ \t]*\n+")).map { it.trim('\n') }
    val nonEmpty = parts.filter { it.isNotBlank() }
    return nonEmpty.ifEmpty { listOf("") }
}

fun joinParagraphs(paragraphs: List<String>): String =
    paragraphs.filterIndexed { i, p -> p.isNotBlank() || i == 0 }.joinToString("\n\n")

/** Plain text of a Markdown string, for word counts and search (markdown.ts mdToPlain). */
fun mdToPlain(markdown: String): String = markdown
    .replace(Regex("<[^>]+>"), "")
    .replace(Regex("!\\[[^\\]]*\\]\\([^)]*\\)"), "")
    .replace(Regex("\\[([^\\]]*)\\]\\([^)]*\\)"), "$1")
    .replace(Regex("[*_~`#>]+"), "")

fun countWords(text: String): Int = text.trim().let { if (it.isEmpty()) 0 else it.split(Regex("\\s+")).size }

fun safeFileName(name: String): String = name.ifBlank { "untitled" }.replace(Regex("[\\\\/:*?\"<>|]+"), "_").take(120)

/** One block of rendered Markdown: what the editor preview and the reader lay out. */
sealed interface MdBlock {
    data class Heading(val level: Int, val text: String) : MdBlock
    data class Paragraph(val text: String) : MdBlock
    data class Image(val src: String, val alt: String) : MdBlock
    data class Quote(val text: String) : MdBlock
    data class ListItems(val ordered: Boolean, val items: List<String>) : MdBlock
    data object Rule : MdBlock
}

private val IMAGE_ONLY = Regex("^!\\[([^\\]]*)\\]\\(([^)\\s]+)(?:\\s+\"[^\"]*\")?\\)$")
private val HEADING = Regex("^(#{1,6})\\s+(.*)$")
private val BULLET = Regex("^\\s*[-*+]\\s+(.*)$")
private val NUMBERED = Regex("^\\s*\\d+[.)]\\s+(.*)$")

/** Block-level Markdown, enough for stories and Space files (headings, paragraphs, images, quotes, lists, rules). */
fun parseMarkdownBlocks(markdown: String): List<MdBlock> {
    val out = mutableListOf<MdBlock>()
    for (para in markdown.replace("\r\n", "\n").split(Regex("\n[ \t]*\n+"))) {
        val p = para.trim('\n')
        if (p.isBlank()) continue
        val lines = p.split("\n")
        val first = lines[0].trim()
        when {
            lines.size == 1 && HEADING.matches(first) -> HEADING.find(first)!!.let { out += MdBlock.Heading(it.groupValues[1].length, it.groupValues[2].trim()) }
            lines.size == 1 && IMAGE_ONLY.matches(first) -> IMAGE_ONLY.find(first)!!.let { out += MdBlock.Image(it.groupValues[2], it.groupValues[1]) }
            lines.size == 1 && Regex("^(-{3,}|\\*{3,}|_{3,})$").matches(first) -> out += MdBlock.Rule
            lines.all { it.trimStart().startsWith(">") } -> out += MdBlock.Quote(lines.joinToString("\n") { it.trimStart().removePrefix(">").trimStart() })
            lines.all { BULLET.matches(it) } -> out += MdBlock.ListItems(false, lines.map { BULLET.find(it)!!.groupValues[1] })
            lines.all { NUMBERED.matches(it) } -> out += MdBlock.ListItems(true, lines.map { NUMBERED.find(it)!!.groupValues[1] })
            HEADING.matches(first) -> {
                HEADING.find(first)!!.let { out += MdBlock.Heading(it.groupValues[1].length, it.groupValues[2].trim()) }
                out += MdBlock.Paragraph(lines.drop(1).joinToString("\n"))
            }
            else -> out += MdBlock.Paragraph(p)
        }
    }
    return out
}

/** Inline spans of one Markdown paragraph: **bold**, *italic* or _italic_, ~~strike~~, `code`, [links](url); HTML tags are dropped. */
data class Span(val text: String, val bold: Boolean = false, val italic: Boolean = false, val strike: Boolean = false, val code: Boolean = false, val link: String? = null, val underline: Boolean = false)

fun parseInline(text: String): List<Span> {
    val out = mutableListOf<Span>()
    var bold = false; var italic = false; var strike = false; var underline = false
    val buf = StringBuilder()
    fun flush() { if (buf.isNotEmpty()) { out += Span(buf.toString(), bold, italic, strike, underline = underline); buf.clear() } }
    var i = 0
    val s = text
    while (i < s.length) {
        val c = s[i]
        when {
            c == '\\' && i + 1 < s.length -> { buf.append(s[i + 1]); i += 2 }
            s.startsWith("<u>", i) -> { flush(); underline = true; i += 3 }
            s.startsWith("</u>", i) -> { flush(); underline = false; i += 4 }
            c == '<' && Regex("^</?[a-zA-Z][^>]*>").find(s.substring(i)) != null -> {
                i += Regex("^</?[a-zA-Z][^>]*>").find(s.substring(i))!!.value.length
            }
            s.startsWith("**", i) || s.startsWith("__", i) -> { flush(); bold = !bold; i += 2 }
            s.startsWith("~~", i) -> { flush(); strike = !strike; i += 2 }
            (c == '*' || c == '_') && !(c == '_' && i > 0 && s[i - 1].isLetterOrDigit() && i + 1 < s.length && s[i + 1].isLetterOrDigit()) -> { flush(); italic = !italic; i++ }
            c == '`' -> {
                val end = s.indexOf('`', i + 1)
                if (end > i) { flush(); out += Span(s.substring(i + 1, end), code = true); i = end + 1 } else { buf.append(c); i++ }
            }
            c == '[' -> {
                val m = Regex("^\\[([^\\]]*)\\]\\(([^)\\s]+)\\)").find(s.substring(i))
                if (m != null) { flush(); out += Span(m.groupValues[1], bold, italic, strike, link = m.groupValues[2]); i += m.value.length } else { buf.append(c); i++ }
            }
            c == '!' && i + 1 < s.length && s[i + 1] == '[' -> {
                val m = Regex("^!\\[([^\\]]*)\\]\\(([^)\\s]+)\\)").find(s.substring(i))
                if (m != null) { flush(); out += Span("🖼 ${m.groupValues[1]}", italic = true); i += m.value.length } else { buf.append(c); i++ }
            }
            else -> { buf.append(c); i++ }
        }
    }
    flush()
    return out
}
