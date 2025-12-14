"""Filesystem helpers used by the distraction-free editor.

This module is GUI-agnostic and centralises basic file IO.
"""

from __future__ import annotations

from pathlib import Path


def read_text(path: Path, encoding: str = "utf-8") -> str:
    """Read a UTF-8 text file from *path*.

    For now this assumes reasonably small text/Markdown files.
    """

    return path.read_text(encoding=encoding)


def write_text(path: Path, text: str, encoding: str = "utf-8") -> None:
    """Write *text* to *path* as UTF-8, creating parent directories if needed."""

    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding=encoding)
