"""Crowdly story metadata stored on files via Linux extended attributes (xattrs).

We use per-field xattr keys so tools like `getfattr` are convenient and the
metadata association survives renames.

All values are stored as UTF-8 strings.

Notes
-----
- Xattrs typically survive renames/moves on the same filesystem.
- Copies may drop xattrs unless the tool preserves them (e.g. `cp -a`, `rsync -A`).
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
import errno
import os
from typing import Iterable


XATTR_PREFIX = "user.crowdly."

# ENOATTR exists on some platforms (macOS/BSD) but not on Linux.
_ERRNO_ENOATTR = getattr(errno, "ENOATTR", None)

# Public, user-facing metadata fields (per product spec)
# These apply to both regular stories and screenplays; a "screenplay" is a
# specialised kind of story, and we reuse the same revision/metadata
# infrastructure for both. The distinction between story and screenplay lives
# on the backend (story_title vs screenplay_title).
FIELD_AUTHOR_ID = "author_id"
FIELD_INITIATOR_ID = "initiator_id"
FIELD_STORY_ID = "story_id"  # used for regular stories; screenplays use screenplay_id
FIELD_STORY_TITLE = "story_title"  # used as the primary title for both kinds
FIELD_GENRE = "genre"
FIELD_TAGS = "tags"
FIELD_CREATION_DATE = "creation_date"
FIELD_CHANGE_DATE = "change_date"
FIELD_LAST_SYNC_DATE = "last_sync_date"

# Additional internal fields we need for sync/backends.
FIELD_SOURCE_URL = "source_url"  # may be /story/{id} or /screenplay{id}
FIELD_BODY_TYPE = "body_type"  # "story" | "screenplay" (optional hint)
FIELD_BODY_FORMAT = "body_format"
# ISO timestamp of last known title.updated_at from the backend.
FIELD_REMOTE_UPDATED_AT = "remote_updated_at"

PUBLIC_FIELDS: tuple[str, ...] = (
    FIELD_AUTHOR_ID,
    FIELD_INITIATOR_ID,
    FIELD_STORY_ID,
    FIELD_STORY_TITLE,
    FIELD_GENRE,
    FIELD_TAGS,
    FIELD_CREATION_DATE,
    FIELD_CHANGE_DATE,
    FIELD_LAST_SYNC_DATE,
)

INTERNAL_FIELDS: tuple[str, ...] = (
    FIELD_SOURCE_URL,
    FIELD_BODY_FORMAT,
    FIELD_REMOTE_UPDATED_AT,
)

ALL_FIELDS: tuple[str, ...] = PUBLIC_FIELDS + INTERNAL_FIELDS


@dataclass(frozen=True)
class StoryMetadata:
    author_id: str | None = None
    initiator_id: str | None = None
    story_id: str | None = None
    story_title: str | None = None
    genre: str | None = None
    tags: str | None = None
    creation_date: str | None = None
    change_date: str | None = None
    last_sync_date: str | None = None
    source_url: str | None = None
    body_format: str | None = None
    remote_updated_at: str | None = None


def now_human() -> str:
    """Return the required date format: ddmmyyyy hh:mm (24h)."""

    return datetime.now().strftime("%d%m%Y %H:%M")


def parse_human(value: str | None) -> datetime | None:
    """Parse ddmmyyyy hh:mm, returning None on failure."""

    if not value:
        return None
    try:
        return datetime.strptime(value.strip(), "%d%m%Y %H:%M")
    except Exception:
        return None


def has_story_metadata(path: Path) -> bool:
    """Return True if *path* appears to be associated with a Crowdly story."""

    return bool(get_attr(path, FIELD_STORY_ID))


def is_crowdly_document(path: Path) -> bool:
    """Return True if *path* looks like a Crowdly-linked document.

    This includes both regular stories (story_id) and screenplays (screenplay_id).
    """

    if has_story_metadata(path):
        return True
    # Screenplays created from the Crowdly template store their association via
    # a dedicated ``screenplay_id`` xattr.
    return bool(get_attr(path, "screenplay_id"))


def xattr_key(field: str) -> str:
    return XATTR_PREFIX + field


def get_attr(path: Path, field: str) -> str | None:
    """Get xattr value for *field* on *path*, returning None if missing/unsupported."""

    key = xattr_key(field)
    try:
        raw = os.getxattr(path, key)
    except OSError as exc:
        if exc.errno in (errno.ENODATA, errno.EOPNOTSUPP, errno.ENOTSUP) or (
            _ERRNO_ENOATTR is not None and exc.errno == _ERRNO_ENOATTR
        ):
            return None
        # Missing file etc.
        return None

    try:
        return raw.decode("utf-8", errors="replace")
    except Exception:
        return None


def set_attr(path: Path, field: str, value: str) -> bool:
    """Set xattr *field* on *path*.

    Returns True on success, False on unsupported/permission errors.
    """

    key = xattr_key(field)
    try:
        os.setxattr(path, key, (value or "").encode("utf-8"))
        return True
    except OSError as exc:
        if exc.errno in (errno.EOPNOTSUPP, errno.ENOTSUP, errno.EPERM, errno.EACCES):
            return False
        return False


def remove_attr(path: Path, field: str) -> bool:
    key = xattr_key(field)
    try:
        os.removexattr(path, key)
        return True
    except OSError as exc:
        if exc.errno == errno.ENODATA or (_ERRNO_ENOATTR is not None and exc.errno == _ERRNO_ENOATTR):
            return True
        if exc.errno in (errno.EOPNOTSUPP, errno.ENOTSUP, errno.EPERM, errno.EACCES):
            return False
        return False


def read_story_metadata(path: Path) -> StoryMetadata:
    """Read all known metadata fields from xattrs."""

    data = {field: get_attr(path, field) for field in ALL_FIELDS}
    return StoryMetadata(
        author_id=data.get(FIELD_AUTHOR_ID),
        initiator_id=data.get(FIELD_INITIATOR_ID),
        story_id=data.get(FIELD_STORY_ID),
        story_title=data.get(FIELD_STORY_TITLE),
        genre=data.get(FIELD_GENRE),
        tags=data.get(FIELD_TAGS),
        creation_date=data.get(FIELD_CREATION_DATE),
        change_date=data.get(FIELD_CHANGE_DATE),
        last_sync_date=data.get(FIELD_LAST_SYNC_DATE),
        source_url=data.get(FIELD_SOURCE_URL),
        body_format=data.get(FIELD_BODY_FORMAT),
        remote_updated_at=data.get(FIELD_REMOTE_UPDATED_AT),
    )


def _iter_items(metadata: StoryMetadata) -> Iterable[tuple[str, str | None]]:
    yield FIELD_AUTHOR_ID, metadata.author_id
    yield FIELD_INITIATOR_ID, metadata.initiator_id
    yield FIELD_STORY_ID, metadata.story_id
    yield FIELD_STORY_TITLE, metadata.story_title
    yield FIELD_GENRE, metadata.genre
    yield FIELD_TAGS, metadata.tags
    yield FIELD_CREATION_DATE, metadata.creation_date
    yield FIELD_CHANGE_DATE, metadata.change_date
    yield FIELD_LAST_SYNC_DATE, metadata.last_sync_date
    yield FIELD_SOURCE_URL, metadata.source_url
    yield FIELD_BODY_FORMAT, metadata.body_format
    yield FIELD_REMOTE_UPDATED_AT, metadata.remote_updated_at


def write_story_metadata(path: Path, metadata: StoryMetadata, *, remove_missing: bool = False) -> None:
    """Write metadata to xattrs.

    If remove_missing is True, fields with value None are removed.
    Otherwise None values are ignored.
    """

    for field, value in _iter_items(metadata):
        if value is None:
            if remove_missing:
                remove_attr(path, field)
            continue
        set_attr(path, field, value)


def touch_change_date(path: Path, *, when: str | None = None) -> None:
    """Update change_date to now (or *when*) if the file is a Crowdly doc.

    Applies to both regular stories and screenplays linked to Crowdly.
    """

    if not is_crowdly_document(path):
        return
    set_attr(path, FIELD_CHANGE_DATE, when or now_human())


def touch_last_sync_date(path: Path, *, when: str | None = None) -> None:
    """Update last_sync_date to now (or *when*) if the file is a Crowdly doc."""

    if not is_crowdly_document(path):
        return
    set_attr(path, FIELD_LAST_SYNC_DATE, when or now_human())


def set_genre(path: Path, genre: str) -> None:
    """Set the genre for a Crowdly-linked document (story or screenplay)."""

    if not is_crowdly_document(path):
        return
    set_attr(path, FIELD_GENRE, genre)


def clear_genre(path: Path) -> None:
    """Clear the genre for a Crowdly-linked document (story or screenplay)."""

    if not is_crowdly_document(path):
        return
    remove_attr(path, FIELD_GENRE)
