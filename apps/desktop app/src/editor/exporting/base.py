"""Core types and interfaces for the exporting subsystem."""

from __future__ import annotations

from dataclasses import dataclass
from enum import Enum
from pathlib import Path
from typing import Any, Protocol


class ExportFormat(str, Enum):
    """Supported export formats."""

    PDF = "pdf"
    EPUB = "epub"
    DOCX = "docx"
    ODT = "odt"
    FDX = "fdx"
    FOUNTAIN = "fountain"

    @property
    def extension(self) -> str:
        """Default filename extension for this format (including the dot)."""

        return f".{self.value}"


@dataclass
class ExportRequest:
    """Data required to export a document.

    Attributes
    ----------
    markdown:
        Canonical Markdown representation of the story.
    html:
        Optional HTML representation. When not provided, exporters that need
        HTML are free to derive it from :attr:`markdown`.
    title:
        Optional human-readable title used for document metadata.
    metadata:
        Optional free-form metadata bag (e.g. author, language).
    """

    markdown: str
    html: str | None = None
    title: str | None = None
    metadata: dict[str, Any] | None = None


class ExportError(Exception):
    """Raised when an export operation cannot be completed."""


class Exporter(Protocol):
    """Protocol for concrete exporters."""

    def export(self, request: ExportRequest, target_path: Path) -> None:  # pragma: no cover - interface
        """Export *request* to *target_path*.

        Implementations should either complete successfully or raise
        :class:`ExportError` with a user-facing message.
        """

