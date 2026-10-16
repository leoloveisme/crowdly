package cloud.crowdly.core.export

import cloud.crowdly.core.formats.ScreenplayDoc
import cloud.crowdly.core.formats.escapeHtml
import cloud.crowdly.core.text.MdBlock
import cloud.crowdly.core.text.Span
import cloud.crowdly.core.text.parseInline
import cloud.crowdly.core.text.parseMarkdownBlocks

// Exports that need no server: Markdown → HTML / plain text, and screenplay
// docs → Fountain / Final Draft (FDX). PDF is printed from the HTML by the app.

fun markdownToPlain(md: String): String = md.replace(Regex("(?m)^#+\\s*"), "").replace(Regex("[*_~`]"), "")

private fun spansHtml(spans: List<Span>) = spans.joinToString("") { s ->
    var t = escapeHtml(s.text).replace("\n", "<br />")
    if (s.code) t = "<code>$t</code>"
    if (s.bold) t = "<strong>$t</strong>"
    if (s.italic) t = "<em>$t</em>"
    if (s.strike) t = "<s>$t</s>"
    if (s.underline) t = "<u>$t</u>"
    if (s.link != null) t = "<a href=\"${escapeHtml(s.link)}\">$t</a>"
    t
}

fun markdownToHtml(md: String, title: String, resolveImage: (String) -> String = { it }): String {
    val body = parseMarkdownBlocks(md).joinToString("\n") { b ->
        when (b) {
            is MdBlock.Heading -> "<h${b.level}>${spansHtml(parseInline(b.text))}</h${b.level}>"
            is MdBlock.Paragraph -> "<p>${spansHtml(parseInline(b.text))}</p>"
            is MdBlock.Image -> "<p><img src=\"${escapeHtml(resolveImage(b.src))}\" alt=\"${escapeHtml(b.alt)}\" /></p>"
            is MdBlock.Quote -> "<blockquote>${spansHtml(parseInline(b.text))}</blockquote>"
            is MdBlock.ListItems -> (if (b.ordered) "<ol>" else "<ul>") + b.items.joinToString("") { "<li>${spansHtml(parseInline(it))}</li>" } + (if (b.ordered) "</ol>" else "</ul>")
            MdBlock.Rule -> "<hr />"
        }
    }
    return """<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title>
<style>body{font-family:Georgia,serif;max-width:40em;margin:2em auto;line-height:1.6;padding:0 1em}img{max-width:100%}h1{text-align:center}</style>
</head><body>
$body
</body></html>
"""
}

fun screenplayToFountain(doc: ScreenplayDoc): String {
    val out = mutableListOf("Title: ${doc.title}", "")
    for (sc in doc.scenes) {
        val slug = sc.slugline.trim().ifEmpty { "SCENE" }
        out += if (Regex("^(INT|EXT|EST|INT\\./EXT|I/E)[. ]", RegexOption.IGNORE_CASE).containsMatchIn(slug)) slug.uppercase() else ".$slug"
        out += ""
        for (b in sc.blocks) {
            val t = b.text.trim()
            when (b.type) {
                "character" -> { out += t.uppercase() }
                "dialogue" -> { out += t; out += "" }
                "parenthetical" -> { out += if (t.startsWith("(")) t else "($t)" }
                "transition" -> { out += "> ${t.uppercase()}"; out += "" }
                "shot" -> { out += t.uppercase(); out += "" }
                else -> { out += t; out += "" }
            }
        }
    }
    return out.joinToString("\n").replace(Regex("\n{3,}"), "\n\n").trimEnd() + "\n"
}

private val FDX_TYPE = mapOf(
    "action" to "Action", "character" to "Character", "dialogue" to "Dialogue", "parenthetical" to "Parenthetical",
    "transition" to "Transition", "shot" to "Shot", "general" to "General",
)

fun screenplayToFdx(doc: ScreenplayDoc): String {
    val sb = StringBuilder()
    sb.append("<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"no\" ?>\n<FinalDraft DocumentType=\"Script\" Template=\"No\" Version=\"5\">\n<Content>\n")
    fun para(type: String, text: String) = sb.append("<Paragraph Type=\"$type\"><Text>${escapeHtml(text)}</Text></Paragraph>\n")
    for (sc in doc.scenes) {
        para("Scene Heading", sc.slugline.uppercase())
        for (b in sc.blocks) para(FDX_TYPE[b.type] ?: "Action", b.text.trim())
    }
    sb.append("</Content>\n<TitlePage><Content><Paragraph Type=\"Title\"><Text>${escapeHtml(doc.title)}</Text></Paragraph></Content></TitlePage>\n</FinalDraft>\n")
    return sb.toString()
}
