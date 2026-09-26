"""Importer for Final Draft .fdx screenplay files.

This implementation focuses on extracting a readable linear text
representation from the FDX XML. It maps common paragraph types such as
scene headings, action, and dialogue into simple HTML headings and
paragraphs, which are then converted to Markdown by the importing
controller.

The goal is robustness rather than full fidelity: unrecognised
paragraph types are treated as generic paragraphs so that imports do not
fail even when the FDX file uses features we do not explicitly model.
"""

from __future__ import annotations

from html import escape
from pathlib import Path
from xml.etree import ElementTree as ET

from .base import ImportedDocument, DocumentImportError


class FdxImporter:
    """Best-effort importer for Final Draft FDX files."""

    def import_file(self, path: Path) -> ImportedDocument:
        if not path.is_file():
            raise DocumentImportError(f"File does not exist: {path}")

        try:
            tree = ET.parse(str(path))
            root = tree.getroot()
        except Exception as exc:
            raise DocumentImportError(f"Could not parse FDX XML: {exc}") from exc

        html_parts: list[str] = []
        title: str | None = None

        # Best-effort extraction of a document title from the title page or
        # metadata sections. We intentionally keep this permissive so that
        # variations between FDX producers do not cause failures.
        try:
            for elem in root.iter():
                tag = elem.tag.split("}")[-1]
                if tag.lower() in {"title", "titletext"}:
                    candidate = "".join(elem.itertext()).strip()
                    if candidate:
                        title = candidate
                        break
        except Exception:
            title = None

        # Main screenplay content is expressed as <Paragraph> elements inside a
        # <Content> container. We do not rely on the exact hierarchy; instead we
        # iterate all Paragraph elements regardless of depth.
        for para in root.iter():
            tag = para.tag.split("}")[-1]
            if tag != "Paragraph":
                continue

            # Aggregate text from child <Text> elements when present, falling
            # back to all descendant text otherwise.
            text_fragments: list[str] = []
            try:
                for child in para.iter():
                    child_tag = child.tag.split("}")[-1]
                    if child_tag == "Text":
                        chunk = "".join(child.itertext())
                        if chunk:
                            text_fragments.append(chunk)
            except Exception:
                text_fragments = []

            if not text_fragments:
                try:
                    chunk = "".join(para.itertext())
                except Exception:
                    chunk = ""
                if chunk:
                    text_fragments.append(chunk)

            raw_text = "".join(text_fragments).strip()
            if not raw_text:
                continue

            safe = escape(raw_text)
            para_type = (para.attrib.get("Type") or "").strip().lower()

            # Map common screenplay paragraph types to simple HTML structure.
            if para_type in {"scene heading", "slugline"}:
                html_parts.append(f"<h2>{safe}</h2>")
            elif para_type in {"act heading", "sequence heading", "section heading"}:
                html_parts.append(f"<h1>{safe}</h1>")
            elif para_type == "character":
                html_parts.append(f"<p><strong>{safe}</strong></p>")
            else:
                # Dialogue, action, transitions, and any unknown types are
                # rendered as simple paragraphs so that the text remains
                # readable and editable.
                html_parts.append(f"<p>{safe}</p>")

        html = "\n".join(html_parts)
        metadata = {"title": title} if title else None
        return ImportedDocument(html=html, metadata=metadata)