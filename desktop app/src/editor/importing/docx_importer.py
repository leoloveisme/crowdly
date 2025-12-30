"""Importer for Microsoft Word .docx documents."""

from __future__ import annotations

from html import escape
from pathlib import Path
from typing import Any

from .base import ImportedDocument, DocumentImportError


class DocxImporter:
    """Best-effort importer for .docx files using python-docx.

    The implementation focuses on core structure (headings and
    paragraphs) and basic inline formatting (bold/italic/underline).
    Lists and complex layouts are currently flattened into paragraphs.
    """

    def import_file(self, path: Path) -> ImportedDocument:
        if not path.is_file():
            raise DocumentImportError(f"File does not exist: {path}")

        try:  # pragma: no cover - relies on optional dependency
            from docx import Document as DocxDocument  # type: ignore[import]
        except Exception as exc:  # ImportError or other environment issues
            raise DocumentImportError(
                "Importing .docx files requires the optional 'python-docx' package. "
                "Install it with 'pip install python-docx'."
            ) from exc

        try:
            doc = DocxDocument(str(path))
        except Exception as exc:
            raise DocumentImportError(f"Could not read DOCX file: {exc}") from exc

        html_parts: list[str] = []

        for para in getattr(doc, "paragraphs", []):
            runs_html: list[str] = []
            for run in getattr(para, "runs", []):
                raw = getattr(run, "text", "") or ""
                if not raw:
                    continue

                segment = escape(raw)
                if getattr(run, "bold", False):
                    segment = f"<strong>{segment}</strong>"
                if getattr(run, "italic", False):
                    segment = f"<em>{segment}</em>"
                if getattr(run, "underline", False):
                    segment = f"<u>{segment}</u>"
                runs_html.append(segment)

            if not runs_html:
                continue

            style_name = ""
            try:
                style = getattr(para, "style", None)
                style_name = (getattr(style, "name", "") or "").lower()
            except Exception:
                style_name = ""

            tag = "p"
            if "heading" in style_name:
                level = 1
                for ch in style_name:
                    if ch.isdigit():
                        try:
                            level = int(ch)
                            break
                        except Exception:
                            level = 1
                level = max(1, min(level, 6))
                tag = f"h{level}"

            html_parts.append(f"<{tag}>{''.join(runs_html)}</{tag}>")

        html = "\n".join(html_parts)

        # Best-effort metadata extraction from core properties.
        metadata: dict[str, Any] | None = None
        try:
            core = getattr(doc, "core_properties", None)
            if core is not None:
                meta: dict[str, Any] = {}
                title = getattr(core, "title", None)
                if title:
                    meta["title"] = str(title)
                author = getattr(core, "author", None)
                if author:
                    meta["author"] = str(author)
                subject = getattr(core, "subject", None)
                if subject:
                    meta["subject"] = str(subject)
                if meta:
                    metadata = meta
        except Exception:
            metadata = None

        return ImportedDocument(html=html, metadata=metadata)
