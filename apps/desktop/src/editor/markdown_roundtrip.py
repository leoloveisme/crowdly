"""Loss-free Markdown round-trip for the WYSIWYG pane.

The WYSIWYG pane used to render the whole Markdown file into a ``QTextEdit``
and, on every keystroke, regenerate the *whole* file with
``QTextEdit.toMarkdown()``. That rewrote every line of the document: Qt hard
wraps at 80 columns (splitting `` `code` `` and ``**bold**`` spans), escapes
``-``/``+``/``&``, drops raw HTML such as ``<message>``, and Python-Markdown
(used for rendering) flattens lists that follow a paragraph line or use 2-3
space nesting.

This module keeps the original source text as the truth instead:

1. ``split_chunks`` cuts the source into top-level chunks (paragraphs,
   headings, lists, fenced code, quotes, tables, comments ...). Joining the
   chunks' ``raw`` text gives back the source byte-for-byte.
2. ``MarkdownRoundTrip.load`` renders each chunk separately (so a list that
   follows a paragraph line, or uses 2-space nesting, renders as a list), puts
   an invisible ``<a name>`` marker on each chunk's first text block, and tags
   the resulting ``QTextBlock``s with the chunk's group id via ``userState``.
3. On edit, ``to_markdown`` re-serialises only the groups the user touched
   (tracked through ``QTextDocument.contentsChange``) with ``serialize_blocks``
   - a small writer that never wraps lines and escapes as little as possible.
   Every untouched group is emitted as its original raw text.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Callable

from PySide6.QtGui import (
    QFont,
    QTextBlock,
    QTextCursor,
    QTextFormat,
    QTextListFormat,
)
from PySide6.QtWidgets import QTextEdit


# ---------------------------------------------------------------------------
# HTML/Markdown comments
# ---------------------------------------------------------------------------

# Matches an HTML/Markdown comment, e.g. `<!-- note -->`. Qt's rich-text
# document model has no representation for a comment node, so a comment
# inside an edited group is spliced back into the regenerated Markdown by
# anchoring it to nearby text (see ``extract_comments``/``reinject_comments``).
COMMENT_RE = re.compile(r"<!--.*?-->", re.DOTALL)
_COMMENT_ANCHOR_LEN = 40
_COMMENT_MIN_ANCHOR_LEN = 8


def extract_comments(text: str) -> tuple[str, list[tuple[str, str, str]]]:
    """Strip `<!-- -->` comments from *text*, returning (stripped_text, comments).

    Each comment is paired with a short anchor of nearby surrounding text
    (and which side of the comment it was taken from) so it can be spliced
    back into regenerated Markdown later. See ``reinject_comments``.
    """

    matches = list(COMMENT_RE.finditer(text))
    if not matches:
        return text, []

    comments: list[tuple[str, str, str]] = []
    for match in matches:
        comment_text = match.group(0)

        after = text[match.end():match.end() + _COMMENT_ANCHOR_LEN * 2]
        after = after.lstrip()[:_COMMENT_ANCHOR_LEN]

        before = text[max(0, match.start() - _COMMENT_ANCHOR_LEN * 2):match.start()]
        before = before.rstrip()[-_COMMENT_ANCHOR_LEN:]

        if len(after.strip()) >= _COMMENT_MIN_ANCHOR_LEN:
            anchor, anchor_side = after, "after"
        elif len(before.strip()) >= _COMMENT_MIN_ANCHOR_LEN:
            anchor, anchor_side = before, "before"
        else:
            anchor, anchor_side = (after or before), "after"

        comments.append((comment_text, anchor, anchor_side))

    stripped = COMMENT_RE.sub("", text)
    return stripped, comments


def reinject_comments(markdown_text: str, comments: list[tuple[str, str, str]]) -> str:
    """Splice comments from ``extract_comments`` back into *markdown_text*.

    If an anchor can no longer be found (its surrounding text was edited
    away), the comment is appended at the end instead of being dropped.
    """

    result = markdown_text
    for comment_text, anchor, anchor_side in comments:
        idx = result.find(anchor) if anchor else -1
        if idx == -1:
            result = result.rstrip("\n") + "\n\n" + comment_text + "\n"
            continue

        if anchor_side == "after":
            result = result[:idx] + comment_text + "\n\n" + result[idx:]
        else:
            insert_at = idx + len(anchor)
            result = result[:insert_at] + "\n\n" + comment_text + result[insert_at:]

    return result


# ---------------------------------------------------------------------------
# Splitting the source into chunks
# ---------------------------------------------------------------------------

_FENCE_RE = re.compile(r"^(\s*)(`{3,}|~{3,})")
_ATX_RE = re.compile(r"^ {0,3}#{1,6}(\s|$)")
_LIST_RE = re.compile(r"^(\s*)([-+*]|\d{1,9}[.)])(\s+|$)")
_HR_RE = re.compile(r"^ {0,3}(?:(?:\*[ \t]*){3,}|(?:-[ \t]*){3,}|(?:_[ \t]*){3,})$")
_QUOTE_RE = re.compile(r"^ {0,3}>")
_REFDEF_RE = re.compile(r"^ {0,3}\[[^\]^][^\]]*\]:\s*\S")


@dataclass
class Chunk:
    """One top-level piece of the source document.

    ``raw`` is the exact source text, including the blank lines that follow
    it. ``kind`` is one of ``paragraph``, ``heading``, ``list``, ``code``,
    ``quote``, ``hr`` (visible) or ``blank``, ``comment``, ``refdef``
    (invisible: they render to nothing and are always kept verbatim).
    """

    kind: str
    lines: list[str] = field(default_factory=list)

    @property
    def raw(self) -> str:
        return "".join(self.lines)

    @property
    def visible(self) -> bool:
        return self.kind not in ("blank", "comment", "refdef")

    @property
    def content(self) -> str:
        """The chunk without its trailing blank lines."""

        return self.raw.rstrip("\r\n \t") if self.raw.strip() else ""

    @property
    def trailing(self) -> str:
        """The whitespace that follows the chunk's content."""

        content = self.content
        if not content:
            return self.raw
        return self.raw[self.raw.rfind(content) + len(content):]


def _is_blank(line: str) -> bool:
    return not line.strip()


def _indent_of(line: str) -> int:
    expanded = line.expandtabs(4)
    return len(expanded) - len(expanded.lstrip(" "))


def _is_comment_only(text: str) -> bool:
    return bool(COMMENT_RE.search(text)) and not COMMENT_RE.sub("", text).strip()


def split_chunks(text: str) -> list[Chunk]:
    """Cut *text* into top-level chunks; ``"".join(c.raw for c in chunks) == text``."""

    lines = text.splitlines(keepends=True)
    chunks: list[Chunk] = []
    current: Chunk | None = None
    after_blank = False
    i = 0
    n = len(lines)

    def start(kind: str) -> Chunk:
        chunk = Chunk(kind)
        chunks.append(chunk)
        return chunk

    def consume_fence(chunk: Chunk, idx: int) -> int:
        """Append a fenced block starting at *idx* to *chunk*; return next index."""

        m = _FENCE_RE.match(lines[idx])
        assert m is not None
        fence = m.group(2)
        chunk.lines.append(lines[idx])
        idx += 1
        while idx < n:
            chunk.lines.append(lines[idx])
            stripped = lines[idx].strip()
            idx += 1
            if stripped.startswith(fence[0] * len(fence)) and not stripped.strip(fence[0]):
                break
        return idx

    while i < n:
        line = lines[i]

        if _is_blank(line):
            if current is None:
                current = start("blank")
            current.lines.append(line)
            after_blank = True
            i += 1
            continue

        kind = current.kind if current is not None else None
        indent = _indent_of(line)

        # Fenced code: its own chunk, or part of a list item when indented
        # under a list.
        if _FENCE_RE.match(line):
            if kind == "list" and indent >= 2:
                i = consume_fence(current, i)
            else:
                current = start("code")
                i = consume_fence(current, i)
            after_blank = False
            continue

        # HTML comment block that renders to nothing.
        if line.lstrip().startswith("<!--") and (kind != "paragraph" or after_blank):
            j = i
            block_lines = []
            while j < n:
                block_lines.append(lines[j])
                if "-->" in lines[j]:
                    j += 1
                    break
                j += 1
            if _is_comment_only("".join(block_lines)):
                current = start("comment")
                current.lines.extend(block_lines)
                i = j
                after_blank = False
                continue

        if _REFDEF_RE.match(line) and (kind not in ("paragraph", "quote") or after_blank):
            if kind != "refdef" or after_blank:
                current = start("refdef")
            current.lines.append(line)
            i += 1
            after_blank = False
            continue

        if _ATX_RE.match(line):
            current = start("heading")
            current.lines.append(line)
            i += 1
            after_blank = False
            continue

        if _HR_RE.match(line) and not (kind == "paragraph" and not after_blank and line.strip().startswith("-")):
            current = start("hr")
            current.lines.append(line)
            i += 1
            after_blank = False
            continue

        if _LIST_RE.match(line) and not _HR_RE.match(line):
            if kind != "list":
                current = start("list")
            current.lines.append(line)
            i += 1
            after_blank = False
            continue

        if kind == "list" and (indent >= 2 or not after_blank):
            # Indented continuation (or lazy continuation) of a list item.
            current.lines.append(line)
            i += 1
            after_blank = False
            continue

        if _QUOTE_RE.match(line):
            if kind != "quote" or after_blank:
                current = start("quote")
            current.lines.append(line)
            i += 1
            after_blank = False
            continue

        if kind in ("paragraph", "quote") and not after_blank:
            current.lines.append(line)
            i += 1
            continue

        current = start("paragraph")
        current.lines.append(line)
        i += 1
        after_blank = False

    return chunks


def _normalize_list_for_render(text: str) -> str:
    """Re-indent nested list items to the 4-space steps Python-Markdown needs.

    Only used for rendering; the source text is never changed.
    """

    out: list[str] = []
    stack: list[int] = []
    level = 0
    for line in text.splitlines():
        if not line.strip():
            out.append("")
            continue
        m = _LIST_RE.match(line)
        x = _indent_of(line)
        if m:
            while stack and stack[-1] > x:
                stack.pop()
            if stack and stack[-1] == x:
                level = len(stack) - 1
            else:
                stack.append(x)
                level = len(stack) - 1
            out.append(" " * (4 * level) + line.lstrip())
        elif x >= 2 and stack:
            out.append(" " * (4 * (level + 1)) + line.lstrip())
        else:
            out.append(line)
    return "\n".join(out)


# ---------------------------------------------------------------------------
# Serialising QTextBlocks back to Markdown
# ---------------------------------------------------------------------------

_ORDERED_STYLES = {
    QTextListFormat.Style.ListDecimal,
    QTextListFormat.Style.ListLowerAlpha,
    QTextListFormat.Style.ListUpperAlpha,
    QTextListFormat.Style.ListLowerRoman,
    QTextListFormat.Style.ListUpperRoman,
}
_MONO_FAMILIES = ("monospace", "courier", "mono", "consolas", "menlo")
_LINK_LIKE_RE = re.compile(r"\[(?=[^\]]*\]\s*[(\[])")
_LINE_START_RE = re.compile(r"^(\s*)(#|>|[-+*](?=\s)|\d+(?=[.)]\s))")


def _escape_text(text: str) -> str:
    text = text.replace("\\", "\\\\").replace("`", "\\`").replace("*", "\\*")
    text = re.sub(r"(?<![A-Za-z0-9])_|_(?![A-Za-z0-9])", r"\\_", text)
    text = _LINK_LIKE_RE.sub(r"\\[", text)
    text = re.sub(r"<(?=[A-Za-z/!?])", "&lt;", text)
    text = re.sub(r"&(?=#?\w+;)", "&amp;", text)
    return text


def _escape_line_starts(text: str) -> str:
    def fix(line: str) -> str:
        m = _LINE_START_RE.match(line)
        if not m:
            return line
        lead, token = m.group(1), m.group(2)
        if token[0].isdigit():
            return lead + token + "\\" + line[len(lead) + len(token):]
        return lead + "\\" + line[len(lead):]

    return "\n".join(fix(line) for line in text.split("\n"))


def _code_span(text: str) -> str:
    longest = max((len(r) for r in re.findall(r"`+", text)), default=0)
    ticks = "`" * (longest + 1)
    pad = " " if text.startswith("`") or text.endswith("`") else ""
    return f"{ticks}{pad}{text}{pad}{ticks}"


def _is_mono(fmt) -> bool:
    if fmt.fontFixedPitch():
        return True
    families = fmt.fontFamilies() or []
    if isinstance(families, str):
        families = [families]
    return any(any(m in str(f).lower() for m in _MONO_FAMILIES) for f in families)


def _inline(block: QTextBlock, *, ignore_bold: bool = False) -> str:
    """Serialise the fragments of *block* as inline Markdown."""

    runs: list[tuple[str, tuple]] = []
    for it in block:
        frag = it.fragment()
        if not frag.isValid():
            continue
        fmt = frag.charFormat()
        text = frag.text()
        if fmt.isImageFormat():
            src = fmt.toImageFormat().name()
            count = max(1, text.count("￼"))
            runs.append(("", ("img", src, count)))
            continue
        bold = (not ignore_bold) and fmt.fontWeight() >= QFont.Weight.DemiBold
        style = (
            "text",
            bold,
            fmt.fontItalic(),
            fmt.fontStrikeOut(),
            fmt.fontUnderline() and not (fmt.isAnchor() and fmt.anchorHref()),
            _is_mono(fmt),
            fmt.anchorHref() if fmt.isAnchor() else "",
        )
        if runs and runs[-1][1] == style:
            runs[-1] = (runs[-1][0] + text, style)
        else:
            runs.append((text, style))

    out: list[str] = []
    open_marks: list[str] = []
    closers = {"**": "**", "*": "*", "~~": "~~", "<u>": "</u>"}

    def close_all() -> None:
        trailing_ws = ""
        if out:
            stripped = out[-1].rstrip()
            trailing_ws = out[-1][len(stripped):]
            out[-1] = stripped
        while open_marks:
            out.append(closers[open_marks.pop()])
        out.append(trailing_ws)

    for text, style in runs:
        if style[0] == "img":
            close_all()
            out.append(f"![]({style[1]})" * style[2])
            continue
        _, bold, italic, strike, underline, mono, href = style
        wanted = [m for m, on in (("**", bold), ("*", italic), ("~~", strike), ("<u>", underline)) if on]
        if open_marks != wanted:
            close_all()
        if not text:
            continue
        lead = text[: len(text) - len(text.lstrip())]
        body = text.strip()
        tail = text[len(lead) + len(body):] if body else ""
        if not body:
            out.append(text)
            continue
        if open_marks != wanted:
            out.append(lead)
            lead = ""
            for mark in wanted:
                out.append(mark)
                open_marks.append(mark)
        piece = body.replace(" ", "\n").replace(" ", "\n")
        piece = _code_span(piece) if mono else _escape_text(piece).replace("\n", "  \n")
        if href:
            piece = f"[{piece}]({href})"
        out.append(lead + piece + tail)
    close_all()
    return "".join(out).rstrip()


def _list_marker(block: QTextBlock) -> tuple[int, str]:
    lst = block.textList()
    fmt = lst.format()
    level = max(0, fmt.indent() - 1)
    if fmt.style() in _ORDERED_STYLES:
        return level, f"{lst.itemNumber(block) + 1}."
    return level, "-"


def _table_markdown(table) -> str:
    rows: list[str] = []
    for r in range(table.rows()):
        cells: list[str] = []
        for c in range(table.columns()):
            cell = table.cellAt(r, c)
            parts: list[str] = []
            cur = cell.firstCursorPosition()
            block = cur.block()
            end = cell.lastCursorPosition().position()
            while block.isValid() and block.position() <= end:
                parts.append(_inline(block, ignore_bold=(r == 0)))
                block = block.next()
            cells.append(" <br> ".join(p for p in parts if p).replace("|", "\\|"))
        rows.append("| " + " | ".join(cells) + " |")
        if r == 0:
            rows.append("|" + "|".join(" --- " for _ in range(table.columns())) + "|")
    return "\n".join(rows)


def serialize_blocks(blocks: list[QTextBlock]) -> str:
    """Serialise consecutive ``QTextBlock``s as Markdown (no line wrapping)."""

    parts: list[str] = []
    i = 0
    n = len(blocks)
    while i < n:
        block = blocks[i]
        fmt = block.blockFormat()

        table = QTextCursor(block).currentTable()
        if table is not None:
            parts.append(_table_markdown(table))
            last = table.lastPosition()
            while i < n and blocks[i].position() <= last:
                i += 1
            continue

        if block.textList() is not None:
            lines: list[str] = []
            offsets = [0]
            top_list = None
            while i < n and blocks[i].textList() is not None and QTextCursor(blocks[i]).currentTable() is None:
                level, marker = _list_marker(blocks[i])
                if level == 0:
                    if top_list is not None and blocks[i].textList() != top_list:
                        # A different top-level list (e.g. bullets followed
                        # by numbers) needs a blank line to stay separate.
                        lines.append("")
                    top_list = blocks[i].textList()
                while len(offsets) <= level:
                    offsets.append(offsets[-1] + 2)
                indent = offsets[level]
                del offsets[level + 1:]
                offsets.append(indent + len(marker) + 1)
                text = _inline(blocks[i])
                lines.append((" " * indent + marker + (" " + text if text else "")).rstrip())
                i += 1
            parts.append("\n".join(lines))
            continue

        if fmt.nonBreakableLines():
            code_lines: list[str] = []
            while i < n and blocks[i].blockFormat().nonBreakableLines() and blocks[i].textList() is None:
                code_lines.append(blocks[i].text().replace(" ", "\n"))
                i += 1
            while code_lines and not code_lines[-1].strip():
                code_lines.pop()
            body = "\n".join(code_lines)
            longest = max((len(r) for r in re.findall(r"`{3,}", body)), default=0)
            fence = "`" * max(3, longest + 1)
            parts.append(f"{fence}\n{body}\n{fence}")
            continue

        if fmt.hasProperty(QTextFormat.Property.BlockTrailingHorizontalRulerWidth):
            parts.append("---")
            i += 1
            continue

        heading = fmt.headingLevel()
        if heading > 0:
            parts.append("#" * min(heading, 6) + " " + _inline(block, ignore_bold=True))
            i += 1
            continue

        quote_level = fmt.property(QTextFormat.Property.BlockQuoteLevel)
        if isinstance(quote_level, int) and quote_level > 0:
            quote_lines: list[str] = []
            while i < n:
                q = blocks[i].blockFormat().property(QTextFormat.Property.BlockQuoteLevel)
                if not (isinstance(q, int) and q > 0) or blocks[i].textList() is not None:
                    break
                if quote_lines:
                    quote_lines.append(">" * q)
                text = _escape_line_starts(_inline(blocks[i]))
                quote_lines.extend(">" * q + " " + line for line in text.split("\n"))
                i += 1
            parts.append("\n".join(quote_lines))
            continue

        text = _inline(block)
        if text.strip():
            parts.append(_escape_line_starts(text))
        i += 1

    return "\n\n".join(parts)


# ---------------------------------------------------------------------------
# Round-trip controller
# ---------------------------------------------------------------------------

_MARKER_PREFIX = "crowdly-chunk-"
_MARKER_TAG_RE = re.compile(r"<(p|h[1-6]|li|td|th|code|div|span|pre|dt|dd)(\s[^>]*)?>", re.IGNORECASE)
_FONT_SIZE_RE = re.compile(r"font-size:\s*[^;\"']+;?", re.IGNORECASE)


@dataclass
class _Group:
    """A run of chunks that map onto one tagged range of ``QTextBlock``s."""

    gid: int
    entries: list[int]  # indexes into MarkdownRoundTrip.chunks (visible ones)
    baseline: str = ""
    comments: list[tuple[str, str, str]] = field(default_factory=list)


class MarkdownRoundTrip:
    """Keeps a Markdown source in sync with a ``QTextEdit`` without rewriting it."""

    def __init__(self, source: str, chunks: list[Chunk]) -> None:
        self.source = source
        self.chunks = chunks
        self.groups: dict[int, _Group] = {}
        # Order of output entries: ("group", gid) or ("chunk", chunk index).
        self.layout: list[tuple[str, int]] = []
        self.dirty: set[int] = set()
        self.edited = False
        self._doc = None

    # -- loading -----------------------------------------------------------

    @classmethod
    def load(
        cls,
        editor: QTextEdit,
        text: str,
        render: Callable[[str], str],
    ) -> "MarkdownRoundTrip":
        """Render *text* into *editor* and return the round-trip controller.

        *render* converts a Markdown string into HTML.
        """

        chunks = split_chunks(text)
        rt = cls(text, chunks)
        refdefs = "\n".join(c.content for c in chunks if c.kind == "refdef")

        html_parts: list[str] = []
        for idx, chunk in enumerate(chunks):
            if not chunk.visible:
                continue
            body = chunk.content
            if chunk.kind == "list":
                body = _normalize_list_for_render(body)
            if refdefs and "[" in body:
                body = body + "\n\n" + refdefs
            html = render(body)
            html = _MARKER_TAG_RE.sub(
                lambda m: m.group(0) + f'<a name="{_MARKER_PREFIX}{idx}"></a>', html, count=1
            )
            html_parts.append(html)

        html = _FONT_SIZE_RE.sub("", "".join(html_parts))
        editor.setHtml(html)
        doc = editor.document()
        rt._doc = doc

        # Tag blocks with the chunk index found in their marker; untagged
        # blocks belong to the previous tagged block's group.
        found: list[int] = []
        block = doc.begin()
        current = -1
        while block.isValid():
            marker = _block_marker(block)
            if marker is not None and marker not in found:
                current = marker
                found.append(marker)
            block.setUserState(current)
            block = block.next()

        # Build groups: each found chunk starts a group which also owns the
        # following visible chunks whose marker was not found (e.g. an image
        # paragraph or horizontal rule).
        found_set = set(found)
        group: _Group | None = None
        lead_group = _Group(gid=-1, entries=[])
        for idx, chunk in enumerate(chunks):
            if not chunk.visible:
                rt.layout.append(("chunk", idx))
                continue
            if idx in found_set:
                group = _Group(gid=idx, entries=[idx])
                rt.groups[idx] = group
                rt.layout.append(("group", idx))
            elif group is not None:
                group.entries.append(idx)
            else:
                # Visible chunks before the first tagged one: their blocks
                # carry userState -1 and belong to the leading group.
                if not lead_group.entries:
                    rt.groups[-1] = lead_group
                    rt.layout.append(("group", -1))
                lead_group.entries.append(idx)

        blocks_by_group = rt._group_blocks()
        for gid, grp in rt.groups.items():
            raw = "".join(chunks[i].raw for i in grp.entries)
            grp.comments = extract_comments(raw)[1]
            grp.baseline = serialize_blocks(blocks_by_group.get(gid, []))
        return rt

    # -- tracking ----------------------------------------------------------

    def _group_blocks(self) -> dict[int, list[QTextBlock]]:
        result: dict[int, list[QTextBlock]] = {}
        order: list[int] = []
        block = self._doc.begin()
        current: int | None = None
        while block.isValid():
            state = block.userState()
            if state in self.groups and state != current:
                current = state
            elif current is None:
                current = -1
            if current not in result:
                result[current] = []
                order.append(current)
            result[current].append(block)
            block = block.next()
        self._doc_order = order
        return result

    def mark_dirty(self, position: int, removed: int, added: int) -> None:
        """Record which groups a ``contentsChange`` touched."""

        if self._doc is None:
            return
        self.edited = True
        end = position + max(added, 0)
        block = self._doc.findBlock(position)
        last = self._doc.findBlock(end)
        while block.isValid():
            self.dirty.add(self._owner_of(block))
            if block == last or block.blockNumber() >= last.blockNumber():
                break
            block = block.next()

    def _owner_of(self, block: QTextBlock) -> int:
        b = block
        while b.isValid():
            state = b.userState()
            if state in self.groups:
                return state
            b = b.previous()
        return -1

    # -- output ------------------------------------------------------------

    def to_markdown(self) -> str:
        if not self.edited:
            return self.source

        blocks_by_group = self._group_blocks()
        present = [g for g in self._doc_order]

        def group_text(gid: int, is_last: bool) -> str:
            grp = self.groups.get(gid)
            blocks = blocks_by_group.get(gid, [])
            raw = "".join(self.chunks[i].raw for i in grp.entries) if grp else ""
            if grp is not None and gid not in self.dirty:
                return raw
            serialized = serialize_blocks(blocks)
            if grp is not None and serialized == grp.baseline:
                return raw
            if grp is not None and len(grp.entries) == 1 and self.chunks[grp.entries[0]].kind == "code":
                # Keep the original fence line (e.g. ```python) for an edited
                # code block; the rich-text model has no notion of it.
                lines = serialized.split("\n")
                original = self.chunks[grp.entries[0]].content.split("\n")
                if len(lines) >= 2 and _FENCE_RE.match(original[0]):
                    lines[0] = original[0]
                    if len(original) > 1 and _FENCE_RE.match(original[-1]):
                        lines[-1] = original[-1]
                    serialized = "\n".join(lines)
            if grp is not None and grp.comments:
                serialized = reinject_comments(serialized, grp.comments)
            if not serialized.strip():
                return ""
            trailing = self.chunks[grp.entries[-1]].trailing if grp else ""
            if not trailing.strip("\r\n \t") and "\n\n" not in trailing and not is_last:
                trailing = "\n\n"
            if is_last and not trailing:
                trailing = "\n" if self.source.endswith("\n") else ""
            return serialized + trailing

        out: list[str] = []
        emitted_layout = 0
        layout = self.layout
        position_of = {entry: k for k, entry in enumerate(layout)}
        for k, gid in enumerate(present):
            pos = position_of.get(("group", gid))
            if pos is not None:
                while emitted_layout < pos:
                    kind, val = layout[emitted_layout]
                    if kind == "chunk":
                        out.append(self.chunks[val].raw)
                    emitted_layout += 1
                emitted_layout = max(emitted_layout, pos + 1)
            is_last = k == len(present) - 1 and all(
                kind == "chunk" and not self.chunks[val].raw.strip() for kind, val in layout[emitted_layout:]
            )
            text = group_text(gid, is_last)
            if out and text and not out[-1].endswith("\n"):
                out.append("\n\n")
            out.append(text)
        while emitted_layout < len(layout):
            kind, val = layout[emitted_layout]
            if kind == "chunk":
                out.append(self.chunks[val].raw)
            emitted_layout += 1
        return "".join(out)


def _block_marker(block: QTextBlock) -> int | None:
    for it in block:
        frag = it.fragment()
        if not frag.isValid():
            continue
        for name in frag.charFormat().anchorNames() or []:
            if name.startswith(_MARKER_PREFIX):
                try:
                    return int(name[len(_MARKER_PREFIX):])
                except ValueError:
                    return None
    return None
