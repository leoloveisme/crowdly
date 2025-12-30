"""PDF exporter using Qt's printing support."""

from __future__ import annotations

from pathlib import Path

from .base import ExportError, ExportRequest, Exporter
from .markdown_utils import render_html_from_markdown


class PdfExporter(Exporter):
    """Export documents as PDF via :mod:`PySide6` printing APIs."""

    def export(self, request: ExportRequest, target_path: Path) -> None:  # pragma: no cover - UI wiring
        html = (request.html or "").strip() or render_html_from_markdown(request.markdown)
        if not html.strip():
            raise ExportError("The document is empty; there is nothing to export.")

        try:
            from PySide6.QtGui import QTextDocument
            from PySide6.QtPrintSupport import QPrinter
        except Exception as exc:  # pragma: no cover - environment specific
            raise ExportError("PDF export is not available in this environment.") from exc

        try:
            doc = QTextDocument()
            if request.title:
                try:
                    # Best-effort: set document title metadata where supported.
                    doc.setMetaInformation(QTextDocument.MetaInformation.DocumentTitle, request.title)
                except Exception:
                    pass
            doc.setHtml(html)

            printer = QPrinter(QPrinter.PrinterMode.HighResolution)
            printer.setOutputFormat(QPrinter.OutputFormat.PdfFormat)
            printer.setOutputFileName(str(target_path))

            # PySide uses ``print_`` for this method because ``print`` is a
            # reserved keyword in Python. Prefer ``print_`` when available but
            # fall back to ``print`` for maximum compatibility.
            if hasattr(doc, "print_"):
                doc.print_(printer)  # type: ignore[attr-defined]
            elif hasattr(doc, "print"):
                doc.print(printer)  # type: ignore[call-arg]
            else:  # pragma: no cover - extremely unlikely
                raise ExportError("This Qt version does not support printing from QTextDocument.")
        except Exception as exc:  # pragma: no cover - runtime-specific issues
            raise ExportError(f"Failed to export PDF: {exc}") from exc
