"""Importer for OpenDocument Text (.odt) files.

This implementation avoids external dependencies by reading the ODT
container (a ZIP archive) and extracting text from ``content.xml``.
It preserves basic structure (headings and paragraphs) but does not
attempt to fully model ODF styles or complex layouts.
"""

from __future__ import annotations

from html import escape
from pathlib import Path
from xml.etree import ElementTree as ET
from zipfile import ZipFile

from .base import ImportedDocument, DocumentImportError


class OdtImporter:
    """Best-effort ODT importer based on the OpenDocument XML."""

    _TEXT_NS = "urn:oasis:names:tc:opendocument:xmlns:text:1.0"

    def import_file(self, path: Path) -> ImportedDocument:
        if not path.is_file():
            raise DocumentImportError(f"File does not exist: {path}")

        try:
            with ZipFile(path) as zf:
                try:
                    data = zf.read("content.xml")
                except KeyError as exc:
                    raise DocumentImportError("ODT file is missing content.xml") from exc
        except Exception as exc:
            raise DocumentImportError(f"Could not read ODT container: {exc}") from exc

        try:
            root = ET.fromstring(data)
        except Exception as exc:
            raise DocumentImportError(f"Could not parse ODT XML: {exc}") from exc

        html_parts: list[str] = []

        for elem in root.iter():
            tag = elem.tag.split("}")[-1]  # Strip namespace
            if tag not in {"p", "h"}:
                continue

            # Collect visible text for this element.
            text = "".join(elem.itertext()).strip()
            if not text:
                continue

            safe = escape(text)

            if tag == "h":
                level_attr = elem.attrib.get(f"{{{self._TEXT_NS}}}outline-level") or elem.attrib.get(
                    f"{{{self._TEXT_NS}}}level"
                )
                try:
                    level = int(level_attr) if level_attr is not None else 1
                except Exception:
                    level = 1
                level = max(1, min(level, 6))
                html_parts.append(f"<h{level}>{safe}</h{level}>")
            else:
                html_parts.append(f"<p>{safe}</p>")

        html = "\n".join(html_parts)
        return ImportedDocument(html=html)
