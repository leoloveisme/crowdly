"""Minimal Markdown block parser shared by exporters.

The goal is not to be fully Markdown-compliant, but to recover a useful
structure of headings and paragraphs for export formats.
"""

from __future__ import annotations

from dataclasses import dataclass
from enum import Enum, auto
from typing import List


class BlockType(Enum):
    HEADING = auto()
    PARAGRAPH = auto()


@dataclass
class Block:
    type: BlockType
    text: str
    level: int | None = None  # used for headings only


def parse_markdown_to_blocks(markdown: str) -> List[Block]:
    """Parse *markdown* into a list of :class:`Block` objects.

    The parser recognises:

    * ATX headings (lines starting with one or more ``#``).
    * Paragraphs separated by blank lines.

    Lists and inline formatting are not interpreted; they are preserved as
    plain text so exporters can still emit readable output.
    """

    blocks: List[Block] = []
    buffer: list[str] = []

    def flush_paragraph() -> None:
        if not buffer:
            return
        text = "\n".join(buffer).strip()
        buffer.clear()
        if text:
            blocks.append(Block(type=BlockType.PARAGRAPH, text=text))

    for raw_line in (markdown or "").splitlines():
        line = raw_line.rstrip("\n")
        stripped = line.lstrip()

        if not stripped:
            # Paragraph separator.
            flush_paragraph()
            continue

        if stripped.startswith("#"):
            # Heading: flush any pending paragraph first.
            flush_paragraph()
            hash_prefix = stripped.split(" ", 1)[0]
            level = max(1, min(len(hash_prefix), 6))
            heading_text = stripped[level:].strip()
            if heading_text:
                blocks.append(Block(type=BlockType.HEADING, text=heading_text, level=level))
            continue

        buffer.append(line)

    flush_paragraph()
    return blocks