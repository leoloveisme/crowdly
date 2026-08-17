"""FDX (Final Draft) exporter.

This exporter emits a minimal but standards-aligned FDX XML document that
captures the linear structure of the current Markdown document using a
sequence of ``<Paragraph>`` elements.

Headings in Markdown are mapped to ``Scene Heading`` paragraphs; all
other blocks are exported as ``Action`` paragraphs. The goal is to
produce a file that can be opened by common FDX-aware tools while
keeping the implementation dependency-free.
"""

from __future__ import annotations

from pathlib import Path
from xml.etree import ElementTree as ET

from .base import ExportError, ExportRequest, Exporter
from .markdown_blocks import BlockType, parse_markdown_to_blocks


class FdxExporter(Exporter):
    """Export documents as Final Draft `.fdx` files."""

    def export(self, request: ExportRequest, target_path: Path) -> None:  # pragma: no cover - UI wiring
        markdown = (request.markdown or "").strip()
        if not markdown:
            raise ExportError("The document is empty; there is nothing to export.")

        try:
            root = ET.Element("FinalDraft")
            root.set("DocumentType", "Script")
            root.set("Template", "No")
            root.set("Version", "1")

            title = (request.title or "").strip()
            if title:
                title_page = ET.SubElement(root, "TitlePage")
                tp_content = ET.SubElement(title_page, "Content")
                tp_para = ET.SubElement(tp_content, "Paragraph")
                tp_para.set("Type", "Title")
                tp_text = ET.SubElement(tp_para, "Text")
                tp_text.text = title

            content = ET.SubElement(root, "Content")

            for block in parse_markdown_to_blocks(request.markdown):
                para = ET.SubElement(content, "Paragraph")
                if block.type is BlockType.HEADING:
                    para.set("Type", "Scene Heading")
                else:
                    para.set("Type", "Action")

                text_el = ET.SubElement(para, "Text")
                text_el.text = block.text

            tree = ET.ElementTree(root)
            tree.write(str(target_path), encoding="utf-8", xml_declaration=True)
        except Exception as exc:
            raise ExportError(f"Failed to export FDX: {exc}") from exc