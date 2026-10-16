package cloud.crowdly.app.ui.components

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.LinkAnnotation
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.withLink
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import cloud.crowdly.app.crowdly
import cloud.crowdly.core.text.MdBlock
import cloud.crowdly.core.text.Span
import cloud.crowdly.core.text.parseInline
import cloud.crowdly.core.text.parseMarkdownBlocks
import coil3.compose.AsyncImage

/** Inline Markdown as styled text. */
fun inlineText(text: String, linkColor: Color = Color(0xFF7C3AED)): AnnotatedString = spansText(parseInline(text), linkColor)

fun spansText(spans: List<Span>, linkColor: Color = Color(0xFF7C3AED)): AnnotatedString = buildAnnotatedString {
    for (s in spans) {
        val style = SpanStyle(
            fontWeight = if (s.bold) FontWeight.Bold else null,
            fontStyle = if (s.italic) FontStyle.Italic else null,
            fontFamily = if (s.code) FontFamily.Monospace else null,
            textDecoration = when {
                s.strike && s.underline -> TextDecoration.combine(listOf(TextDecoration.LineThrough, TextDecoration.Underline))
                s.strike -> TextDecoration.LineThrough
                s.underline || s.link != null -> TextDecoration.Underline
                else -> null
            },
            color = if (s.link != null) linkColor else Color.Unspecified,
        )
        if (s.link != null) withLink(LinkAnnotation.Url(s.link!!)) { withStyle(style) { append(s.text) } }
        else withStyle(style) { append(s.text) }
    }
}

/** Renders a chapter or Space file's Markdown: headings, paragraphs, images, quotes, lists. */
@Composable
fun MarkdownView(markdown: String, modifier: Modifier = Modifier, serif: Boolean = true, fontSize: Int = 18) {
    val blocks = remember(markdown) { parseMarkdownBlocks(markdown) }
    val link = MaterialTheme.colorScheme.secondary
    val family = if (serif) FontFamily.Serif else FontFamily.Default
    Column(modifier, verticalArrangement = Arrangement.spacedBy(12.dp)) {
        for (b in blocks) when (b) {
            is MdBlock.Heading -> Text(
                inlineText(b.text, link),
                style = when (b.level) { 1 -> MaterialTheme.typography.headlineMedium; 2 -> MaterialTheme.typography.titleLarge; else -> MaterialTheme.typography.titleMedium },
                fontWeight = FontWeight.SemiBold,
            )
            is MdBlock.Paragraph -> Text(inlineText(b.text, link), fontSize = fontSize.sp, lineHeight = (fontSize * 1.55).sp, fontFamily = family)
            is MdBlock.Image -> AsyncImage(crowdly.api.mediaUrl(b.src), b.alt, Modifier.fillMaxWidth(), contentScale = ContentScale.FillWidth)
            is MdBlock.Quote -> Row { Text("┃ ", color = MaterialTheme.colorScheme.outline); Text(inlineText(b.text, link), fontStyle = FontStyle.Italic, fontSize = fontSize.sp, fontFamily = family) }
            is MdBlock.ListItems -> Column { b.items.forEachIndexed { i, it -> Row { Text(if (b.ordered) "${i + 1}. " else "•  ", fontSize = fontSize.sp); Text(inlineText(it, link), fontSize = fontSize.sp, fontFamily = family) } } }
            MdBlock.Rule -> HorizontalDivider(Modifier.padding(vertical = 8.dp))
        }
    }
}
