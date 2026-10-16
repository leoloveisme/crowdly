package cloud.crowdly.core.formats

// .comic ⇄ comic issues and pages. Twin of apps/web/src/formats/comic.ts and
// format/comic_markup.py.

/** A speech bubble / caption box at x/y percent of the image. */
data class ComicLayerDoc(val text: String, val x: Double, val y: Double, val style: String = "bubble")

/** An alternative version of a page (branch), with its own layers. */
data class ComicAlternativeDoc(val src: String, val name: String, val id: String? = null, val layers: List<ComicLayerDoc>? = null)

data class ComicPageDoc(
    val src: String,
    val alt: String,
    val id: String? = null,
    val layers: List<ComicLayerDoc>? = null,
    val alternatives: List<ComicAlternativeDoc>? = null,
)

data class ComicIssueDoc(val title: String, val pages: List<ComicPageDoc>, val id: String? = null)

data class ComicDoc(val title: String, val direction: String, val issues: List<ComicIssueDoc>)

private fun pct(v: String?): Double = (v?.trim()?.toDoubleOrNull() ?: 0.0).let { if (it.isNaN()) 0.0 else it.coerceIn(0.0, 100.0) }

private fun layerOf(attrs: Map<String, String>, body: String) =
    ComicLayerDoc(body, pct(attrs["x"]), pct(attrs["y"]), if (attrs["style"] == "box") "box" else "bubble")

/** Formats a number the way JS's String(number) does for ordinary values: 40, not 40.0, and never 1.76E9. */
fun num(d: Double): String =
    if (d.isNaN() || d.isInfinite()) "0" else java.math.BigDecimal.valueOf(d).stripTrailingZeros().toPlainString()

private fun layerBlock(l: ComicLayerDoc) = block("layer", l.text, mapOf("x" to num(l.x), "y" to num(l.y), "style" to l.style.ifEmpty { "bubble" }))

fun parseComic(text: String): ComicDoc {
    var title = ""
    var direction = "ltr"
    class Alt(val src: String, val name: String, val id: String?) { val layers = mutableListOf<ComicLayerDoc>() }
    class Page(val src: String, val alt: String, val id: String?) { val layers = mutableListOf<ComicLayerDoc>(); val alternatives = mutableListOf<Alt>() }
    class Issue(val title: String, val id: String?) { val pages = mutableListOf<Page>() }
    val issues = mutableListOf<Issue>()
    fun current(): Issue {
        if (issues.isEmpty()) issues += Issue("Issue 1", null)
        return issues.last()
    }
    // A [layer] belongs to the page or alternative just before it.
    var layerTarget: MutableList<ComicLayerDoc>? = null
    for (b in parseBlocks(text)) {
        val id = b.attrs["id"]?.takeIf { it.isNotEmpty() }
        when (b.tag) {
            "comic_title" -> {
                title = b.body.trim()
                direction = if (b.attrs["direction"] == "rtl") "rtl" else "ltr"
            }
            "issue" -> {
                issues += Issue(b.body.trim(), id)
                layerTarget = null
            }
            "page" -> {
                val page = Page(imageSource(b.body), b.attrs["alt"].orEmpty(), id)
                current().pages += page
                layerTarget = page.layers
            }
            "alt" -> {
                val pages = current().pages
                if (pages.isEmpty()) continue
                val alt = Alt(imageSource(b.body), b.attrs["name"].orEmpty(), id)
                pages.last().alternatives += alt
                layerTarget = alt.layers
            }
            "layer" -> layerTarget?.add(layerOf(b.attrs, b.body))
        }
    }
    return ComicDoc(
        title,
        direction,
        issues.map { issue ->
            ComicIssueDoc(
                issue.title,
                issue.pages.map { p ->
                    ComicPageDoc(
                        p.src, p.alt, p.id,
                        p.layers.toList().ifEmpty { null },
                        p.alternatives.map { a -> ComicAlternativeDoc(a.src, a.name, a.id, a.layers.toList().ifEmpty { null }) }.ifEmpty { null },
                    )
                },
                issue.id,
            )
        },
    )
}

fun comicToDsl(doc: ComicDoc): String {
    val lines = mutableListOf(block("comic_title", doc.title.ifEmpty { "Untitled comic" }, mapOf("align" to "center", "direction" to doc.direction.ifEmpty { "ltr" })), "")
    for (issue in doc.issues) {
        lines += block("issue", issue.title, mapOf("id" to issue.id.orEmpty())); lines += ""
        for (p in issue.pages) {
            lines += block("page", "(${p.src})", mapOf("alt" to p.alt, "id" to p.id.orEmpty())); lines += ""
            for (l in p.layers.orEmpty()) { lines += layerBlock(l); lines += "" }
            for (a in p.alternatives.orEmpty()) {
                lines += block("alt", "(${a.src})", mapOf("name" to a.name, "id" to a.id.orEmpty())); lines += ""
                for (l in a.layers.orEmpty()) { lines += layerBlock(l); lines += "" }
            }
        }
    }
    return lines.joinToString("\n").trimEnd() + "\n"
}
