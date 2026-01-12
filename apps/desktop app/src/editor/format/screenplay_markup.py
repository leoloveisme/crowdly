"""Helpers for the `.screenplay` format.

This module provides a minimal DSL for `.screenplay` documents plus
helpers for automatic migration from Markdown and for HTML export.

The DSL is intentionally conservative for now and focuses on stable
structural elements: screenplay title, scene sluglines and generic
"action" lines. More specialised elements (character names, dialogue,
parentheticals, transitions) can be added incrementally.
"""

from __future__ import annotations

from dataclasses import dataclass
from enum import Enum, auto
from html import escape
from typing import List, Tuple

from .. import story_sync


class ScreenplayBlockType(Enum):
    SCREENPLAY_TITLE = auto()
    SCENE_SLUGLINE = auto()
    ACTION = auto()
    RAW = auto()


@dataclass
class ScreenplayBlock:
    type: ScreenplayBlockType
    text: str


@dataclass
class ScreenplayDocument:
    title: str
    blocks: List[ScreenplayBlock]


def markdown_to_screenplay_document(markdown: str) -> ScreenplayDocument:
    """Best-effort conversion from Markdown to a ScreenplayDocument.

    This reuses :func:`story_sync.parse_screenplay_from_content` so that the
    notion of "title" and "scene" stays consistent with the backend.
    """

    payload = story_sync.parse_screenplay_from_content(markdown or "")

    blocks: List[ScreenplayBlock] = []
    title = payload.title or "Untitled Screenplay"
    blocks.append(ScreenplayBlock(type=ScreenplayBlockType.SCREENPLAY_TITLE, text=title))

    for ch in payload.chapters:
        slug = ch.chapterTitle or "Scene"
        blocks.append(ScreenplayBlock(type=ScreenplayBlockType.SCENE_SLUGLINE, text=slug))
        for line in ch.paragraphs:
            txt = (line or "").strip("\n")
            if not txt:
                continue
            # For now treat all body lines as generic ACTION.
            blocks.append(ScreenplayBlock(type=ScreenplayBlockType.ACTION, text=txt))

    return ScreenplayDocument(title=title, blocks=blocks)


def screenplay_document_to_dsl(doc: ScreenplayDocument) -> str:
    """Serialise a ScreenplayDocument into `.screenplay` DSL text.

    For now we emit basic horizontal alignment tokens similar to `.story`,
    e.g.::

        [screenplay_title center]Title[/screenplay_title]
        [scene_slugline left]INT. KITCHEN – DAY[/scene_slugline]
        [action left]He walks across the room.[/action]

    Additional styling attributes (bold, italic, font_color, font_size, etc.)
    are not currently inferred here; they are added by the WYSIWYG layer when
    editing via the desktop client.
    """

    lines: list[str] = []

    for block in doc.blocks:
        if block.type is ScreenplayBlockType.SCREENPLAY_TITLE:
            lines.append(f"[screenplay_title center]{block.text}[/screenplay_title]")
            lines.append("")
        elif block.type is ScreenplayBlockType.SCENE_SLUGLINE:
            lines.append(f"[scene_slugline left]{block.text}[/scene_slugline]")
            lines.append("")
        elif block.type is ScreenplayBlockType.ACTION:
            body = block.text.rstrip("\n")
            lines.append(f"[action left]{body}[/action]")
            lines.append("")
        else:
            lines.append(block.text)
            lines.append("")

    text = "\n".join(lines).rstrip() + "\n"
    return text


def markdown_to_dsl(markdown: str) -> str:
    """Convenience helper: Markdown → `.screenplay` DSL text."""

    doc = markdown_to_screenplay_document(markdown or "")
    return screenplay_document_to_dsl(doc)


def _parse_tag_and_attrs(header: str) -> Tuple[str, dict[str, str]]:
    """Parse a tag header like "[action right bold font_color=orange]".

    Rules:
    - First token is the tag name.
    - Tokens with "key=value" form become string attributes.
    - The first bare token that is one of left/center/right/justify becomes
      the alignment ("align").
    - Any further bare tokens are treated as boolean flags (value "1"), e.g.
      "bold", "italic", "underlined", "stroke-through".
    """

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
    """Render `.screenplay` DSL text to HTML suitable for export.

    Supported constructs:

    * ``[screenplay_title ...]...[/screenplay_title]`` → centred H1 with
      optional inline styles.
    * ``[scene_slugline ...]...[/scene_slugline]`` → H2 with slugline styling
      and optional inline styles.
    * ``[action ...]...[/action]`` → left-aligned action paragraphs with
      optional inline styles.

    Unknown blocks are wrapped in simple paragraphs.
    """

    text = text or ""

    blocks: List[str] = []

    current_tag: str | None = None
    buf: list[str] = []

    def flush_current() -> None:
        nonlocal current_tag, buf
        if current_tag is None:
            if buf:
                raw = "\n".join(buf).strip("\n")
                if raw:
                    blocks.append(f"<p>{escape(raw)}</p>")
            buf = []
            return

        body = "\n".join(buf).rstrip("\n")
        safe = escape(body)
        # For multi-line blocks without explicit attributes we fall back to
        # default styling.
        if current_tag == "screenplay_title":
            blocks.append("<h1 style=\"text-align:center;\">" + safe + "</h1>")
        elif current_tag == "scene_slugline":
            blocks.append("<h2 class=\"scene-slugline\">" + safe + "</h2>")
        elif current_tag == "action":
            html_body = safe.replace("\n", "<br />\n")
            blocks.append("<p class=\"action\">" + html_body + "</p>")
        else:
            blocks.append(f"<p>{safe}</p>")

        buf = []
        current_tag = None

    for line in text.splitlines():
        stripped = line.strip()
        if not stripped:
            continue

        # One-line forms with optional attributes: [tag attrs]body[/tag]
        for tag_name in ("screenplay_title", "scene_slugline", "action"):
            open_prefix = f"[{tag_name}"
            close_suffix = f"[/{tag_name}]"
            if stripped.startswith(open_prefix) and stripped.endswith(close_suffix):
                flush_current()
                header, body = stripped.split("]", 1)
                content = body[: -len(close_suffix)]
                _tag, attrs = _parse_tag_and_attrs(header + "]")
                style = _style_from_attrs(attrs)
                safe = escape(content.strip())

                def _ensure_normal_weight_if_not_bold(style_str: str) -> str:
                    """Append ``font-weight:normal`` when no explicit bold flag is set.

                    This prevents default HTML heading styles (h1/h2) from making
                    all screenplay titles and scene sluglines appear bold when the
                    DSL header does not include a ``bold`` token.
                    """

                    if "bold" in attrs:
                        return style_str
                    if "font-weight" in style_str:
                        return style_str
                    if not style_str:
                        return " style=\"font-weight:normal;\""
                    # style_str is of the form ' style="..."'; inject before the
                    # closing quote.
                    base = style_str[:-1]
                    if not base.endswith(";"):
                        base += ";"
                    base += " font-weight:normal\""
                    return base

                if tag_name == "screenplay_title":
                    # Default to centre-aligned title when no explicit align.
                    if "align" not in attrs:
                        if not style:
                            style = " style=\"text-align:center;\""
                        else:
                            base = style[:-1]
                            if not base.endswith(";"):
                                base += ";"
                            base += " text-align:center\""
                            style = base
                    style = _ensure_normal_weight_if_not_bold(style)
                    blocks.append(f"<h1{style}>{safe}</h1>")
                elif tag_name == "scene_slugline":
                    style = _ensure_normal_weight_if_not_bold(style)
                    blocks.append(f"<h2 class=\"scene-slugline\"{style}>{safe}</h2>")
                else:  # action
                    body_safe = escape(content.rstrip("\n"))
                    body_html = body_safe.replace("\n", "<br />\n")
                    blocks.append(f"<p class=\"action\"{style}>{body_html}</p>")
                break
        else:
            # Fallback: accumulate into current RAW block; flush wraps it in <p>.
            if current_tag is None:
                current_tag = "raw"
            buf.append(line)

    flush_current()

    return "\n".join(blocks) + "\n"
