"""Minimal Google Drive v3 REST client (stdlib ``urllib`` only).

Mirrors the calls the backend connector makes (backend/src/googleDriveApp.js)
so both sides treat a Drive folder tree the same way.
"""

from __future__ import annotations

import json
import mimetypes
import uuid
from dataclasses import dataclass
from typing import Callable
from urllib.error import HTTPError
from urllib.parse import quote, urlencode
from urllib.request import Request, urlopen

FILES_URL = "https://www.googleapis.com/drive/v3/files"
UPLOAD_URL = "https://www.googleapis.com/upload/drive/v3/files"
FOLDER_MIME = "application/vnd.google-apps.folder"


class DriveError(RuntimeError):
    def __init__(self, message: str, status: int | None = None) -> None:
        super().__init__(message)
        self.status = status


@dataclass
class DriveFolder:
    id: str
    name: str


@dataclass
class DriveFile:
    id: str
    name: str
    path: str  # relative to the synced root, "/"-separated
    parent_id: str
    md5: str | None


@dataclass
class DriveTree:
    folders: dict[str, str]  # relative path -> folder id ("" = root)
    files: list[DriveFile]


def _q_literal(value: str) -> str:
    return value.replace("\\", "\\\\").replace("'", "\\'")


def guess_mime(name: str) -> str:
    return mimetypes.guess_type(name)[0] or "application/octet-stream"


class DriveClient:
    def __init__(self, token_provider: Callable[[], str]) -> None:
        self._token = token_provider

    def _request(
        self,
        url: str,
        method: str = "GET",
        body: bytes | None = None,
        content_type: str | None = None,
        raw: bool = False,
    ):
        headers = {"Authorization": f"Bearer {self._token()}"}
        if content_type:
            headers["Content-Type"] = content_type
        req = Request(url, data=body, headers=headers, method=method)
        try:
            with urlopen(req, timeout=60) as resp:
                data = resp.read()
        except HTTPError as exc:
            detail = exc.read().decode("utf-8", "replace")[:500]
            raise DriveError(f"Google Drive request failed (HTTP {exc.code}): {detail}", exc.code) from exc
        except OSError as exc:
            raise DriveError(f"Could not reach Google Drive: {exc}") from exc
        if raw:
            return data
        return json.loads(data.decode("utf-8")) if data else {}

    def _list_all(self, q: str, fields: str) -> list[dict]:
        items: list[dict] = []
        page_token = None
        while True:
            params = {"q": q, "fields": f"nextPageToken,files({fields})", "pageSize": "1000"}
            if page_token:
                params["pageToken"] = page_token
            data = self._request(f"{FILES_URL}?{urlencode(params)}")
            items.extend(data.get("files", []))
            page_token = data.get("nextPageToken")
            if not page_token:
                return items

    # --- folders -------------------------------------------------------------

    def list_child_folders(self, parent_id: str = "root") -> list[DriveFolder]:
        rows = self._list_all(
            f"'{_q_literal(parent_id)}' in parents and trashed=false and mimeType='{FOLDER_MIME}'",
            "id,name",
        )
        return sorted((DriveFolder(r["id"], r["name"]) for r in rows), key=lambda f: f.name.lower())

    def create_folder(self, name: str, parent_id: str = "root") -> DriveFolder:
        data = self._request(
            f"{FILES_URL}?fields=id,name",
            method="POST",
            body=json.dumps({"name": name, "mimeType": FOLDER_MIME, "parents": [parent_id]}).encode("utf-8"),
            content_type="application/json",
        )
        return DriveFolder(data["id"], data["name"])

    def get_meta(self, file_id: str) -> dict | None:
        try:
            return self._request(f"{FILES_URL}/{quote(file_id)}?fields=id,name,mimeType,trashed,md5Checksum,parents")
        except DriveError as exc:
            if exc.status == 404:
                return None
            raise

    def list_tree(self, root_id: str) -> DriveTree:
        """Breadth-first walk of everything under *root_id*. Google-native Docs/Sheets (no downloadable bytes) are skipped."""

        folders: dict[str, str] = {"": root_id}
        files: list[DriveFile] = []
        queue: list[tuple[str, str]] = [(root_id, "")]
        while queue:
            folder_id, folder_path = queue.pop(0)
            for row in self._list_all(f"'{_q_literal(folder_id)}' in parents and trashed=false", "id,name,mimeType,md5Checksum"):
                child_path = f"{folder_path}/{row['name']}" if folder_path else row["name"]
                mime = row.get("mimeType", "")
                if mime == FOLDER_MIME:
                    folders[child_path] = row["id"]
                    queue.append((row["id"], child_path))
                elif not mime.startswith("application/vnd.google-apps."):
                    files.append(DriveFile(row["id"], row["name"], child_path, folder_id, row.get("md5Checksum")))
        return DriveTree(folders, files)

    # --- file content --------------------------------------------------------

    def download(self, file_id: str) -> bytes:
        return self._request(f"{FILES_URL}/{quote(file_id)}?alt=media", raw=True)

    def upload(self, content: bytes, *, name: str, parent_id: str | None = None, file_id: str | None = None) -> tuple[str, str | None]:
        """Create (no *file_id*) or overwrite a file. Returns ``(file_id, md5)``."""

        mime = guess_mime(name)
        if file_id:
            data = self._request(
                f"{UPLOAD_URL}/{quote(file_id)}?uploadType=media&fields=id,md5Checksum",
                method="PATCH",
                body=content,
                content_type=mime,
            )
            return data["id"], data.get("md5Checksum")

        boundary = f"crowdly-{uuid.uuid4().hex}"
        metadata = json.dumps({"name": name, "parents": [parent_id] if parent_id else []})
        body = (
            f"--{boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n{metadata}\r\n"
            f"--{boundary}\r\nContent-Type: {mime}\r\n\r\n"
        ).encode("utf-8") + content + f"\r\n--{boundary}--".encode("utf-8")
        data = self._request(
            f"{UPLOAD_URL}?uploadType=multipart&fields=id,md5Checksum",
            method="POST",
            body=body,
            content_type=f"multipart/related; boundary={boundary}",
        )
        return data["id"], data.get("md5Checksum")

    def move(self, file_id: str, *, name: str, from_parent: str, to_parent: str) -> None:
        params = {"fields": "id"}
        if from_parent != to_parent:
            params["addParents"] = to_parent
            params["removeParents"] = from_parent
        self._request(
            f"{FILES_URL}/{quote(file_id)}?{urlencode(params)}",
            method="PATCH",
            body=json.dumps({"name": name}).encode("utf-8"),
            content_type="application/json",
        )

    def trash(self, file_id: str) -> None:
        try:
            self._request(
                f"{FILES_URL}/{quote(file_id)}?fields=id",
                method="PATCH",
                body=json.dumps({"trashed": True}).encode("utf-8"),
                content_type="application/json",
            )
        except DriveError as exc:
            if exc.status != 404:
                raise
