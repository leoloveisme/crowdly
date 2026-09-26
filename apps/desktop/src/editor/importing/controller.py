"""High-level helpers for importing external documents.

UI code should call into this module instead of individual importers.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any, Tuple

from .base import DocumentImportError
from . import registry
from .html_utils import html_to_markdown


def get_supported_extensions() -> tuple[str, ...]:
    """Return extensions supported by the importing subsystem."""

    return registry.supported_extensions()


def import_to_markdown(path: Path) -> Tuple[str, dict[str, Any] | None]:
    """Import *path* and return ``(markdown, metadata)``.

    The low-level importer is responsible for parsing the external
    format and producing HTML. We convert that HTML to Markdown so it can
    be fed into the existing editor/document pipeline.
    """

    if not path.is_file():
        raise DocumentImportError(f"File does not exist: {path}")

    importer = registry.get_importer_for(path)
    if importer is None:
        raise DocumentImportError(
            f"No importer is registered for *{path.suffix}* files."
        )

    imported = importer.import_file(path)
    markdown = html_to_markdown(imported.html)
    return markdown, imported.metadata or None
