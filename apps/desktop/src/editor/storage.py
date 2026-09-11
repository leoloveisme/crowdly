"""Filesystem helpers used by the distraction-free editor.

This module is GUI-agnostic and centralises basic file IO.
"""

from __future__ import annotations

from datetime import datetime
from pathlib import Path


def new_home_backup_path() -> Path:
    """Return a fresh timestamp-based ``~/*.bupx`` backup path.

    Used as the fallback save location when there is no Space (and no
    project space) to persist a document or master document into.
    """

    home = Path.home()
    timestamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    return home / f"crowdly-backup-{timestamp}.bupx"


def read_text(path: Path, encoding: str = "utf-8") -> str:
    """Read a UTF-8 text file from *path*.

    For now this assumes reasonably small text/Markdown files.
    """

    return path.read_text(encoding=encoding)


def write_text(path: Path, text: str, encoding: str = "utf-8") -> None:
    """Write *text* to *path* as UTF-8, creating parent directories if needed."""

    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding=encoding)
