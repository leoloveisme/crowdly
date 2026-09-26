"""EPUB exporter using :mod:`ebooklib`."""

from __future__ import annotations

from pathlib import Path

from .base import ExportError, ExportRequest, Exporter
from .markdown_utils import render_html_from_markdown


class EpubExporter(Exporter):
    """Export documents as `.epub` files using :mod:`ebooklib`."""

    def export(self, request: ExportRequest, target_path: Path) -> None:  # pragma: no cover - UI wiring
        markdown = (request.markdown or "").strip()
        if not markdown:
            raise ExportError("The document is empty; there is nothing to export.")

        try:
            from ebooklib import epub  # type: ignore[import]
        except Exception as exc:  # pragma: no cover - optional dependency
            raise ExportError("EPUB export is not available because 'ebooklib' is not installed.") from exc

        html = (request.html or "").strip() or render_html_from_markdown(request.markdown)
        title = request.title or "Document"

        try:
            book = epub.EpubBook()
            book.set_title(title)

            metadata = request.metadata or {}
            author = metadata.get("author") if isinstance(metadata, dict) else None
            if author:
                book.add_author(str(author))

            language = metadata.get("language") if isinstance(metadata, dict) else None
            if language:
                try:
                    book.set_language(str(language))
                except Exception:
                    pass

            # Single-chapter book for now; can be extended later to split on
            # headings.
            chapter = epub.EpubHtml(
                title=title,
                file_name="chap_1.xhtml",
                lang=getattr(book, "language", "en"),
            )
            chapter.content = html

            book.add_item(chapter)

            # Navigation items.
            book.add_item(epub.EpubNcx())
            book.add_item(epub.EpubNav())

            # Very small stylesheet so readers have something to hook onto.
            style = "body { font-family: serif; }"
            nav_css = epub.EpubItem(
                uid="style_nav",
                file_name="style/nav.css",
                media_type="text/css",
                content=style,
            )
            book.add_item(nav_css)

            book.toc = (chapter,)
            book.spine = ["nav", chapter]

            epub.write_epub(str(target_path), book)
        except Exception as exc:
            raise ExportError(f"Failed to export EPUB: {exc}") from exc
