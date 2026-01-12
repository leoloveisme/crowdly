"""Helpers for document types and storage formats.

These utilities are intentionally small and GUI-agnostic so they can be
used from both the Qt layer and any future non-GUI tooling.
"""

from __future__ import annotations

from pathlib import Path

from .. import file_metadata

# High-level document kinds recognised by the editor.
KIND_GENERIC = "generic"
KIND_STORY = "story"
KIND_SCREENPLAY = "screenplay"

# Low-level storage formats for Document.content and file_metadata.body_format.
FORMAT_MARKDOWN = "markdown"
FORMAT_STORY_V1 = "story_v1"
FORMAT_SCREENPLAY_V1 = "screenplay_v1"


def detect_kind_and_format(path: Path) -> tuple[str, str]:
    """Best-effort detection of (kind, storage_format) for *path*.

    The result is derived from a combination of:

    * File extension (``.md``, ``.story``, ``.screenplay``), and
    * xattrs managed by :mod:`file_metadata` (story_id, screenplay_id,
      body_format).

    The function is conservative: when in doubt it falls back to a
    generic/markdown pairing so existing behaviour remains unchanged.
    """

    kind = KIND_GENERIC
    storage_format = FORMAT_MARKDOWN

    try:
        # Prefer extension hints first so that newly created files without
        # metadata are still classified correctly.
        suffix = path.suffix.lower()
        is_story_ext = suffix == ".story"
        is_screenplay_ext = suffix == ".screenplay"

        if is_story_ext:
            kind = KIND_STORY
            storage_format = FORMAT_STORY_V1
        elif is_screenplay_ext:
            kind = KIND_SCREENPLAY
            storage_format = FORMAT_SCREENPLAY_V1
        else:
            # Anything else (including .md) defaults to markdown.
            kind = KIND_GENERIC
            storage_format = FORMAT_MARKDOWN

        # Overlay xattr-based hints when available. For `.story` and
        # `.screenplay` files we treat the extension as the source of truth
        # for the storage format so that older metadata values like
        # "markdown" do not downgrade the classification.
        md = file_metadata.read_story_metadata(path)
        body_fmt = (md.body_format or "").strip().lower()
        if body_fmt == FORMAT_STORY_V1:
            storage_format = FORMAT_STORY_V1
        elif body_fmt == FORMAT_SCREENPLAY_V1:
            storage_format = FORMAT_SCREENPLAY_V1
        elif body_fmt == FORMAT_MARKDOWN and not (is_story_ext or is_screenplay_ext):
            storage_format = FORMAT_MARKDOWN

        # Determine kind based on Crowdly story/screenplay linkage.
        if md.story_id or file_metadata.get_attr(path, "story_id"):
            kind = KIND_STORY
        elif file_metadata.get_attr(path, "screenplay_id"):
            kind = KIND_SCREENPLAY
    except Exception:
        # Never let metadata issues break loading; fall back to safe defaults.
        kind = KIND_GENERIC
        storage_format = FORMAT_MARKDOWN

    return kind, storage_format


def default_extension_for(kind: str, active_pane: str) -> str:
    """Return the default filename extension (including dot) for a new file.

    Rules (per product spec):

    * When the Markdown pane is active, we always save as ``.md`` so that
      pure-Markdown workflows continue to behave as before.
    * When the WYSIWYG pane is active:
      * ``story`` documents prefer ``.story``.
      * ``screenplay`` documents prefer ``.screenplay``.
      * ``generic`` documents fall back to ``.md``.
    """

    if active_pane != "wysiwyg":
        return ".md"

    if kind == KIND_STORY:
        return ".story"
    if kind == KIND_SCREENPLAY:
        return ".screenplay"

    return ".md"
