package cloud.crowdly.core.text

/** One run of a word-level diff: unchanged, only in the old text, or only in the new text. */
data class DiffPart(val kind: Kind, val text: String) {
    enum class Kind { SAME, REMOVED, ADDED }
}

/**
 * Word-level LCS diff for comparing revisions and suggestions (the algorithm
 * is not load-bearing; the platform uses diff-match-patch). Whitespace is
 * kept with the word before it, so joining the parts restores either text.
 */
fun wordDiff(old: String, new: String): List<DiffPart> {
    val a = tokens(old)
    val b = tokens(new)
    // Very long texts: fall back to a whole-text replace rather than an O(n·m) table.
    if (a.size.toLong() * b.size > 4_000_000L) return listOfNotNull(
        DiffPart(DiffPart.Kind.REMOVED, old).takeIf { old.isNotEmpty() },
        DiffPart(DiffPart.Kind.ADDED, new).takeIf { new.isNotEmpty() },
    )
    val lcs = Array(a.size + 1) { IntArray(b.size + 1) }
    for (i in a.indices.reversed()) for (j in b.indices.reversed())
        lcs[i][j] = if (a[i] == b[j]) lcs[i + 1][j + 1] + 1 else maxOf(lcs[i + 1][j], lcs[i][j + 1])
    val out = mutableListOf<DiffPart>()
    fun add(kind: DiffPart.Kind, t: String) {
        if (out.isNotEmpty() && out.last().kind == kind) out[out.lastIndex] = DiffPart(kind, out.last().text + t) else out += DiffPart(kind, t)
    }
    var i = 0; var j = 0
    while (i < a.size && j < b.size) {
        when {
            a[i] == b[j] -> { add(DiffPart.Kind.SAME, a[i]); i++; j++ }
            lcs[i + 1][j] >= lcs[i][j + 1] -> { add(DiffPart.Kind.REMOVED, a[i]); i++ }
            else -> { add(DiffPart.Kind.ADDED, b[j]); j++ }
        }
    }
    while (i < a.size) add(DiffPart.Kind.REMOVED, a[i++])
    while (j < b.size) add(DiffPart.Kind.ADDED, b[j++])
    return out
}

private fun tokens(s: String): List<String> = Regex("\\S+\\s*|\\s+").findAll(s).map { it.value }.toList()
