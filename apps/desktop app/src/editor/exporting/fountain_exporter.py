"""Fountain exporter.

Fountain is a plain-text screenplay format. This exporter maps the
current Markdown document into a simple Fountain-compatible structure:

* The optional document title becomes the first line.
* Markdown headings are treated as scene headings and uppercased.
* Paragraph blocks are exported as action lines separated by blank lines.

The result is intentionally conservative so that most plain Markdown
documents still yield a readable Fountain script, while proper
screenplay-structured Markdown maps to a more semantically rich
Fountain file.
"""

from __future__ import annotations

from pathlib import Path

from .base import ExportError, ExportRequest, Exporter
from .markdown_blocks import BlockType, parse_markdown_to_blocks


class FountainExporter(Exporter):
    """Export documents as `.fountain` files."""

    def export(self, request: ExportRequest, target_path: Path) -> None:  # pragma: no cover - UI wiring
        markdown = (request.markdown or "").strip()
        if not markdown:
            raise ExportError("The document is empty; there is nothing to export.")

        lines: list[str] = []

        title = (request.title or "").strip()
        if title:
            lines.append(title)
            lines.append("")

        for block in parse_markdown_to_blocks(request.markdown):
            if block.type is BlockType.HEADING:
                heading = (block.text or "").strip()
                if not heading:
                    continue
                scene_line = heading.upper()
                lines.append(scene_line)
                lines.append("")
            else:
                text = (block.text or "").rstrip()
                if not text:
                    continue
                lines.append(text)
                lines.append("")

        fountain_text = "\n".join(lines).rstrip() + "\n"

        try:
            target = Path(target_path)
            target.write_text(fountain_text, encoding="utf-8")
        except Exception as exc:
            raise ExportError(f"Failed to export Fountain: {exc}") from exc