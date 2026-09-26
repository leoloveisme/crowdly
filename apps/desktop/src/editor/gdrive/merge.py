"""Line-based three-way merge for text files changed on both sides."""

from __future__ import annotations

import merge3

MERGE_MAX_BYTES = 2 * 1024 * 1024


def is_mergeable_text(content: bytes | None) -> bool:
    """Small, valid-UTF-8, NUL-free content counts as text (same rule as the backend)."""

    if content is None or len(content) > MERGE_MAX_BYTES or b"\x00" in content[:8192]:
        return False
    try:
        content.decode("utf-8")
    except UnicodeDecodeError:
        return False
    return True


def three_way_merge(ours: bytes, base: bytes, theirs: bytes) -> bytes | None:
    """Merge *ours* and *theirs* against their common *base*; ``None`` if both changed the same lines."""

    m = merge3.Merge3(
        base.decode("utf-8").splitlines(keepends=True),
        ours.decode("utf-8").splitlines(keepends=True),
        theirs.decode("utf-8").splitlines(keepends=True),
    )
    if any(region[0] == "conflict" for region in m.merge_regions()):
        return None
    return "".join(m.merge_lines()).encode("utf-8")
