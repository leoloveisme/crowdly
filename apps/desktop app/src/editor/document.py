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
    """Represents a single text/Markdown document on disk.

    ``content`` always stores the canonical representation for the on-disk
    ``storage_format``:

    * ``"markdown"``  – raw Markdown/text, as before.
    * ``"story_v1"``  – raw ``.story`` DSL text.
    * ``"screenplay_v1"`` – raw ``.screenplay`` DSL text.

    The higher-level UI and conversion layer are responsible for mapping
    between these formats and what the user sees in the MD/WYSIWYG panes.
    """

    path: Path | None = None
    content: str = ""
    is_dirty: bool = False
    last_saved_at: datetime | None = None
    # High-level type hint used by the UI and sync layers. "generic" means the
    # document is not yet classified as a story or screenplay.
    kind: str = "generic"  # "generic" | "story" | "screenplay"
    # Low-level storage format for ``content``. This mirrors the
    # ``file_metadata.body_format`` xattr where available.
    storage_format: str = "markdown"  # "markdown" | "story_v1" | "screenplay_v1"

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
        # the change_date metadata automatically and mirror the storage_format
        # into the body_format xattr so other components can reason about it.
        try:
            file_metadata.touch_change_date(target)
            # Persist the body_format hint even for non-Crowdly documents; this
            # is harmless on platforms without xattr support.
            fmt = (self.storage_format or "").strip() or "markdown"
            file_metadata.set_attr(target, file_metadata.FIELD_BODY_FORMAT, fmt)
        except Exception:
            # Never fail a save due to metadata issues.
            pass

        self.path = target
        self.is_dirty = False
        self.last_saved_at = datetime.now()
