"""Local update queue stored under a `.crowdly` directory.

For each document on disk we maintain an append-only JSONL file that stores
pending CRDT-style updates.

Version 1 entries store a full snapshot (body_md + body_html).
Version 2 entries store either a full snapshot (keyframe) or a unified diff
against the previous entry, saving disk space on frequent autosaves.
"""

from __future__ import annotations

import difflib
import re
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
import base64
import json
from typing import List

# Write a full snapshot every N entries to bound reconstruction cost.
_KEYFRAME_EVERY = 50


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


# ---------------------------------------------------------------------------
# Diff helpers (v2 storage)
# ---------------------------------------------------------------------------

def _make_unified_diff(old: str, new: str) -> str:
    """Return a unified diff string between *old* and *new*."""
    old_lines = old.splitlines(keepends=True)
    new_lines = new.splitlines(keepends=True)
    return "".join(difflib.unified_diff(old_lines, new_lines, n=0))


def _apply_unified_diff(base: str, diff_text: str) -> str:
    """Apply a unified diff to *base* and return the resulting text.

    Parses ``@@`` hunk headers and applies additions/deletions line-by-line.
    """
    if not diff_text:
        return base

    base_lines = base.splitlines(keepends=True)
    result_lines: list[str] = []
    hunk_re = re.compile(r"^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@")

    hunks: list[tuple[int, int, list[str], list[str]]] = []
    cur_old_start = 0
    cur_old_count = 0
    cur_removes: list[str] = []
    cur_adds: list[str] = []
    in_hunk = False

    for line in diff_text.splitlines(keepends=True):
        m = hunk_re.match(line)
        if m:
            if in_hunk:
                hunks.append((cur_old_start, cur_old_count, cur_removes, cur_adds))
            cur_old_start = int(m.group(1))
            cur_old_count = int(m.group(2)) if m.group(2) is not None else 1
            cur_removes = []
            cur_adds = []
            in_hunk = True
        elif in_hunk:
            if line.startswith("-"):
                cur_removes.append(line[1:])
            elif line.startswith("+"):
                cur_adds.append(line[1:])
            # context lines (starting with space) are ignored since n=0

    if in_hunk:
        hunks.append((cur_old_start, cur_old_count, cur_removes, cur_adds))

    # Apply hunks in order.  `pos` tracks how far through base_lines we've
    # consumed (0-indexed).
    pos = 0
    for old_start_1, old_count, removes, adds in hunks:
        old_start = old_start_1 - 1 if old_start_1 > 0 else 0
        # Copy unchanged lines before this hunk.
        if old_start > pos:
            result_lines.extend(base_lines[pos:old_start])
        # Skip the removed lines.
        pos = old_start + old_count
        # Insert added lines.
        result_lines.extend(adds)

    # Copy any remaining lines after the last hunk.
    if pos < len(base_lines):
        result_lines.extend(base_lines[pos:])

    return "".join(result_lines)


def _reconstruct_all(queue_path: Path) -> list[dict]:
    """Walk all entries in *queue_path* and reconstruct full text for each.

    Handles both v1 (full snapshot) and v2 (snapshot or diff) entries.
    Returns a list of dicts, each containing ``body_md``, ``body_html``,
    ``saved_at``, ``device_id``, and ``device_seq``.
    """
    queue = UpdateQueue(queue_path)
    try:
        updates = queue.read_all()
    except Exception:
        return []

    results: list[dict] = []
    running_md = ""
    running_html: str | None = None

    for upd in updates:
        try:
            raw = base64.b64decode(upd.update_b64.encode("ascii"))
            payload = json.loads(raw.decode("utf-8"))
            if not isinstance(payload, dict):
                continue
        except Exception:
            continue

        version = payload.get("version", 1)
        entry_type = payload.get("entry_type", "snapshot")

        if version == 1 or entry_type == "snapshot":
            # Full snapshot — reset running state.
            running_md = payload.get("body_md", "")
            running_html = payload.get("body_html")
        elif entry_type == "diff":
            # Apply diffs to running state.
            diff_md = payload.get("diff_md", "")
            running_md = _apply_unified_diff(running_md, diff_md)
            diff_html = payload.get("diff_html")
            if diff_html and running_html is not None:
                running_html = _apply_unified_diff(running_html, diff_html)
            elif diff_html:
                # No base HTML yet; skip HTML reconstruction.
                running_html = None
            # If diff_html is None, HTML is unchanged — keep running_html.
        else:
            continue

        result = {
            "body_md": running_md,
            "body_html": running_html,
            "saved_at": payload.get("saved_at"),
            "device_id": upd.device_id,
            "device_seq": upd.device_seq,
        }
        results.append(result)

    return results


def _read_last_reconstructed_state(queue_path: Path) -> dict | None:
    """Return the last reconstructed state from *queue_path*, or ``None``."""
    all_states = _reconstruct_all(queue_path)
    return all_states[-1] if all_states else None


def _count_entries(queue_path: Path) -> int:
    """Return the number of entries in the queue file."""
    if not queue_path.exists():
        return 0
    try:
        text = queue_path.read_text(encoding="utf-8")
        return sum(1 for line in text.splitlines() if line.strip())
    except Exception:
        return 0


def _enqueue_entry(
    queue_path: Path,
    device_id: str,
    device_seq: int,
    body_md: str,
    body_html: str | None,
) -> None:
    """Decide whether to write a snapshot or diff, then append the entry."""
    entry_count = _count_entries(queue_path)
    is_keyframe = (entry_count == 0) or (entry_count % _KEYFRAME_EVERY == 0)

    if is_keyframe:
        payload = {
            "version": 2,
            "entry_type": "snapshot",
            "saved_at": datetime.now(timezone.utc).isoformat(),
            "body_md": body_md,
            "body_html": body_html,
        }
    else:
        prev = _read_last_reconstructed_state(queue_path)
        if prev is None:
            # No previous state — write a full snapshot as safety fallback.
            payload = {
                "version": 2,
                "entry_type": "snapshot",
                "saved_at": datetime.now(timezone.utc).isoformat(),
                "body_md": body_md,
                "body_html": body_html,
            }
        else:
            diff_md = _make_unified_diff(prev.get("body_md", ""), body_md)
            diff_html = None
            if body_html is not None and prev.get("body_html") is not None:
                diff_html = _make_unified_diff(prev["body_html"], body_html)
            payload = {
                "version": 2,
                "entry_type": "diff",
                "saved_at": datetime.now(timezone.utc).isoformat(),
                "diff_md": diff_md,
                "diff_html": diff_html,
            }

    raw = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    update_b64 = base64.b64encode(raw).decode("ascii")

    queue = UpdateQueue(queue_path)
    queue.append(PendingUpdate(device_id=device_id, device_seq=device_seq, update_b64=update_b64))


# ---------------------------------------------------------------------------
# Public API (signatures unchanged)
# ---------------------------------------------------------------------------

def enqueue_full_snapshot_update(
    document_path: Path,
    *,
    device_id: str,
    body_md: str,
    body_html: str | None,
) -> None:
    """Append a versioning update for *document_path* to its queue.

    Uses diff-based storage (v2) internally — writes only a unified diff
    against the previous entry unless a keyframe is due.
    """

    try:
        if not isinstance(document_path, Path):
            return

        queue_path = _queue_path_for(document_path)
        device_seq = _next_device_seq(document_path)
        _enqueue_entry(queue_path, device_id, device_seq, body_md, body_html)
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

    Handles both v1 (full snapshot) and v2 (snapshot + diff) entries
    transparently.
    """

    try:
        if not isinstance(document_path, Path):
            return []

        queue_path = _queue_path_for(document_path)
        return _reconstruct_all(queue_path)
    except Exception:
        return []
