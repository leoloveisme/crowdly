"""Importing subsystem for external document formats.

This package provides a small, modular pipeline for importing external
file formats (e.g. .docx, .odt, .pdf, .epub) into the editor.

High-level entrypoints live in :mod:`controller`, while individual format
parsers live in dedicated modules and are wired via :mod:`registry`.
"""

from __future__ import annotations

from .base import ImportedDocument, DocumentImportError, Importer
from . import registry

__all__ = [
    "ImportedDocument",
    "DocumentImportError",
    "Importer",
    "registry",
]
