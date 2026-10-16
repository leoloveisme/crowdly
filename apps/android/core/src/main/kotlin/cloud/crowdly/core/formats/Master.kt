package cloud.crowdly.core.formats

// The desktop's `.master` format (ui/master_document_window.py), twin of
// apps/web/src/formats/master.ts: include containers separated by a bare
// `---` line, each with an optional `[label](link)` line pointing at its
// source file, an optional `## Title` (+ `<!-- title-edited: ts -->`) and the
// container's content. Content lines that are exactly `---`, or a first line
// starting with `## `, are escaped with a backslash. Links are relative to
// the .master file's folder.

data class MasterContainer(val label: String?, val title: String, val titleEditedAt: Double?, val content: String)

private val LINK = Regex("""^\[([^\]]*)\]\(([^)]*)\)$""")
private val META = Regex("""^<!--\s*title-edited:\s*([0-9.]+)\s*-->$""")

fun parseMaster(text: String?): List<MasterContainer> {
    val lines = text.orEmpty().replace("\r\n", "\n").split("\n")
    val out = mutableListOf<MasterContainer>()
    var i = 0
    while (i < lines.size) {
        while (i < lines.size && lines[i].isBlank()) i++
        if (i >= lines.size) break
        var label: String? = null
        LINK.find(lines[i].trim())?.let { label = it.groupValues[1]; i++ }
        var title = ""
        var titleEditedAt: Double? = null
        if (i < lines.size && lines[i].trimStart().startsWith("## ")) {
            title = lines[i].trimStart().substring(3).trim()
            i++
            val meta = if (i < lines.size) META.find(lines[i].trim()) else null
            if (meta != null) {
                titleEditedAt = meta.groupValues[1].toDoubleOrNull()
                i++
            }
        }
        val content = mutableListOf<String>()
        while (i < lines.size && lines[i].trim() != "---") content += lines[i++]
        i++ // the separator
        while (content.isNotEmpty() && content[0].isBlank()) content.removeAt(0)
        val unescaped = content.map { if (it == "\\---") "---" else it }.toMutableList()
        if (unescaped.firstOrNull()?.startsWith("\\## ") == true) unescaped[0] = unescaped[0].substring(1)
        if (label == null && title.isEmpty() && unescaped.joinToString("").isBlank()) continue
        out += MasterContainer(label, title, titleEditedAt, unescaped.joinToString("\n").trimEnd('\n'))
    }
    return out
}

fun serializeMaster(containers: List<MasterContainer>): String {
    val parts = mutableListOf<String>()
    for (c in containers) {
        if (!c.label.isNullOrEmpty()) parts += "[${c.label}](${c.label})"
        if (c.title.isNotBlank()) {
            parts += "## ${c.title.trim()}"
            if (c.titleEditedAt != null && c.titleEditedAt != 0.0) parts += "<!-- title-edited: ${num(c.titleEditedAt)} -->"
        }
        if (c.content.isNotEmpty()) {
            val lines = c.content.trimEnd().split("\n").map { if (it.trim() == "---") "\\---" else it }.toMutableList()
            if (lines.firstOrNull()?.startsWith("## ") == true) lines[0] = "\\${lines[0]}"
            parts += ""
            parts += lines.joinToString("\n")
        }
        parts += listOf("", "---", "")
    }
    return parts.joinToString("\n").trimEnd() + "\n"
}

/** The whole book as one Markdown document (for preview and export). */
fun combineMaster(containers: List<MasterContainer>, title: String): String =
    (listOf("# $title") + containers.map { if (it.title.isNotEmpty()) "## ${it.title}\n\n${it.content}" else it.content }).joinToString("\n\n") + "\n"
