"""Importer for EPUB ebooks.

Uses ``ebooklib`` to read the EPUB container and concatenates the HTML
content documents in spine order. The HTML is left mostly intact and
later converted to Markdown by the importing controller.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any

from .base import ImportedDocument, DocumentImportError


class EpubImporter:
    """EPUB importer leveraging ebooklib when available."""

    def import_file(self, path: Path) -> ImportedDocument:
        if not path.is_file():
            raise DocumentImportError(f"File does not exist: {path}")

        try:  # pragma: no cover - depends on optional dependency
            from ebooklib import epub, ITEM_DOCUMENT  # type: ignore[import]
        except Exception as exc:
            raise DocumentImportError(
                "Importing .epub files requires the optional 'ebooklib' package. "
                "Install it with 'pip install ebooklib'."
            ) from exc

        try:
            book = epub.read_epub(str(path))
        except Exception as exc:
            raise DocumentImportError(f"Could not read EPUB file: {exc}") from exc

        html_parts: list[str] = []

        try:
            for item in book.get_items_of_type(ITEM_DOCUMENT):
                try:
                    content_bytes = item.get_body_content()
                except Exception:
                    try:
                        content_bytes = item.get_content()
                    except Exception:
                        continue
                try:
                    html = content_bytes.decode("utf-8", errors="ignore")
                except Exception:
                    continue
                html_parts.append(html)
        except Exception:
            # If iteration fails for any reason, fall back to an empty document.
            pass

        html = "\n\n".join(html_parts)

        # Best-effort metadata extraction.
        metadata: dict[str, Any] | None = None
        try:
            meta: dict[str, Any] = {}
            titles = book.get_metadata("DC", "title")
            if titles:
                meta["title"] = str(titles[0][0])
            creators = book.get_metadata("DC", "creator")
            if creators:
                meta["author"] = str(creators[0][0])
            if meta:
                metadata = meta
        except Exception:
            metadata = None

        return ImportedDocument(html=html, metadata=metadata)
