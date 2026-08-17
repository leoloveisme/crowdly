"""Importer for PDF documents.

The importer focuses on extracting readable text using ``pdfminer.six``
when available. It reconstructs paragraphs heuristically and renders
simple HTML paragraphs.
"""

from __future__ import annotations

from html import escape
from pathlib import Path
import re

from .base import ImportedDocument, DocumentImportError


class PdfImporter:
    """Text-centric PDF importer.

    Layout, images, and complex tables are intentionally ignored. The
    goal is to obtain a linear text representation suitable for editing
    as Markdown.
    """

    def import_file(self, path: Path) -> ImportedDocument:
        if not path.is_file():
            raise DocumentImportError(f"File does not exist: {path}")

        try:  # pragma: no cover - depends on optional dependency
            from pdfminer.high_level import extract_text  # type: ignore[import]
        except Exception as exc:
            raise DocumentImportError(
                "Importing .pdf files requires the optional 'pdfminer.six' package. "
                "Install it with 'pip install pdfminer.six'."
            ) from exc

        try:
            raw_text = extract_text(str(path)) or ""
        except Exception as exc:
            raise DocumentImportError(f"Could not read PDF file: {exc}") from exc

        if not raw_text.strip():
            return ImportedDocument(html="")

        # Split into paragraphs on blank lines.
        paragraphs = [p.strip() for p in re.split(r"\n\s*\n", raw_text) if p.strip()]

        html_parts = [f"<p>{escape(p)}</p>" for p in paragraphs]
        html = "\n".join(html_parts)
        return ImportedDocument(html=html)
