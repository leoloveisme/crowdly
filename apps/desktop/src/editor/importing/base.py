"""Core types and interfaces for the importing subsystem."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any, Protocol, runtime_checkable


class DocumentImportError(Exception):
    """Raised when an external document cannot be imported safely.

    This is intentionally high-level and user-facing; callers should surface
    the error message to the user in a dialog rather than exposing raw
    library tracebacks.
    """


@dataclass
class ImportedDocument:
    """Result of importing an external document.

    Attributes
    ----------
    html:
        HTML representation of the imported content. This is used as the
        canonical interchange format between importers and the rest of the
        application.
    metadata:
        Optional free-form metadata such as title, author, etc.
    """

    html: str
    metadata: dict[str, Any] | None = None


@runtime_checkable
class Importer(Protocol):
    """Protocol for individual format importers."""

    def import_file(self, path: Path) -> ImportedDocument:  # pragma: no cover - interface
        """Import *path* and return a normalised :class:`ImportedDocument`."""
        raise NotImplementedError
