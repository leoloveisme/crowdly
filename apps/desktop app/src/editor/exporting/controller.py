"""High-level helpers for exporting documents to external formats.

This module is intentionally GUI-agnostic so it can be tested without Qt.
UI code is responsible for collecting a :class:`ExportRequest` and target
path, then calling :func:`export_to_path`.
"""

from __future__ import annotations

from pathlib import Path

from .base import ExportError, ExportFormat, ExportRequest
from . import registry


def export_to_path(fmt: ExportFormat, request: ExportRequest, target_path: Path) -> None:
    """Export *request* to *target_path* using the exporter for *fmt*.

    The caller is responsible for choosing a writable path and, ideally,
    ensuring that the filename has an appropriate extension. If the exporter
    for *fmt* is unavailable, :class:`ExportError` is raised.
    """

    if not isinstance(target_path, Path):  # defensive; simplify call sites
        target_path = Path(str(target_path))

    if not target_path.parent.exists():
        raise ExportError(f"Directory does not exist: {target_path.parent}")

    exporter = registry.get_exporter(fmt)
    if exporter is None:
        raise ExportError(f"No exporter is registered for format: {fmt.value}")

    exporter.export(request, target_path)
