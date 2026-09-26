"""Importer for Fountain screenplay text files.

Fountain is a plain-text markup format for screenplays. This importer
implements a conservative subset that focuses on producing a readable
Markdown-compatible structure:

* Scene headings are detected heuristically (INT./EXT./EST./INT/EXT./I/E).
* Header metadata such as ``Title:`` and ``Author:`` is recorded where
  possible.
* All other lines become paragraphs so that no content is lost even when
  the file uses advanced Fountain features.
"""

from __future__ import annotations

from html import escape
from pathlib import Path
import re

from .base import ImportedDocument, DocumentImportError


_SCENE_HEADING_RE = re.compile(r"^(INT\.|EXT\.|EST\.|INT/EXT\.|I/E\.)", re.IGNORECASE)


class FountainImporter:
    """Best-effort importer for Fountain (.fountain) files."""

    def import_file(self, path: Path) -> ImportedDocument:
        if not path.is_file():
            raise DocumentImportError(f"File does not exist: {path}")

        try:
            try:
                text = path.read_text(encoding="utf-8")
            except UnicodeDecodeError:
                text = path.read_text(encoding="latin-1")
        except Exception as exc:
            raise DocumentImportError(f"Could not read Fountain file: {exc}") from exc

        if not text.strip():
            return ImportedDocument(html="")

        lines = text.splitlines()
        html_parts: list[str] = []
        metadata: dict[str, str] = {}

        # Header metadata block (Title:, Author:, etc.) appears at the top of
        # many Fountain files. We capture a few common fields and exclude them
        # from the rendered body.
        in_header = True
        for raw in lines:
            line = raw.rstrip("\n")
            stripped = line.strip()

            if in_header:
                if not stripped:
                    in_header = False
                    continue

                if ":" in stripped:
                    key, value = stripped.split(":", 1)
                    key = key.strip().lower()
                    value = value.strip()
                    if key == "title" and value:
                        metadata["title"] = value
                        continue
                    if key == "author" and value:
                        metadata["author"] = value
                        continue

                # Any non key-value line ends the header block; treat it as
                # regular body content from now on.
                in_header = False

            if not stripped:
                # Preserve intentional blank lines as paragraph separators.
                html_parts.append("<p></p>")
                continue

            safe = escape(stripped)

            # Basic scene heading detection.
            if _SCENE_HEADING_RE.match(stripped):
                html_parts.append(f"<h2>{safe}</h2>")
            else:
                html_parts.append(f"<p>{safe}</p>")

        html = "\n".join(html_parts)
        return ImportedDocument(html=html, metadata=metadata or None)