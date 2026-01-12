"""Format helpers for story/screenplay-aware documents.

This package exposes small helper utilities used by the GUI layer to
reason about document kinds (generic/story/screenplay) and storage
formats (markdown/story_v1/screenplay_v1).
"""

from __future__ import annotations

from .types import (
    KIND_GENERIC,
    KIND_STORY,
    KIND_SCREENPLAY,
    FORMAT_MARKDOWN,
    FORMAT_STORY_V1,
    FORMAT_SCREENPLAY_V1,
    detect_kind_and_format,
    default_extension_for,
)
