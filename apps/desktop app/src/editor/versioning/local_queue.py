"""Local update queue stored under a `.crowdly` directory.

For each document on disk we maintain an append-only JSONL file that stores
pending CRDT-style updates. For v1, each update encodes a *full snapshot*
(body_md + body_html) as a base64-encoded JSON payload so we can evolve
this into a real CRDT engine later without losing data.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
import base64
import json
from typing import List


@dataclass
class PendingUpdate:
    """Single queued update ready to be sent to the web platform.

    Fields mirror the planned API payload shape closely so that the same
    data can be POSTed later without migrations.
    """

    device_id: str
    device_seq: int
    update_b64: str


class UpdateQueue:
    """Append-only JSONL queue backed by a file on disk."""

    def __init__(self, path: Path) -> None:
        self.path = path

    def append(self, item: PendingUpdate) -> None:
        """Append *item* to the queue, creating parent dirs as needed."""

        self.path.parent.mkdir(parents=True, exist_ok=True)
        with self.path.open("a", encoding="utf-8") as f:
            f.write(json.dumps(item.__dict__, ensure_ascii=False) + "\n")

    def read_all(self) -> List[PendingUpdate]:
        """Return all queued updates, oldest first."""

        if not self.path.exists():
            return []

        items: List[PendingUpdate] = []
        text = self.path.read_text(encoding="utf-8")
        for line in text.splitlines():
            if not line.strip():
                continue
            data = json.loads(line)
            items.append(PendingUpdate(**data))
        return items

    def truncate(self) -> None:
        """Truncate the queue file (used after successful flush)."""

        if self.path.exists():
            self.path.write_text("", encoding="utf-8")


def ensure_crowdly_dir_for_document(document_path: Path) -> Path:
    """Ensure and return the `.crowdly` directory for *document_path*.

    The directory lives next to the document, e.g. for
    `/path/to/story.md` it will be `/path/to/.crowdly/`.
    """

    base_dir = document_path.parent
    crowdly_dir = base_dir / ".crowdly"
    crowdly_dir.mkdir(parents=True, exist_ok=True)
    return crowdly_dir


def _queue_path_for(document_path: Path) -> Path:
    """Return the JSONL queue path for *document_path* inside `.crowdly`."""

    crowdly_dir = ensure_crowdly_dir_for_document(document_path)
    return crowdly_dir / f"{document_path.name}.updates.jsonl"


def _seq_file_for(document_path: Path) -> Path:
    """Return the sequence counter file path for *document_path*."""

    crowdly_dir = ensure_crowdly_dir_for_document(document_path)
    return crowdly_dir / f"{document_path.name}.seq"


def _next_device_seq(document_path: Path) -> int:
    """Return the next monotonic device sequence number for this document.

    For now we keep a simple per-document counter persisted in a side file
    next to the queue. This is sufficient for idempotency once combined
    with the (story_id, device_id) tuple on the server.
    """

    seq_path = _seq_file_for(document_path)
    current = 0
    try:
        if seq_path.exists():
            raw = seq_path.read_text(encoding="utf-8").strip()
            if raw:
                current = int(raw)
    except Exception:
        # On any parse error we fall back to 0 and start a new sequence.
        current = 0

    next_seq = current + 1
    try:
        seq_path.write_text(str(next_seq), encoding="utf-8")
    except Exception:
        # Never crash the editor because versioning metadata cannot be written.
        pass
    return next_seq


def enqueue_full_snapshot_update(
    document_path: Path,
    *,
    device_id: str,
    body_md: str,
    body_html: str | None,
) -> None:
    """Append a full-snapshot update for *document_path* to its queue.

    The payload stores both Markdown and HTML so the backend can materialise
    story snapshots and construct CRDT updates/revisions later on.
    """

    try:
        if not isinstance(document_path, Path):
            return

        queue_path = _queue_path_for(document_path)
        device_seq = _next_device_seq(document_path)

        snapshot = {
            "version": 1,
            "saved_at": datetime.now(timezone.utc).isoformat(),
            "body_md": body_md,
            "body_html": body_html,
        }
        raw = json.dumps(snapshot, ensure_ascii=False).encode("utf-8")
        update_b64 = base64.b64encode(raw).decode("ascii")

        queue = UpdateQueue(queue_path)
        queue.append(PendingUpdate(device_id=device_id, device_seq=device_seq, update_b64=update_b64))
    except Exception:
        # Versioning must never break core editing; failures here are logged
        # during development via stderr/tracebacks if the app is run in a
        # terminal, but are otherwise silent.
        return


def load_full_snapshots(document_path: Path) -> List[dict]:
    """Return decoded full-snapshot payloads for *document_path*.

    Each returned dict contains at least ``body_md``, ``body_html``,
    ``saved_at``, ``device_id`` and ``device_seq`` keys when available.
    Snapshots are ordered from oldest to newest based on the queue order.
    """

    try:
        if not isinstance(document_path, Path):
            return []

        queue_path = _queue_path_for(document_path)
        queue = UpdateQueue(queue_path)
        updates = queue.read_all()
    except Exception:
        return []

    snapshots: List[dict] = []
    for upd in updates:
        try:
            raw = base64.b64decode(upd.update_b64.encode("ascii"))
            payload = json.loads(raw.decode("utf-8"))
            if not isinstance(payload, dict):
                continue
            # Attach device metadata so callers can use it if desired.
            payload.setdefault("device_id", upd.device_id)
            payload.setdefault("device_seq", upd.device_seq)
            snapshots.append(payload)
        except Exception:
            # Skip malformed entries without aborting the whole read.
            continue

    return snapshots
