"""The local Discovery library: imported book files plus reading data.

Layout under ``~/.config/crowdly_editor/library/``::

    index.json          items, positions, highlights, pending sessions
    files/<id><suffix>  a private copy of every imported book

Imported books stay private. When "Synchronisation with web platform" is on
they are uploaded to the user's own Crowdly account (see ``library.sync``);
nothing here ever makes a file reachable by anyone else.
"""

from __future__ import annotations

import hashlib
import json
import shutil
import threading
import uuid
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from pathlib import Path

from .drm import drm_reason
from .metadata import SUPPORTED_SUFFIXES, read_metadata

KIND_IMPORTED = "imported_book"
KIND_CROWDLY = "crowdly_story"

RIGHTS_UNKNOWN = "unknown"
RIGHTS_PERSONAL_COPY = "personal_copy"
RIGHTS_OWN_WORK = "own_work"
RIGHTS_PUBLIC_DOMAIN = "public_domain"
RIGHTS_CC_LICENSED = "cc_licensed"
RIGHTS_STATUSES = (
    RIGHTS_UNKNOWN,
    RIGHTS_PERSONAL_COPY,
    RIGHTS_OWN_WORK,
    RIGHTS_PUBLIC_DOMAIN,
    RIGHTS_CC_LICENSED,
)
# Only these may become a Crowdly story others can read and co-create.
CONVERTIBLE_RIGHTS = (RIGHTS_OWN_WORK, RIGHTS_PUBLIC_DOMAIN, RIGHTS_CC_LICENSED)

# Reading sessions shorter than this are dropped (accidental opens).
MIN_SESSION_SECONDS = 10


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


class LibraryImportError(Exception):
    """User-facing reason a file could not be imported."""


@dataclass
class LibraryItem:
    id: str
    kind: str = KIND_IMPORTED
    title: str = ""
    author: str = ""
    language: str = ""
    format: str = "text"
    file_name: str = ""
    sha256: str = ""
    size: int = 0
    added_at: str = ""
    story_title_id: str | None = None
    rights_status: str = RIGHTS_UNKNOWN
    rights_declared_at: str | None = None
    remote_id: str | None = None
    uploaded: bool = False
    # {"percent": float, "locator": {...}, "narration": {...}, "updated_at": iso}
    position: dict = field(default_factory=dict)
    position_synced: bool = True
    # [{"id", "version", "color", "note", "quote", "start", "end",
    #   "deleted", "updated_at", "dirty"}]
    highlights: list[dict] = field(default_factory=list)
    highlights_ack: int = 0
    # [{"id", "started_at", "ended_at", "seconds"}] not yet sent.
    pending_sessions: list[dict] = field(default_factory=list)
    total_seconds: int = 0
    last_opened_at: str | None = None
    # Cover thumbnail next to the book file ("<id>.cover.png"); made once at
    # import (or downloaded from the account) - see library.covers.
    cover_file: str = ""
    cover_checked: bool = False
    cover_uploaded: bool = False

    @classmethod
    def from_dict(cls, data: dict) -> "LibraryItem":
        known = {f for f in cls.__dataclass_fields__}  # type: ignore[attr-defined]
        return cls(**{k: v for k, v in data.items() if k in known})


def file_sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as fh:
        for chunk in iter(lambda: fh.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


class LocalLibrary:
    """JSON-backed library stored in the user's config directory."""

    def __init__(self, root: Path) -> None:
        self.root = root
        self.files_dir = root / "files"
        self.index_path = root / "index.json"
        self._items: dict[str, LibraryItem] = {}
        # Sync runs on a worker thread while the reader keeps saving
        # positions; serialise writes of the index file.
        self._lock = threading.RLock()
        # Account copies to delete on the next sync (removed while offline
        # or while sync was off), so they are not downloaded again.
        self.pending_remote_deletes: list[str] = []
        self.load()

    # -- persistence -------------------------------------------------------

    def load(self) -> None:
        self._items = {}
        self.pending_remote_deletes = []
        try:
            raw = json.loads(self.index_path.read_text(encoding="utf-8"))
        except Exception:
            return
        if isinstance(raw, dict):
            self.pending_remote_deletes = [
                r for r in raw.get("pending_remote_deletes", []) if isinstance(r, str)
            ]
        for data in raw.get("items", []) if isinstance(raw, dict) else []:
            if isinstance(data, dict) and isinstance(data.get("id"), str):
                try:
                    item = LibraryItem.from_dict(data)
                except TypeError:
                    continue
                self._items[item.id] = item

    def save(self) -> None:
        with self._lock:
            self.root.mkdir(parents=True, exist_ok=True)
            payload = {
                "version": 1,
                "items": [asdict(i) for i in list(self._items.values())],
                "pending_remote_deletes": list(self.pending_remote_deletes),
            }
            tmp = self.index_path.with_suffix(".tmp")
            tmp.write_text(json.dumps(payload, indent=2), encoding="utf-8")
            tmp.replace(self.index_path)

    # -- queries -----------------------------------------------------------

    def items(self, kind: str | None = None) -> list[LibraryItem]:
        items = [i for i in self._items.values() if kind is None or i.kind == kind]
        return sorted(items, key=lambda i: (i.last_opened_at or i.added_at or ""), reverse=True)

    def get(self, item_id: str) -> LibraryItem | None:
        return self._items.get(item_id)

    def find_by_remote(self, remote_id: str) -> LibraryItem | None:
        return next((i for i in self._items.values() if i.remote_id == remote_id), None)

    def find_by_sha(self, sha: str) -> LibraryItem | None:
        return next(
            (i for i in self._items.values() if i.kind == KIND_IMPORTED and i.sha256 == sha), None
        )

    def find_story(self, story_title_id: str) -> LibraryItem | None:
        return next(
            (
                i
                for i in self._items.values()
                if i.kind == KIND_CROWDLY and i.story_title_id == story_title_id
            ),
            None,
        )

    def cover_path(self, item: LibraryItem) -> Path | None:
        if not item.cover_file:
            return None
        path = self.files_dir / item.cover_file
        return path if path.is_file() else None

    def file_path(self, item: LibraryItem) -> Path | None:
        if not item.file_name:
            return None
        path = self.files_dir / item.file_name
        return path if path.is_file() else None

    # -- changes -----------------------------------------------------------

    def add_file(self, source: Path, *, remote_id: str | None = None) -> LibraryItem:
        """Copy *source* into the library and return its item.

        Raises ``LibraryImportError`` for unsupported or DRM-protected files.
        Importing the same file twice returns the existing item.
        """

        if not source.is_file():
            raise LibraryImportError(f"File not found: {source}")
        if source.suffix.lower() not in SUPPORTED_SUFFIXES:
            raise LibraryImportError(f"Unsupported file type: {source.suffix or source.name}")
        reason = drm_reason(source)
        if reason:
            raise LibraryImportError(
                f"This file is protected by DRM ({reason}), so Crowdly can't import it."
            )

        sha = file_sha256(source)
        existing = self.find_by_sha(sha)
        if existing is not None:
            if remote_id and not existing.remote_id:
                existing.remote_id = remote_id
                existing.uploaded = True
                self.save()
            return existing

        meta = read_metadata(source)
        item_id = str(uuid.uuid4())
        file_name = item_id + source.suffix.lower()
        self.files_dir.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source, self.files_dir / file_name)

        item = LibraryItem(
            id=item_id,
            kind=KIND_IMPORTED,
            title=meta.title,
            author=meta.author,
            language=meta.language,
            format=meta.format,
            file_name=file_name,
            sha256=sha,
            size=source.stat().st_size,
            added_at=now_iso(),
            remote_id=remote_id,
            uploaded=bool(remote_id),
        )
        self._items[item.id] = item
        self.save()
        return item

    def ensure_story(self, story_title_id: str, title: str) -> LibraryItem:
        """Return (creating if needed) the item tracking a Crowdly story."""

        item = self.find_story(story_title_id)
        if item is None:
            item = LibraryItem(
                id=str(uuid.uuid4()),
                kind=KIND_CROWDLY,
                title=title,
                format="text",
                story_title_id=story_title_id,
                added_at=now_iso(),
            )
            self._items[item.id] = item
        elif title and item.title != title:
            item.title = title
        self.save()
        return item

    def remove(self, item_id: str) -> None:
        """Delete the item and its file; its account copy goes on the next sync."""

        item = self._items.pop(item_id, None)
        if item is None:
            return
        if item.remote_id and item.remote_id not in self.pending_remote_deletes:
            self.pending_remote_deletes.append(item.remote_id)
        for path in (self.file_path(item), self.cover_path(item)):
            if path is not None:
                try:
                    path.unlink()
                except OSError:
                    pass
        self.save()

    def set_rights(self, item_id: str, status: str) -> None:
        item = self._items.get(item_id)
        if item is None or status not in RIGHTS_STATUSES:
            return
        item.rights_status = status
        item.rights_declared_at = now_iso()
        self.save()

    def mark_opened(self, item_id: str) -> None:
        item = self._items.get(item_id)
        if item is not None:
            item.last_opened_at = now_iso()
            self.save()

    def update_position(self, item_id: str, percent: float, locator: dict, *, narration: dict | None = None) -> None:
        item = self._items.get(item_id)
        if item is None:
            return
        position = dict(item.position or {})
        position["percent"] = max(0.0, min(100.0, float(percent)))
        position["locator"] = locator
        if narration is not None:
            position["narration"] = narration
        position["updated_at"] = now_iso()
        item.position = position
        item.position_synced = False
        self.save()

    def record_session(self, item_id: str, started_at: str, ended_at: str, seconds: int) -> None:
        """Store a finished reading session (dropped when under 10 seconds)."""

        item = self._items.get(item_id)
        if item is None or seconds < MIN_SESSION_SECONDS:
            return
        item.pending_sessions.append(
            {
                "id": str(uuid.uuid4()),
                "started_at": started_at,
                "ended_at": ended_at,
                "seconds": int(seconds),
            }
        )
        item.total_seconds += int(seconds)
        self.save()

    def add_highlight(self, item_id: str, *, start: int, end: int, quote: str, color: str = "yellow", note: str = "") -> dict | None:
        item = self._items.get(item_id)
        if item is None:
            return None
        highlight = {
            "id": str(uuid.uuid4()),
            "version": 0,
            "color": color,
            "note": note,
            "quote": quote,
            "start": int(start),
            "end": int(end),
            "deleted": False,
            "updated_at": now_iso(),
            "dirty": True,
        }
        item.highlights.append(highlight)
        self.save()
        return highlight

    def update_highlight(self, item_id: str, highlight_id: str, **changes) -> None:
        item = self._items.get(item_id)
        if item is None:
            return
        for h in item.highlights:
            if h.get("id") == highlight_id:
                h.update({k: v for k, v in changes.items() if k in ("note", "color", "start", "end", "quote")})
                h["updated_at"] = now_iso()
                h["dirty"] = True
        self.save()

    def delete_highlight(self, item_id: str, highlight_id: str) -> None:
        """Delete as a tombstone so the deletion reaches every device."""

        self.update_highlight(item_id, highlight_id)
        item = self._items.get(item_id)
        if item is None:
            return
        for h in item.highlights:
            if h.get("id") == highlight_id:
                h["deleted"] = True
        self.save()

    def visible_highlights(self, item_id: str) -> list[dict]:
        item = self._items.get(item_id)
        if item is None:
            return []
        return [h for h in item.highlights if not h.get("deleted")]
