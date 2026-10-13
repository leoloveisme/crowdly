"""Shared block parser for the `.story`, `.screenplay` and `.comic` formats.

All three formats are sequences of tagged blocks::

    [tag attr attr key=value key="value with spaces"]body[/tag]

* A block opens with ``[tag ...]`` at the start of a line and runs until
  the matching ``[/tag]`` — on the same line or a later one, so bodies may
  span several lines.
* Attributes: ``key=value`` / ``key="quoted value"``; the first bare
  ``left|center|right|justify`` is the alignment (``align``); other bare
  words are flags (value ``"1"``), e.g. ``bold``.
* Image-like blocks (``image``, ``page``) carry their source in the body as
  ``(path-or-url)``.
* Text outside any block is kept as ``raw`` blocks (one per paragraph,
  separated by blank lines) so files from older versions lose nothing.

The web app has the same parser in ``apps/web/src/formats/dsl.ts``; both are
checked against ``apps/desktop/tests/fixtures/formats``. The format is
described in ``Documentation/Crowdly_file_formats_story_screenplay_comic.md``.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field

_ALIGN = {"left", "center", "right", "justify"}
_TOKEN = re.compile(r'([\w-]+)="([^"]*)"|(\S+)')
_OPEN = re.compile(r"^\[([a-z_]+)(\s[^\]]*)?\]")


@dataclass
class Block:
    tag: str
    attrs: dict[str, str] = field(default_factory=dict)
    body: str = ""


def parse_attrs(text: str) -> dict[str, str]:
    attrs: dict[str, str] = {}
    for m in _TOKEN.finditer(text or ""):
        if m.group(1):
            attrs[m.group(1)] = m.group(2)
            continue
        token = m.group(3)
        if "=" in token:
            key, value = token.split("=", 1)
            attrs[key.strip()] = value.strip()
        elif token in _ALIGN and "align" not in attrs:
            attrs["align"] = token
        else:
            attrs[token] = "1"
    return attrs


def format_attrs(attrs: dict[str, str]) -> str:
    parts: list[str] = []
    align = attrs.get("align")
    if align:
        parts.append(align)
    for key, value in attrs.items():
        if key == "align" or value is None or value == "":
            continue
        if value == "1":
            parts.append(key)
        elif re.search(r'[\s"\]]', value):
            parts.append(f'{key}="{value.replace(chr(34), chr(39))}"')
        else:
            parts.append(f"{key}={value}")
    return (" " + " ".join(parts)) if parts else ""


def parse_blocks(text: str) -> list[Block]:
    """Split DSL text into blocks (see the module docstring)."""

    lines = (text or "").replace("\r\n", "\n").split("\n")
    blocks: list[Block] = []
    raw: list[str] = []

    def flush_raw() -> None:
        if raw:
            body = "\n".join(raw).strip("\n")
            if body.strip():
                blocks.append(Block(tag="raw", body=body))
            raw.clear()

    i = 0
    while i < len(lines):
        line = lines[i]
        stripped = line.strip()
        m = _OPEN.match(stripped)
        if not m:
            if stripped:
                raw.append(line)
            else:
                flush_raw()
            i += 1
            continue

        tag = m.group(1)
        close = f"[/{tag}]"
        rest = stripped[m.end():]
        # "[sic]" and other bracketed prose without a closing tag is text.
        if close not in rest and not any(close in later for later in lines[i + 1:]):
            raw.append(line)
            i += 1
            continue

        flush_raw()
        attrs = parse_attrs(m.group(2) or "")
        body_lines: list[str] = []
        if close in rest:
            body_lines.append(rest[: rest.index(close)])
        else:
            body_lines.append(rest)
            i += 1
            while i < len(lines) and close not in lines[i]:
                body_lines.append(lines[i])
                i += 1
            if i < len(lines):
                body_lines.append(lines[i][: lines[i].index(close)])
        body = "\n".join(body_lines).strip("\n")
        blocks.append(Block(tag=tag, attrs=attrs, body=body))
        i += 1

    flush_raw()
    return blocks


def image_source(body: str) -> str:
    body = body.strip()
    if body.startswith("(") and body.endswith(")"):
        return body[1:-1].strip()
    return body


def block(tag: str, body: str, attrs: dict[str, str] | None = None) -> str:
    return f"[{tag}{format_attrs(attrs or {})}]{body}[/{tag}]"


def serialize(blocks: list[Block]) -> str:
    parts: list[str] = []
    for b in blocks:
        parts.append(b.body if b.tag == "raw" else block(b.tag, b.body, b.attrs))
        parts.append("")
    return "\n".join(parts).rstrip() + "\n"


# Attributes that describe a block's meaning rather than its look; carried
# over by restore_tags when a generic block gets its real tag back.
_MEANING_ATTRS = {"name", "alt", "direction", "id"}


def restore_tags(original: str, generated: str, generic: set[str], special: set[str]) -> str:
    """Give rebuilt blocks back the tags the WYSIWYG pane can't express.

    The desktop's rich-text pane only knows headings and paragraphs, so a
    `.story` branch or a `.screenplay` character/dialogue line comes back as
    a plain ``paragraph``/``action`` when DSL is rebuilt from it. For every
    *generic* block in *generated* whose text equals a not-yet-used
    *special* block in *original*, the original tag (and its meaning
    attributes, e.g. a branch's name) is restored; styling from the new
    block is kept.
    """

    pool: dict[str, list[Block]] = {}
    ids: dict[tuple[str, str], list[str]] = {}
    for b in parse_blocks(original):
        if b.tag in special:
            pool.setdefault(b.body.strip(), []).append(b)
        elif b.attrs.get("id"):
            # Sync ids on headings / elements the pane rebuilds without them.
            ids.setdefault((b.tag, b.body.strip()), []).append(b.attrs["id"])
    if not pool and not ids:
        return generated
    out = parse_blocks(generated)
    changed = False
    for b in out:
        if "id" not in b.attrs and ids.get((b.tag, b.body.strip())):
            b.attrs["id"] = ids[(b.tag, b.body.strip())].pop(0)
            changed = True
        if b.tag not in generic:
            continue
        candidates = pool.get(b.body.strip())
        if not candidates:
            continue
        src = candidates.pop(0)
        b.tag = src.tag
        for key in _MEANING_ATTRS:
            if key in src.attrs:
                b.attrs[key] = src.attrs[key]
        changed = True
    return serialize(out) if changed else generated
