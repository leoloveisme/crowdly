"""Helpers for the `.story` format.

This module defines a minimal, extensible DSL for `.story` documents and
provides conversions from plain Markdown (for automatic migration) and
into HTML for exports / WYSIWYG rendering.

Notes
-----
* The current implementation focuses on a safe subset that covers titles,
  chapters and paragraphs. It is designed so that existing Markdown
  stories can be migrated automatically without losing text content.
* More advanced constructs (branch paragraphs, notes, comments, images,
  panels) can be layered on later by extending the DSL and HTML mapping
  in a backwards-compatible way.
"""

from __future__ import annotations

from dataclasses import dataclass
from enum import Enum, auto
from html import escape
from typing import List, Tuple

from .. import story_sync


class StoryBlockType(Enum):
    STORY_TITLE = auto()
    CHAPTER_TITLE = auto()
    PARAGRAPH = auto()
    RAW = auto()


@dataclass
class StoryBlock:
    type: StoryBlockType
    text: str


@dataclass
class StoryDocument:
    title: str
    blocks: List[StoryBlock]


def markdown_to_story_document(markdown: str) -> StoryDocument:
    """Best-effort conversion from Markdown to a structured StoryDocument.

    This is primarily used for *automatic migration* of existing Markdown
    stories into the `.story` DSL. It reuses the existing story parsing
    logic in :mod:`story_sync` so we keep behaviour aligned with the web
    backend.
    """

    payload = story_sync.parse_story_from_content(markdown or "", body_format="markdown")

    blocks: List[StoryBlock] = []
    # Story title block.
    title = payload.title or "Untitled"
    blocks.append(StoryBlock(type=StoryBlockType.STORY_TITLE, text=title))

    # For each chapter, emit a CHAPTER_TITLE followed by PARAGRAPH blocks.
    for ch in payload.chapters:
        ch_title = ch.chapterTitle or "Chapter"
        blocks.append(StoryBlock(type=StoryBlockType.CHAPTER_TITLE, text=ch_title))
        for para in ch.paragraphs:
            text = (para or "").strip("\n")
            if not text:
                continue
            blocks.append(StoryBlock(type=StoryBlockType.PARAGRAPH, text=text))

    return StoryDocument(title=title, blocks=blocks)


def story_document_to_dsl(doc: StoryDocument) -> str:
    """Serialise a StoryDocument into `.story` DSL text.

    The generated format is intentionally simple and stable so it can be
    hand-edited later if desired. For now we only emit basic horizontal
    alignment tokens (left/center/right) in the opening tag, e.g.::

        [story_title center]Title[/story_title]
        [chapter_title left]Chapter[/chapter_title]
        [paragraph left]Text[/paragraph]
    """

    lines: list[str] = []

    for block in doc.blocks:
        if block.type is StoryBlockType.STORY_TITLE:
            # Story titles are centered by default.
            lines.append(f"[story_title center]{block.text}[/story_title]")
            lines.append("")
        elif block.type is StoryBlockType.CHAPTER_TITLE:
            lines.append(f"[chapter_title left]{block.text}[/chapter_title]")
            lines.append("")
        elif block.type is StoryBlockType.PARAGRAPH:
            # Preserve internal newlines inside paragraph text; default left.
            body = block.text.rstrip("\n")
            lines.append(f"[paragraph left]{body}[/paragraph]")
            lines.append("")
        else:
            lines.append(block.text)
            lines.append("")

    # Normalise trailing whitespace.
    text = "\n".join(lines).rstrip() + "\n"
    return text


def markdown_to_dsl(markdown: str) -> str:
    """Convenience helper: Markdown → `.story` DSL text."""

    doc = markdown_to_story_document(markdown or "")
    return story_document_to_dsl(doc)


def _parse_tag_and_attrs(header: str) -> Tuple[str, dict[str, str]]:
    """Parse a tag header like "[paragraph right bold font_color=orange]".

    Rules:
    - First token is the tag name.
    - Tokens with "key=value" form become string attributes.
    - The first bare token that is one of left/center/right/justify becomes
      the alignment ("align").
    - Any further bare tokens are treated as boolean flags (value "1"), e.g.
      "bold", "italic", "underlined", "stroke-through".
    """

    # header may include the leading '[' and trailing ']'.
    inner = header.strip()
    if inner.startswith("["):
        inner = inner[1:]
    if inner.endswith("]"):
        inner = inner[:-1]

    parts = [p for p in inner.split() if p]
    if not parts:
        return "", {}

    tag = parts[0]
    attrs: dict[str, str] = {}

    for token in parts[1:]:
        if "=" in token:
            key, value = token.split("=", 1)
            attrs[key.strip()] = value.strip()
        else:
            token = token.strip()
            if token in {"left", "center", "right", "justify"} and "align" not in attrs:
                attrs["align"] = token
            else:
                attrs[token] = "1"

    return tag, attrs


def _normalise_css_color(value: str) -> str:
    """Normalise *value* into a CSS color string.

    Accepts:
    - Named CSS colors (returned unchanged).
    - 3/6-digit hex without "#" (e.g. "333", "3F5B2A", "151467"); these
      are converted to "#333", "#3F5B2A", "#151467".
    - Values already starting with "#" are returned unchanged.
    """

    if not value:
        return value
    v = value.strip()
    if v.startswith("#"):
        return v
    hex_candidate = v
    if len(hex_candidate) in (3, 6) and all(c in "0123456789abcdefABCDEF" for c in hex_candidate):
        return "#" + hex_candidate
    return value


def _style_from_attrs(attrs: dict[str, str]) -> str:
    """Map tag attributes to inline CSS style string.

    Supported attributes (all optional):
    - align / left|center|right|justify
    - width, height
    - bold, italic, underlined, stroke-through/strikethrough
    - font_color=<css-color> or color=<css-color>
    - font_size=<number>[unit]
    - text_wrap=<css-color>
    - word_wrap=<css-color>
    """

    styles: list[str] = []

    # Alignment
    align = attrs.get("align")
    if align in {"left", "center", "right", "justify"}:
        styles.append(f"text-align:{align}")

    # Block dimensions
    width = attrs.get("width")
    if width:
        styles.append(f"width:{width}")

    height = attrs.get("height")
    if height:
        styles.append(f"height:{height}")

    # Font weight / style
    if "bold" in attrs:
        styles.append("font-weight:bold")

    if "italic" in attrs:
        styles.append("font-style:italic")

    # Text decoration
    decorations: list[str] = []
    if "underlined" in attrs:
        decorations.append("underline")
    if "stroke-through" in attrs or "strikethrough" in attrs:
        decorations.append("line-through")
    if decorations:
        styles.append(f"text-decoration:{' '.join(decorations)}")

    # Colors and font size
    font_color = attrs.get("font_color") or attrs.get("color")
    if font_color:
        css_color = _normalise_css_color(font_color)
        styles.append(f"color:{css_color}")

    font_size = attrs.get("font_size")
    if font_size:
        if font_size.isdigit():
            styles.append(f"font-size:{font_size}px")
        else:
            styles.append(f"font-size:{font_size}")

    # Text/word wrap highlighting – both currently map to background-color.
    text_wrap = attrs.get("text_wrap")
    word_wrap = attrs.get("word_wrap")
    bg_color = text_wrap or word_wrap
    if bg_color:
        css_bg = _normalise_css_color(bg_color)
        styles.append(f"background-color:{css_bg}")

    if not styles:
        return ""
    return " style=\"" + "; ".join(styles) + "\""


def dsl_to_html(text: str) -> str:
    """Render `.story` DSL text to HTML suitable for export.

    This function understands the subset generated by
    :func:`markdown_to_dsl`, plus additional attributes for alignment and
    sizing in the opening tag, e.g.::

        [paragraph left width=80%]Text[/paragraph]
        [image left width=40% height=20%](path)[/image]

    Unknown or malformed blocks are emitted as simple paragraphs with
    HTML-escaped content so that no text is lost.
    """

    text = text or ""

    blocks: List[str] = []

    # Very small, line-based parser that looks for the simple tag patterns we
    # generate ourselves. This avoids having to implement a full nested-tag
    # parser up front.
    current_tag: str | None = None
    buf: list[str] = []

    def flush_current() -> None:
        nonlocal current_tag, buf
        if current_tag is None:
            # Emit raw text as-is, preserving line breaks.
            if buf:
                raw = "\n".join(buf).strip("\n")
                if raw:
                    blocks.append(f"<p>{escape(raw)}</p>")
            buf = []
            return

        body = "\n".join(buf).rstrip("\n")
        safe = escape(body)
        # Default to left alignment when unknown.
        style = ""
        if current_tag == "story_title":
            style = " style=\"text-align:center;\""
            blocks.append(f"<h1{style}>{safe}</h1>")
        elif current_tag == "chapter_title":
            blocks.append(f"<h2>{safe}</h2>")
        elif current_tag == "paragraph":
            # Preserve simple line breaks inside paragraphs.
            html_body = safe.replace("\n", "<br />\n")
            blocks.append(f"<p>{html_body}</p>")
        else:
            blocks.append(f"<p>{safe}</p>")

        buf = []
        current_tag = None

    for line in text.splitlines():
        stripped = line.strip()
        if not stripped:
            # Blank lines separate blocks but do not by themselves produce HTML.
            continue

        # Images use the form: [image attrs](path)[/image]
        if stripped.startswith("[image") and stripped.endswith("[/image]") and "](" in stripped:
            # Flush any buffered block first.
            flush_current()
            try:
                header, rest = stripped.split("]", 1)
                tag, attrs = _parse_tag_and_attrs(header + "]")
                if not rest.startswith("("):
                    raise ValueError
                path_part, _closing = rest.split(")[/image]", 1)
                src = path_part[1:]  # strip leading '('
                style = _style_from_attrs(attrs)
                blocks.append(f"<p><img src=\"{escape(src)}\"{style} /></p>")
                continue
            except Exception:
                # Fall back to raw paragraph.
                blocks.append(f"<p>{escape(stripped)}</p>")
                continue

        # Generic block with attributes, e.g. [paragraph left]...[ /paragraph]
        if stripped.startswith("[") and "]" in stripped and stripped.endswith("]") is False:
            # These are handled in the multi-line accumulator below.
            pass

        # Simple one-line forms with matching closing tags.
        for tag_name in ("story_title", "chapter_title", "paragraph"):
            open_prefix = f"[{tag_name}"
            close_suffix = f"[/{tag_name}]"
            if stripped.startswith(open_prefix) and stripped.endswith(close_suffix):
                flush_current()
                header, body = stripped.split("]", 1)
                content = body[: -len(close_suffix)]
                _tag, attrs = _parse_tag_and_attrs(header + "]")
                style = _style_from_attrs(attrs)
                safe = escape(content.strip())
                if tag_name == "story_title":
                    # If no explicit width/align, default to centred title.
                    if "align" not in attrs:
                        style = " style=\"text-align:center;\""
                    blocks.append(f"<h1{style}>{safe}</h1>")
                elif tag_name == "chapter_title":
                    blocks.append(f"<h2{style}>{safe}</h2>")
                else:  # paragraph
                    body_safe = escape(content.rstrip("\n"))
                    body_html = body_safe.replace("\n", "<br />\n")
                    blocks.append(f"<p{style}>{body_html}</p>")
                break
        else:
            # Fallback: accumulate into a RAW block; flush will wrap it in <p>.
            if current_tag is None:
                current_tag = "raw"
            buf.append(line)

    flush_current()

    return "\n".join(blocks) + "\n"
