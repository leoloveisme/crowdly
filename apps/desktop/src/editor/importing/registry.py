"""Registry for external document importers.

Importers are registered by file extension (e.g. ".docx", ".pdf").
The registry is intentionally small and in-memory.
"""

from __future__ import annotations

from pathlib import Path
from typing import Dict

from .base import Importer


# Mapping from file extension (lowercase, including leading dot) to importer.
_IMPORTERS: Dict[str, Importer] = {}


def register_importer(ext: str, importer: Importer) -> None:
    """Register *importer* for the given file extension *ext*.

    The leading dot is optional; extensions are stored lowercased.
    Subsequent registrations for the same extension overwrite the previous
    importer.
    """

    if not ext:
        return
    if not ext.startswith("."):
        ext = "." + ext
    _IMPORTERS[ext.lower()] = importer


def get_importer_for(path: Path) -> Importer | None:
    """Return the importer registered for *path*'s extension, if any."""

    ext = path.suffix.lower()
    return _IMPORTERS.get(ext)


def supported_extensions() -> tuple[str, ...]:
    """Return a sorted tuple of supported file extensions."""

    return tuple(sorted(_IMPORTERS.keys()))


def _register_builtin_importers() -> None:
    """Register the built-in importers for standard formats.

    Each importer module is responsible for handling missing third-party
    dependencies gracefully.
    """

    from .docx_importer import DocxImporter
    from .odt_importer import OdtImporter
    from .pdf_importer import PdfImporter
    from .epub_importer import EpubImporter
    from .fdx_importer import FdxImporter
    from .fountain_importer import FountainImporter

    register_importer(".docx", DocxImporter())
    register_importer(".odt", OdtImporter())
    register_importer(".pdf", PdfImporter())
    register_importer(".epub", EpubImporter())
    register_importer(".fdx", FdxImporter())
    register_importer(".fountain", FountainImporter())


# Eagerly register built-ins on import so callers can immediately query
# supported_extensions() and get_importer_for().
_register_builtin_importers()
