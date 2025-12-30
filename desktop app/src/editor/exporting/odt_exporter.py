"""ODT exporter using :mod:`odfpy`.

The dependency is imported lazily so that the rest of the application can run
without ``odfpy`` installed; attempts to export as ODT will then fail with a
clear :class:`ExportError`.
"""

from __future__ import annotations

from pathlib import Path

from .base import ExportError, ExportRequest, Exporter
from .markdown_blocks import BlockType, parse_markdown_to_blocks


class OdtExporter(Exporter):
    """Export documents as `.odt` files using :mod:`odfpy`."""

    def export(self, request: ExportRequest, target_path: Path) -> None:  # pragma: no cover - UI wiring
        text = (request.markdown or "").strip()
        if not text:
            raise ExportError("The document is empty; there is nothing to export.")

        try:
            from odf.opendocument import OpenDocumentText  # type: ignore[import]
            from odf import text as odf_text  # type: ignore[import]
            from odf import meta as odf_meta  # type: ignore[import]
        except Exception as exc:  # pragma: no cover - optional dependency
            raise ExportError("ODT export is not available because 'odfpy' is not installed.") from exc

        try:
            doc = OpenDocumentText()

            # Metadata.
            if request.title:
                try:
                    doc.meta.addElement(odf_meta.Title(text=request.title))
                except Exception:
                    pass

            metadata = request.metadata or {}
            author = metadata.get("author") if isinstance(metadata, dict) else None
            if author:
                try:
                    doc.meta.addElement(odf_meta.InitialCreator(text=str(author)))
                except Exception:
                    pass

            for block in parse_markdown_to_blocks(request.markdown):
                if block.type is BlockType.HEADING:
                    level = block.level or 1
                    level = max(1, min(level, 6))
                    elem = odf_text.H(outlinelevel=level, text=block.text)
                else:
                    elem = odf_text.P(text=block.text)
                doc.text.addElement(elem)

            # ``addsuffx=False`` avoids creating ``.odt.odt`` when the filename
            # already contains the proper extension.
            doc.save(str(target_path), addsuffix=False)
        except Exception as exc:
            raise ExportError(f"Failed to export ODT: {exc}") from exc
