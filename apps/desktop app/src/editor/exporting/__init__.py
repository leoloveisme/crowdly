"""Exporting subsystem for external document formats.

Provides a small, modular pipeline for exporting the current document into
external formats such as PDF, DOCX, ODT, and EPUB.

High-level helpers live in :mod:`controller`, while individual format
implementations live in dedicated modules and are wired via
:mod:`registry`.
"""

from __future__ import annotations

from .base import ExportFormat, ExportRequest, ExportError, Exporter
from . import registry

__all__ = [
    "ExportFormat",
    "ExportRequest",
    "ExportError",
    "Exporter",
    "registry",
]
