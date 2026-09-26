"""Registry for export format implementations."""

from __future__ import annotations

from typing import Dict

from .base import ExportFormat, Exporter


_exporters: Dict[ExportFormat, Exporter] = {}


def register_exporter(fmt: ExportFormat, exporter: Exporter) -> None:
    """Register *exporter* for *fmt*.

    Registering a new exporter for an already-registered format replaces the
    previous one.
    """

    _exporters[fmt] = exporter


def get_exporter(fmt: ExportFormat) -> Exporter | None:
    """Return the exporter registered for *fmt*, if any."""

    return _exporters.get(fmt)


def supported_formats() -> tuple[ExportFormat, ...]:
    """Return a tuple of formats that currently have an exporter."""

    return tuple(_exporters.keys())


# Wire built-in exporters at import time so callers can use the registry
# without additional setup.
from .pdf_exporter import PdfExporter  # noqa: E402
from .docx_exporter import DocxExporter  # noqa: E402
from .odt_exporter import OdtExporter  # noqa: E402
from .epub_exporter import EpubExporter  # noqa: E402
from .fdx_exporter import FdxExporter  # noqa: E402
from .fountain_exporter import FountainExporter  # noqa: E402

register_exporter(ExportFormat.PDF, PdfExporter())
register_exporter(ExportFormat.DOCX, DocxExporter())
register_exporter(ExportFormat.ODT, OdtExporter())
register_exporter(ExportFormat.EPUB, EpubExporter())
register_exporter(ExportFormat.FDX, FdxExporter())
register_exporter(ExportFormat.FOUNTAIN, FountainExporter())
