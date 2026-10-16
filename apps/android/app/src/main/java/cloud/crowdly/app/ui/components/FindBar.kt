package cloud.crowdly.app.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.KeyboardArrowDown
import androidx.compose.material.icons.filled.KeyboardArrowUp
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.TextRange
import androidx.compose.ui.unit.dp
import cloud.crowdly.app.i18n.AppText
import cloud.crowdly.app.i18n.tr

/** All matches of [query] in [text] (FindBar.tsx buildFindRegex: plain text, optional case and whole word). */
fun findAll(text: String, query: String, matchCase: Boolean, wholeWord: Boolean): List<IntRange> {
    if (query.isEmpty()) return emptyList()
    val esc = Regex.escape(query)
    val re = Regex(if (wholeWord) "\\b$esc\\b" else esc, if (matchCase) emptySet() else setOf(RegexOption.IGNORE_CASE))
    return re.findAll(text).map { it.range }.toList()
}

fun replaceAll(text: String, query: String, replacement: String, matchCase: Boolean, wholeWord: Boolean): String {
    if (query.isEmpty()) return text
    val esc = Regex.escape(query)
    val re = Regex(if (wholeWord) "\\b$esc\\b" else esc, if (matchCase) emptySet() else setOf(RegexOption.IGNORE_CASE))
    return re.replace(text, Regex.escapeReplacement(replacement))
}

/**
 * Find and replace (the web app's FindBar / desktop Find–Replace). [onSelect]
 * moves the editor's selection to a match; editors without a single text
 * (the screenplay) pass null and get the match count plus Replace all.
 */
@Composable
fun FindBar(
    texts: List<String>,
    replace: Boolean,
    onClose: () -> Unit,
    onSelect: ((TextRange) -> Unit)?,
    onReplaceAll: ((query: String, replacement: String, matchCase: Boolean, wholeWord: Boolean) -> Unit)?,
) {
    var query by remember { mutableStateOf("") }
    var replacement by remember { mutableStateOf("") }
    var matchCase by remember { mutableStateOf(false) }
    var wholeWord by remember { mutableStateOf(false) }
    var at by remember { mutableIntStateOf(-1) }
    val matches = texts.flatMap { findAll(it, query, matchCase, wholeWord) }
    fun go(by: Int) {
        if (matches.isEmpty()) return
        at = ((if (at < 0) 0 else at + by) % matches.size + matches.size) % matches.size
        val r = matches[at]
        onSelect?.invoke(TextRange(r.first, r.last + 1))
    }
    Column(Modifier.fillMaxWidth().background(MaterialTheme.colorScheme.surfaceContainerHigh).padding(horizontal = 8.dp, vertical = 4.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            OutlinedTextField(query, { query = it; at = -1 }, Modifier.weight(1f), singleLine = true, placeholder = { AppText("android-find", "Find") })
            Text(if (query.isEmpty()) "" else "${if (at >= 0) at + 1 else 0}/${matches.size}", Modifier.padding(horizontal = 6.dp), style = MaterialTheme.typography.labelMedium)
            if (onSelect != null) {
                IconButton({ go(-1) }, enabled = matches.isNotEmpty()) { Icon(Icons.Filled.KeyboardArrowUp, tr("android-find-prev", "Previous")) }
                IconButton({ go(1) }, enabled = matches.isNotEmpty()) { Icon(Icons.Filled.KeyboardArrowDown, tr("android-find-next", "Next")) }
            }
            IconButton(onClose) { Icon(Icons.Filled.Close, tr("android-close", "Close")) }
        }
        Row(verticalAlignment = Alignment.CenterVertically) {
            FilterChip(matchCase, { matchCase = !matchCase }, { AppText("android-find-case", "Match case") }, Modifier.padding(end = 6.dp))
            FilterChip(wholeWord, { wholeWord = !wholeWord }, { AppText("android-find-word", "Whole words") })
        }
        if (replace && onReplaceAll != null) Row(verticalAlignment = Alignment.CenterVertically) {
            OutlinedTextField(replacement, { replacement = it }, Modifier.weight(1f), singleLine = true, placeholder = { AppText("android-replace-with", "Replace with") })
            TextButton({ onReplaceAll(query, replacement, matchCase, wholeWord); at = -1 }, enabled = matches.isNotEmpty()) { AppText("android-replace-all", "Replace all") }
        }
    }
}
