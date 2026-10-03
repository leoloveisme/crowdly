"""Synchronise the local Discovery library with the user's Crowdly account.

Talks to the backend routes in ``backend/src/library.js``. All of them need
the session cookie ``/auth/login`` sets, so the client logs in first.

What travels:

- imported books: metadata, then the file itself (once - deduplicated per
  user by SHA-256). Files are private to the account; the backend never
  serves them to anyone else.
- reading positions: the newer of local / remote wins.
- reading sessions: sent once, each with a client-generated id, so a retry
  never counts twice.
- highlights: version + acknowledgement; deletions travel as tombstones.
"""

from __future__ import annotations

import http.cookiejar
import json
import tempfile
import urllib.error
import urllib.request
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from .store import KIND_CROWDLY, KIND_IMPORTED, LibraryItem, LocalLibrary


class LibrarySyncError(RuntimeError):
    def __init__(self, message: str, *, status: int | None = None) -> None:
        super().__init__(message)
        self.status = status


@dataclass
class SyncReport:
    uploaded: int = 0
    downloaded: int = 0
    positions: int = 0
    sessions: int = 0
    highlights: int = 0
    errors: list[str] = field(default_factory=list)


class LibrarySyncClient:
    """Minimal cookie-authenticated client for ``/library`` and ``/reading``."""

    def __init__(self, base_url: str, credentials: tuple[str, str], *, timeout: float = 30.0) -> None:
        self.base_url = (base_url or "").rstrip("/")
        self.credentials = credentials
        self.timeout = timeout
        self.user_id: str | None = None
        self._jar = http.cookiejar.CookieJar()
        self._opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(self._jar))

    # -- transport -----------------------------------------------------------

    def _request(
        self,
        method: str,
        path: str,
        *,
        payload: Any = None,
        data: bytes | None = None,
        content_type: str | None = None,
        timeout: float | None = None,
    ) -> Any:
        headers = {"User-Agent": "crowdly-desktop/0.1", "Accept": "application/json"}
        body = data
        if payload is not None:
            body = json.dumps(payload).encode("utf-8")
            headers["Content-Type"] = "application/json"
        elif content_type:
            headers["Content-Type"] = content_type
        req = urllib.request.Request(self.base_url + path, data=body, headers=headers, method=method)
        try:
            with self._opener.open(req, timeout=timeout or self.timeout) as resp:
                raw = resp.read()
                if not raw:
                    return None
                ctype = (resp.headers.get_content_type() or "").lower()
                if "json" in ctype:
                    return json.loads(raw.decode(resp.headers.get_content_charset() or "utf-8"))
                return raw
        except urllib.error.HTTPError as exc:
            message = f"HTTP {exc.code}"
            try:
                detail = json.loads(exc.read().decode("utf-8"))
                if isinstance(detail, dict) and detail.get("error"):
                    message = str(detail["error"])
            except Exception:
                pass
            raise LibrarySyncError(message, status=exc.code) from exc
        except urllib.error.URLError as exc:
            raise LibrarySyncError(f"Network error: {exc.reason}") from exc

    def login(self) -> str:
        email, password = self.credentials
        data = self._request("POST", "/auth/login", payload={"email": email, "password": password})
        if not isinstance(data, dict) or not isinstance(data.get("id"), str):
            raise LibrarySyncError("Unexpected login response.")
        self.user_id = data["id"]
        return self.user_id

    # -- library -------------------------------------------------------------

    def list_items(self) -> list[dict]:
        data = self._request("GET", "/library/items")
        return list(data.get("items") or []) if isinstance(data, dict) else []

    def create_item(self, item: LibraryItem) -> dict:
        payload = {
            "kind": item.kind,
            "storyTitleId": item.story_title_id,
            "title": item.title,
            "author": item.author,
            "language": item.language,
            "format": item.format,
            "sha256": item.sha256 or None,
            "size": item.size or None,
            "rightsStatus": item.rights_status,
        }
        data = self._request("POST", "/library/items", payload=payload)
        return data.get("item") if isinstance(data, dict) else {}

    def upload_file(self, remote_id: str, path: Path) -> dict:
        data = self._request(
            "PUT",
            f"/library/items/{remote_id}/file",
            data=path.read_bytes(),
            content_type="application/octet-stream",
            timeout=600,
        )
        return data.get("item") if isinstance(data, dict) else {}

    def download_file(self, remote_id: str) -> bytes:
        data = self._request("GET", f"/library/items/{remote_id}/file", timeout=600)
        if not isinstance(data, (bytes, bytearray)):
            raise LibrarySyncError("Unexpected file response.")
        return bytes(data)

    def upload_cover(self, remote_id: str, path: Path) -> dict:
        data = self._request(
            "PUT", f"/library/items/{remote_id}/cover", data=path.read_bytes(), content_type="application/octet-stream"
        )
        return data.get("item") if isinstance(data, dict) else {}

    def download_cover(self, remote_id: str) -> bytes:
        data = self._request("GET", f"/library/items/{remote_id}/cover")
        if not isinstance(data, (bytes, bytearray)):
            raise LibrarySyncError("Unexpected cover response.")
        return bytes(data)

    def discover_home(self) -> list[dict]:
        """Browse Crowdly rows: [{"key": "newest", "items": [...]}, ...]."""

        data = self._request("GET", "/discover/home")
        return list(data.get("rows") or []) if isinstance(data, dict) else []

    def set_rights(self, remote_id: str, status: str) -> dict:
        data = self._request("PATCH", f"/library/items/{remote_id}", payload={"rightsStatus": status})
        return data.get("item") if isinstance(data, dict) else {}

    def delete_item(self, remote_id: str) -> None:
        self._request("DELETE", f"/library/items/{remote_id}")

    def convert_to_story(self, remote_id: str, story_title_id: str) -> dict:
        data = self._request(
            "POST", f"/library/items/{remote_id}/convert", payload={"storyTitleId": story_title_id}
        )
        return data if isinstance(data, dict) else {}

    # -- reading data --------------------------------------------------------

    def get_position(self, remote_id: str) -> dict | None:
        data = self._request("GET", f"/reading/positions/{remote_id}")
        return data.get("position") if isinstance(data, dict) else None

    def put_position(self, remote_id: str, position: dict) -> dict | None:
        payload = {
            "percent": position.get("percent", 0),
            "locator": position.get("locator") or {},
            "narration": position.get("narration"),
            "updatedAt": position.get("updated_at"),
        }
        data = self._request("PUT", f"/reading/positions/{remote_id}", payload=payload)
        return data.get("position") if isinstance(data, dict) else None

    def post_sessions(self, sessions: list[dict]) -> int:
        data = self._request("POST", "/reading/sessions", payload={"sessions": sessions})
        return int(data.get("accepted", 0)) if isinstance(data, dict) else 0

    def sync_highlights(self, remote_id: str, device_id: str, since: int, changes: list[dict]) -> dict:
        payload = {
            "deviceId": device_id,
            "libraryItemId": remote_id,
            "since": since,
            "changes": changes,
        }
        data = self._request("POST", "/reading/highlights/sync", payload=payload)
        return data if isinstance(data, dict) else {}

    # -- shelves (backend/src/shelves.js) --------------------------------------

    def list_shelves(self) -> dict:
        data = self._request("GET", "/shelves")
        return data if isinstance(data, dict) else {"system": [], "custom": []}

    def create_shelf(self, name: str, *, kind: str = "manual", rules: dict | None = None, sort: str | None = None) -> dict:
        payload: dict[str, Any] = {"name": name, "kind": kind}
        if rules is not None:
            payload["rules"] = rules
        if sort:
            payload["sort"] = sort
        data = self._request("POST", "/shelves", payload=payload)
        return data.get("shelf") if isinstance(data, dict) else {}

    def update_shelf(self, shelf_id: str, **changes: Any) -> dict:
        data = self._request("PATCH", f"/shelves/{shelf_id}", payload=changes)
        return data.get("shelf") if isinstance(data, dict) else {}

    def delete_shelf(self, shelf_id: str) -> None:
        self._request("DELETE", f"/shelves/{shelf_id}")

    def reorder_shelves(self, ids: list[str]) -> None:
        self._request("PUT", "/shelves/order", payload={"ids": ids})

    def shelf_items(self, key: str) -> dict:
        data = self._request("GET", f"/shelves/{key}/items")
        return data if isinstance(data, dict) else {"items": []}

    def add_to_shelf(self, shelf_id: str, item_type: str, item_id: str) -> str | None:
        """Put an item on a manual shelf; returns the shelf entry id."""

        data = self._request("POST", f"/shelves/{shelf_id}/items", payload={"type": item_type, "id": item_id})
        return data.get("entry_id") if isinstance(data, dict) else None

    def remove_from_shelf(self, shelf_id: str, item_id: str, item_type: str | None = None) -> None:
        """Remove by shelf entry id, or by item id when *item_type* is given."""

        suffix = f"?type={item_type}" if item_type else ""
        self._request("DELETE", f"/shelves/{shelf_id}/items/{item_id}{suffix}")

    def reorder_shelf_items(self, shelf_id: str, entry_ids: list[str]) -> None:
        self._request("PUT", f"/shelves/{shelf_id}/items/order", payload={"ids": entry_ids})

    def membership(self, item_type: str, item_id: str) -> dict:
        data = self._request("GET", f"/shelves/membership?type={item_type}&id={item_id}")
        return data if isinstance(data, dict) else {"shelves": [], "status": {}}

    def set_story_status(self, content_type: str, content_id: str, **flags: bool) -> dict:
        payload: dict[str, Any] = {"contentType": content_type}
        payload["storyTitleId" if content_type == "story" else "screenplayId"] = content_id
        names = {"favorite": "isFavorite", "living": "isLiving", "lived": "isLived"}
        for key, value in flags.items():
            payload[names[key]] = bool(value)
        data = self._request("PUT", "/me/story-status", payload=payload)
        return data if isinstance(data, dict) else {}


def _remote_position_newer(remote: dict | None, local: dict) -> bool:
    if not remote:
        return False
    remote_ts = str(remote.get("updated_at") or "")
    local_ts = str(local.get("updated_at") or "")
    return remote_ts > local_ts


def sync_library(library: LocalLibrary, client: LibrarySyncClient, device_id: str) -> SyncReport:
    """Run one full two-way sync of *library*. Never raises for one item."""

    report = SyncReport()
    if client.user_id is None:
        client.login()

    # Removals made while sync was off.
    for remote_id in list(library.pending_remote_deletes):
        try:
            client.delete_item(remote_id)
            library.pending_remote_deletes.remove(remote_id)
        except LibrarySyncError as exc:
            if exc.status == 404:
                library.pending_remote_deletes.remove(remote_id)
            else:
                report.errors.append(str(exc))
    library.save()

    remote_items = client.list_items()
    remote_by_id = {r.get("id"): r for r in remote_items if isinstance(r, dict)}

    # 1. Push local items the account doesn't have yet (and missing files).
    for item in library.items():
        try:
            if not item.remote_id:
                created = client.create_item(item)
                if created.get("id"):
                    item.remote_id = created["id"]
                    remote_by_id[item.remote_id] = created
                    item.uploaded = bool(created.get("has_file"))
            remote = remote_by_id.get(item.remote_id or "")
            if item.kind == KIND_IMPORTED and item.remote_id and not (remote or {}).get("has_file"):
                path = library.file_path(item)
                if path is not None:
                    client.upload_file(item.remote_id, path)
                    item.uploaded = True
                    report.uploaded += 1
            elif remote and remote.get("has_file"):
                item.uploaded = True
            if item.kind == KIND_IMPORTED and item.remote_id:
                _sync_cover(library, item, remote or {}, client)
            # Rights: the newer declaration wins.
            if remote:
                remote_ts = str(remote.get("rights_declared_at") or "")
                local_ts = str(item.rights_declared_at or "")
                if local_ts > remote_ts:
                    client.set_rights(item.remote_id, item.rights_status)
                elif remote_ts > local_ts:
                    item.rights_status = remote.get("rights_status") or item.rights_status
                    item.rights_declared_at = remote_ts
        except LibrarySyncError as exc:
            report.errors.append(f"{item.title}: {exc}")
        except OSError as exc:
            report.errors.append(f"{item.title}: {exc}")
    library.save()

    # 2. Pull items added on other devices.
    for remote_id, remote in remote_by_id.items():
        if not remote_id or library.find_by_remote(remote_id) is not None:
            continue
        if remote_id in library.pending_remote_deletes:
            continue
        try:
            if remote.get("kind") == KIND_CROWDLY and remote.get("story_title_id"):
                item = library.ensure_story(remote["story_title_id"], remote.get("title") or "")
                item.remote_id = remote_id
            elif remote.get("kind") == KIND_IMPORTED and remote.get("has_file"):
                existing = library.find_by_sha(remote.get("file_sha256") or "")
                if existing is not None:
                    existing.remote_id = remote_id
                    existing.uploaded = True
                    continue
                payload = client.download_file(remote_id)
                suffix = {"epub": ".epub", "pdf": ".pdf", "audio": ".mp3"}.get(remote.get("format"), ".txt")
                with tempfile.TemporaryDirectory() as tmp:
                    tmp_path = Path(tmp) / f"book{suffix}"
                    tmp_path.write_bytes(payload)
                    item = library.add_file(tmp_path, remote_id=remote_id)
                item.title = remote.get("title") or item.title
                item.author = remote.get("author") or item.author
                item.rights_status = remote.get("rights_status") or item.rights_status
                item.rights_declared_at = remote.get("rights_declared_at")
                _sync_cover(library, item, remote, client)
                report.downloaded += 1
        except Exception as exc:  # one bad item must not stop the sync
            report.errors.append(f"{remote.get('title') or remote_id}: {exc}")
    library.save()

    # 3. Reading positions, sessions and highlights.
    sessions: list[dict] = []
    for item in library.items():
        if not item.remote_id:
            continue
        try:
            if not item.position_synced and item.position:
                winner = client.put_position(item.remote_id, item.position)
                if winner and _remote_position_newer(winner, item.position):
                    item.position = _position_from_remote(winner)
                item.position_synced = True
                report.positions += 1
            else:
                remote_pos = client.get_position(item.remote_id)
                if remote_pos and _remote_position_newer(remote_pos, item.position or {}):
                    item.position = _position_from_remote(remote_pos)
                    report.positions += 1
        except LibrarySyncError as exc:
            report.errors.append(f"{item.title}: {exc}")

        for s in item.pending_sessions:
            sessions.append(
                {
                    "id": s["id"],
                    "libraryItemId": item.remote_id,
                    "startedAt": s["started_at"],
                    "endedAt": s["ended_at"],
                    "seconds": s["seconds"],
                }
            )

        try:
            report.highlights += _sync_item_highlights(item, client, device_id)
        except LibrarySyncError as exc:
            report.errors.append(f"{item.title}: {exc}")

    if sessions:
        try:
            client.post_sessions(sessions)
            report.sessions = len(sessions)
            sent = {s["id"] for s in sessions}
            for item in library.items():
                item.pending_sessions = [s for s in item.pending_sessions if s["id"] not in sent]
        except LibrarySyncError as exc:
            report.errors.append(str(exc))

    library.save()
    return report


def _sync_cover(library: LocalLibrary, item: LibraryItem, remote: dict, client: LibrarySyncClient) -> None:
    """Upload this device's cover thumbnail, or fetch the account's one."""

    try:
        from .covers import store_cover_bytes

        cover = library.cover_path(item)
        if cover is not None and not item.cover_uploaded:
            client.upload_cover(item.remote_id, cover)
            item.cover_uploaded = True
        elif cover is None and remote.get("has_cover"):
            store_cover_bytes(library, item, client.download_cover(item.remote_id))
    except (LibrarySyncError, OSError, ImportError):
        pass  # a missing cover never fails a sync


def _position_from_remote(remote: dict) -> dict:
    return {
        "percent": float(remote.get("percent") or 0),
        "locator": remote.get("locator") or {},
        "narration": remote.get("narration"),
        "updated_at": remote.get("updated_at"),
    }


def _sync_item_highlights(item: LibraryItem, client: LibrarySyncClient, device_id: str) -> int:
    changes = [
        {
            "id": h["id"],
            "color": h.get("color", "yellow"),
            "note": h.get("note", ""),
            "quote": h.get("quote", ""),
            "locator": {"start": h.get("start", 0), "end": h.get("end", 0)},
            "deleted": bool(h.get("deleted")),
            "updatedAt": h.get("updated_at"),
        }
        for h in item.highlights
        if h.get("dirty")
    ]
    result = client.sync_highlights(item.remote_id, device_id, item.highlights_ack, changes)
    by_id = {h["id"]: h for h in item.highlights}
    incoming = result.get("highlights") or []
    for remote in incoming:
        hid = remote.get("id")
        if not hid:
            continue
        locator = remote.get("locator") or {}
        local = by_id.get(hid)
        merged = {
            "id": hid,
            "version": int(remote.get("version") or 0),
            "color": remote.get("color") or "yellow",
            "note": remote.get("note") or "",
            "quote": remote.get("quote") or "",
            "start": int(locator.get("start") or 0),
            "end": int(locator.get("end") or 0),
            "deleted": bool(remote.get("deleted")),
            "updated_at": remote.get("updated_at"),
            "dirty": False,
        }
        if local is None:
            item.highlights.append(merged)
            by_id[hid] = merged
        else:
            local.update(merged)
    for h in item.highlights:
        if h["id"] in {c["id"] for c in changes}:
            h["dirty"] = False
    # Tombstones the server has acknowledged are no longer needed locally.
    item.highlights = [h for h in item.highlights if not (h.get("deleted") and not h.get("dirty"))]
    item.highlights_ack = int(result.get("ack") or item.highlights_ack)
    return len(incoming)
