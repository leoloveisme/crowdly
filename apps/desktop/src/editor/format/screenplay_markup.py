"""Helpers for the `.screenplay` format.

This module provides a minimal DSL for `.screenplay` documents plus
helpers for automatic migration from Markdown and for HTML export.

Elements: screenplay title, scene sluglines, action, and (v2, 2026-10)
character, dialogue, parenthetical, transition, shot and general — the
same element types as the backend's screenplay_block.block_type. Parsing is
shared with `.story`/`.comic` via :mod:`.dsl` and mirrored in the web app;
see ``Documentation/Crowdly_file_formats_story_screenplay_comic.md``.
"""

from __future__ import annotations

from dataclasses import dataclass
from enum import Enum, auto
from html import escape
from typing import List, Tuple

from .. import story_sync
from . import dsl


class ScreenplayBlockType(Enum):
    SCREENPLAY_TITLE = auto()
    SCENE_SLUGLINE = auto()
    ACTION = auto()
    CHARACTER = auto()
    DIALOGUE = auto()
    PARENTHETICAL = auto()
    TRANSITION = auto()
    SHOT = auto()
    RAW = auto()


# Element tag in the DSL ↔ block type (backend screenplay_block.block_type
# uses the same names, with "scene_heading" for sluglines).
ELEMENT_TAGS = {
    ScreenplayBlockType.ACTION: "action",
    ScreenplayBlockType.CHARACTER: "character",
    ScreenplayBlockType.DIALOGUE: "dialogue",
    ScreenplayBlockType.PARENTHETICAL: "parenthetical",
    ScreenplayBlockType.TRANSITION: "transition",
    ScreenplayBlockType.SHOT: "shot",
}
_ELEMENT_NAMES = {"action", "character", "dialogue", "parenthetical", "transition", "shot", "general"}


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
        previous = None
        for line in ch.paragraphs:
            txt = (line or "").strip("\n")
            if not txt:
                continue
            kind = _guess_element(txt, previous)
            blocks.append(ScreenplayBlock(type=kind, text=txt))
            previous = kind

    return ScreenplayDocument(title=title, blocks=blocks)


def _guess_element(text: str, previous: "ScreenplayBlockType | None") -> "ScreenplayBlockType":
    """Fountain-style guesses for plain text: ALL-CAPS short line → character,
    "(…)" → parenthetical, line after a character/parenthetical → dialogue,
    "… TO:" → transition; anything else is action."""

    t = text.strip()
    if t.startswith("(") and t.endswith(")") and previous in (ScreenplayBlockType.CHARACTER, ScreenplayBlockType.DIALOGUE):
        return ScreenplayBlockType.PARENTHETICAL
    if previous in (ScreenplayBlockType.CHARACTER, ScreenplayBlockType.PARENTHETICAL):
        return ScreenplayBlockType.DIALOGUE
    if t.isupper() and t.endswith("TO:"):
        return ScreenplayBlockType.TRANSITION
    if t.isupper() and len(t) <= 40 and "\n" not in t and any(c.isalpha() for c in t):
        return ScreenplayBlockType.CHARACTER
    return ScreenplayBlockType.ACTION


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
        elif block.type in ELEMENT_TAGS:
            lines.append(dsl.block(ELEMENT_TAGS[block.type], block.text.rstrip("\n")))
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


_ELEMENT_STYLE = {
    "action": "",
    "character": "text-align:center; text-transform:uppercase; margin:1em 0 0",
    "dialogue": "margin:0 15%",
    "parenthetical": "margin:0 25%; font-style:italic",
    "transition": "text-align:right; text-transform:uppercase",
    "shot": "text-transform:uppercase",
    "general": "",
}


def _merge_style(style: str, extra: str) -> str:
    if not extra:
        return style
    if not style:
        return f" style=\"{extra}\""
    return style[:-1].rstrip(";") + "; " + extra + "\""


def dsl_to_html(text: str) -> str:
    """Render `.screenplay` DSL text to HTML suitable for export.

    ``screenplay_title`` → centred H1, ``scene_slugline`` → H2.scene-slugline,
    and the elements action / character / dialogue / parenthetical /
    transition / shot / general → paragraphs with screenplay layout. Title
    and slugline stay normal weight unless the ``bold`` flag is set. Raw
    text from older files and unknown tags become plain paragraphs.
    """

    out: List[str] = []
    for b in dsl.parse_blocks(text or ""):
        style = _style_from_attrs(b.attrs)
        safe = escape(b.body.strip())
        normal = "" if "bold" in b.attrs or "font-weight" in style else "font-weight:normal"
        if b.tag == "screenplay_title":
            extra = "; ".join(x for x in ("" if "align" in b.attrs else "text-align:center", normal) if x)
            out.append(f"<h1{_merge_style(style, extra)}>{safe}</h1>")
        elif b.tag in ("scene_slugline", "scene_heading"):
            out.append(f"<h2 class=\"scene-slugline\"{_merge_style(style, normal)}>{safe}</h2>")
        elif b.tag in _ELEMENT_NAMES:
            body = escape(b.body.rstrip("\n")).replace("\n", "<br />\n")
            out.append(f"<p class=\"{b.tag}\"{_merge_style(style, _ELEMENT_STYLE[b.tag])}>{body}</p>")
        else:
            out.append(f"<p>{escape(b.body.rstrip())}</p>")
    return "\n".join(out) + "\n"


# ---------------------------------------------------------------------------
# Structured form shared with the web app and the backend's scene/block model:
#   {"title": str, "scenes": [{"slugline": str, "blocks": [{"type": str, "text": str}]}]}
# ---------------------------------------------------------------------------


def parse_dsl(text: str) -> dict:
    title = ""
    scenes: list[dict] = []

    def current() -> dict:
        if not scenes:
            scenes.append({"slugline": "", "blocks": []})
        return scenes[-1]

    for b in dsl.parse_blocks(text or ""):
        if b.tag == "screenplay_title":
            title = b.body.strip()
        elif b.tag in ("scene_slugline", "scene_heading"):
            scenes.append({"slugline": b.body.strip(), "blocks": []})
        elif b.tag in _ELEMENT_NAMES:
            current()["blocks"].append({"type": b.tag, "text": b.body})
        else:
            current()["blocks"].append({"type": "action", "text": b.body})
    return {"title": title, "scenes": scenes}


def dict_to_dsl(doc: dict) -> str:
    lines: list[str] = [dsl.block("screenplay_title", doc.get("title") or "Untitled Screenplay", {"align": "center"}), ""]
    for sc in doc.get("scenes", []):
        lines += [dsl.block("scene_slugline", sc.get("slugline") or "", {"align": "left"}), ""]
        for b in sc.get("blocks") or []:
            t = b.get("type") if b.get("type") in _ELEMENT_NAMES else "action"
            lines += [dsl.block(t, b.get("text", "")), ""]
    return "\n".join(lines).rstrip() + "\n"
