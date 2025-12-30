"""Document model for the distraction-free editor.

This module is GUI-agnostic and encapsulates the basic behaviour for
loading and saving text documents on disk.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path

from . import storage
from . import file_metadata


@dataclass
class Document:
    """Represents a single text/Markdown document on disk."""

    path: Path | None = None
    content: str = ""
    is_dirty: bool = False
    last_saved_at: datetime | None = None

    @classmethod
    def load(cls, path: Path) -> "Document":
        """Load a document from ``path``.

        Parameters
        ----------
        path:
            Path to an existing text/Markdown file.
        """

        text = storage.read_text(path)
        return cls(path=path, content=text, is_dirty=False, last_saved_at=datetime.now())

    def set_content(self, new_content: str) -> None:
        """Update the document content and mark it dirty if changed."""

        if new_content != self.content:
            self.content = new_content
            self.is_dirty = True

    def save(self, path: Path | None = None) -> None:
        """Persist the document to disk.

        If ``path`` is provided, it becomes the new document path. Otherwise
        the existing ``self.path`` is used.
        """

        target = path or self.path
        if target is None:
            raise ValueError("Cannot save a document without a file path")

        storage.write_text(target, self.content)

        # Best-effort: if this file is associated with a Crowdly story, update
        # the change_date metadata automatically.
        try:
            file_metadata.touch_change_date(target)
        except Exception:
            # Never fail a save due to metadata issues.
            pass

        self.path = target
        self.is_dirty = False
        self.last_saved_at = datetime.now()
