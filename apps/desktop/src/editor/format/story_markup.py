"""Helpers for the `.story` format.

This module defines a minimal, extensible DSL for `.story` documents and
provides conversions from plain Markdown (for automatic migration) and
into HTML for exports / WYSIWYG rendering.

Notes
-----
* The current implementation focuses on a safe subset that covers titles,
  chapters and paragraphs. It is designed so that existing Markdown
  stories can be migrated automatically without losing text content.
* v2 (2026-10) adds paragraph branches (``[branch name="…"]…[/branch]``,
  attached to the paragraph before them) and images. Parsing is shared with
  `.screenplay`/`.comic` via :mod:`.dsl` and mirrored in the web app — see
  ``Documentation/Crowdly_file_formats_story_screenplay_comic.md``.
"""

from __future__ import annotations

from dataclasses import dataclass
from enum import Enum, auto
from html import escape
from typing import List, Tuple

from .. import story_sync
from . import dsl


class StoryBlockType(Enum):
    STORY_TITLE = auto()
    CHAPTER_TITLE = auto()
    PARAGRAPH = auto()
    BRANCH = auto()
    IMAGE = auto()
    RAW = auto()


@dataclass
class StoryBlock:
    type: StoryBlockType
    text: str
    # BRANCH: the branch name; IMAGE: alt text.
    name: str = ""


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
        elif block.type is StoryBlockType.BRANCH:
            lines.append(dsl.block("branch", block.text.rstrip("\n"), {"name": block.name}))
            lines.append("")
        elif block.type is StoryBlockType.IMAGE:
            lines.append(dsl.block("image", f"({block.text})", {"alt": block.name}))
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
    """Render `.story` DSL text to HTML suitable for export / WYSIWYG.

    Supports ``story_title``, ``chapter_title``, ``paragraph`` (with the
    style attributes handled by :func:`_style_from_attrs`), ``branch``
    (rendered as an aside after its paragraph), ``image`` and raw text from
    older files. Unknown tags become plain paragraphs so no text is lost.
    """

    out: List[str] = []
    for b in dsl.parse_blocks(text or ""):
        style = _style_from_attrs(b.attrs)
        if b.tag == "story_title":
            if "align" not in b.attrs:
                style = " style=\"text-align:center;\""
            out.append(f"<h1{style}>{escape(b.body.strip())}</h1>")
        elif b.tag == "chapter_title":
            out.append(f"<h2{style}>{escape(b.body.strip())}</h2>")
        elif b.tag == "branch":
            name = escape(b.attrs.get("name", ""))
            label = f"<strong>{name}</strong> " if name else ""
            body = escape(b.body).replace("\n", "<br />\n")
            out.append(f"<aside class=\"branch\" data-name=\"{name}\"{style}>{label}{body}</aside>")
        elif b.tag == "image":
            alt = escape(b.attrs.get("alt", ""))
            out.append(f"<p><img src=\"{escape(dsl.image_source(b.body))}\" alt=\"{alt}\"{style} /></p>")
        else:  # paragraph, raw, unknown
            body = escape(b.body.rstrip("\n")).replace("\n", "<br />\n")
            out.append(f"<p{style if b.tag == 'paragraph' else ''}>{body}</p>")
    return "\n".join(out) + "\n"


# ---------------------------------------------------------------------------
# Structured form shared with the web app and the backend's chapter model:
#   {"title": str,
#    "chapters": [{"title": str, "paragraphs": [str],
#                  "branches": {"<paragraph index>": [{"name": str, "text": str}]}}]}
# ---------------------------------------------------------------------------


def parse_dsl(text: str) -> dict:
    """Parse `.story` DSL into the structured form (see above)."""

    title = ""
    chapters: list[dict] = []

    def current() -> dict:
        if not chapters:
            chapters.append({"title": "", "paragraphs": [], "branches": {}})
        return chapters[-1]

    for b in dsl.parse_blocks(text or ""):
        if b.tag == "story_title":
            title = b.body.strip()
        elif b.tag == "chapter_title":
            chapters.append({"title": b.body.strip(), "paragraphs": [], "branches": {}})
        elif b.tag == "branch":
            ch = current()
            if not ch["paragraphs"]:
                ch["paragraphs"].append("")
            key = str(len(ch["paragraphs"]) - 1)
            ch["branches"].setdefault(key, []).append({"name": b.attrs.get("name", ""), "text": b.body})
        elif b.tag == "image":
            current()["paragraphs"].append(f"![{b.attrs.get('alt', '')}]({dsl.image_source(b.body)})")
        else:
            current()["paragraphs"].append(b.body)
    return {"title": title, "chapters": chapters}


def dict_to_dsl(doc: dict) -> str:
    """Serialise the structured form back to `.story` DSL."""

    lines: list[str] = [dsl.block("story_title", doc.get("title") or "Untitled", {"align": "center"}), ""]
    for ch in doc.get("chapters", []):
        lines += [dsl.block("chapter_title", ch.get("title") or "", {"align": "left"}), ""]
        branches = ch.get("branches") or {}
        for i, para in enumerate(ch.get("paragraphs") or []):
            lines += [dsl.block("paragraph", para, {"align": "left"}), ""]
            for br in branches.get(str(i), []):
                lines += [dsl.block("branch", br.get("text", ""), {"name": br.get("name", "")}), ""]
    return "\n".join(lines).rstrip() + "\n"
