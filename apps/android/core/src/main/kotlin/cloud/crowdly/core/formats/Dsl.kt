package cloud.crowdly.core.formats

// Shared block parser for the .story, .screenplay and .comic formats: the
// Kotlin twin of apps/web/src/formats/dsl.ts and
// apps/desktop/src/editor/format/dsl.py. All three are checked against
// apps/desktop/tests/fixtures/formats. Spec:
// Documentation/Crowdly_file_formats_story_screenplay_comic.md
//
//   [tag attr key=value key="quoted value"]body[/tag]

data class Block(val tag: String, val attrs: Map<String, String>, val body: String)

private val ALIGN = setOf("left", "center", "right", "justify")
private val TOKEN = Regex("""([\w-]+)="([^"]*)"|(\S+)""")
private val OPEN = Regex("""^\[([a-z_]+)(\s[^\]]*)?\]""")
private val NEEDS_QUOTES = Regex("""[\s"\]]""")

fun parseAttrs(text: String?): Map<String, String> {
    val attrs = LinkedHashMap<String, String>()
    for (m in TOKEN.findAll(text.orEmpty())) {
        val key = m.groups[1]?.value
        if (key != null) {
            attrs[key] = m.groups[2]?.value.orEmpty()
            continue
        }
        val token = m.groups[3]!!.value
        if ('=' in token) {
            val at = token.indexOf('=')
            attrs[token.substring(0, at).trim()] = token.substring(at + 1).trim()
        } else if (token in ALIGN && "align" !in attrs) {
            attrs["align"] = token
        } else {
            attrs[token] = "1"
        }
    }
    return attrs
}

fun formatAttrs(attrs: Map<String, String?>): String {
    val parts = mutableListOf<String>()
    attrs["align"]?.takeIf { it.isNotEmpty() }?.let { parts += it }
    for ((k, v) in attrs) {
        if (k == "align" || v.isNullOrEmpty()) continue
        parts += when {
            v == "1" -> k
            NEEDS_QUOTES.containsMatchIn(v) -> "$k=\"${v.replace('"', '\'')}\""
            else -> "$k=$v"
        }
    }
    return if (parts.isEmpty()) "" else " " + parts.joinToString(" ")
}

private fun trimNewlines(s: String) = s.trim('\n')

fun parseBlocks(text: String?): List<Block> {
    val lines = text.orEmpty().replace("\r\n", "\n").split("\n")
    val blocks = mutableListOf<Block>()
    val raw = mutableListOf<String>()
    fun flushRaw() {
        if (raw.isNotEmpty()) {
            val body = trimNewlines(raw.joinToString("\n"))
            if (body.isNotBlank()) blocks += Block("raw", emptyMap(), body)
            raw.clear()
        }
    }

    var i = 0
    while (i < lines.size) {
        val line = lines[i]
        val stripped = line.trim()
        val m = OPEN.find(stripped)
        if (m == null) {
            if (stripped.isNotEmpty()) raw += line else flushRaw()
            i++
            continue
        }
        val tag = m.groupValues[1]
        val close = "[/$tag]"
        val rest = stripped.substring(m.value.length)
        // "[sic]" and other bracketed prose without a closing tag is text.
        if (close !in rest && lines.drop(i + 1).none { close in it }) {
            raw += line
            i++
            continue
        }
        flushRaw()
        val attrs = parseAttrs(m.groups[2]?.value.orEmpty())
        val body = mutableListOf<String>()
        if (close in rest) {
            body += rest.substring(0, rest.indexOf(close))
        } else {
            body += rest
            i++
            while (i < lines.size && close !in lines[i]) body += lines[i++]
            if (i < lines.size) body += lines[i].substring(0, lines[i].indexOf(close))
        }
        blocks += Block(tag, attrs, trimNewlines(body.joinToString("\n")))
        i++
    }
    flushRaw()
    return blocks
}

fun imageSource(body: String): String {
    val b = body.trim()
    return if (b.startsWith("(") && b.endsWith(")")) b.substring(1, b.length - 1).trim() else b
}

fun block(tag: String, body: String, attrs: Map<String, String?> = emptyMap()) = "[$tag${formatAttrs(attrs)}]$body[/$tag]"

fun escapeHtml(s: String): String = buildString(s.length) {
    for (c in s) append(
        when (c) {
            '&' -> "&amp;"
            '<' -> "&lt;"
            '>' -> "&gt;"
            '"' -> "&quot;"
            '\'' -> "&#x27;"
            else -> c
        },
    )
}

/** Splits text into paragraphs at blank lines, like the web's `split(/\n\s*\n/)`. */
internal fun splitParagraphs(text: String): List<String> = text.replace("\r\n", "\n").split(Regex("\n\\s*\n"))
