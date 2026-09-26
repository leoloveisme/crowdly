"""Two-way sync between a local project-space folder tree and a Drive folder tree.

State per local Space lives in ``~/.config/crowdly_editor/gdrive/<sha1(root)>/``:

* ``index.json`` — for every file synced so far: its Drive file id, the md5 of
  the content both sides last agreed on, and the local mtime/size at that
  point (so unchanged local files needn't be re-hashed on every run); plus the
  Drive ids of synced folders.
* ``base/`` — a copy of that last-agreed content for small text files, used as
  the merge base when both sides changed a file.

Rules (same as the backend connector, backend/src/googleDriveSync.js):

* changed on one side only → copied to the other;
* changed on both sides → three-way merge for text, otherwise (or on
  overlapping edits) the local version wins and Drive's version is saved next
  to it as ``name (conflict from Google Drive YYYY-MM-DD).ext``;
* deleted on one side and untouched on the other → deleted on the other too
  (local files go to the OS trash, Drive files to the Drive trash); deleted on
  one side but edited on the other → the edit wins;
* a file moved/renamed on Drive is moved locally (local moves show up as
  delete + create, which converges to the same result).

Hidden files and folders (``.crowdly/``, ``.DS_Store``, ...) are never synced.
"""

from __future__ import annotations

import datetime as _dt
import hashlib
import json
import os
import tempfile
from dataclasses import dataclass, field
from pathlib import Path
from typing import Callable

from PySide6.QtCore import QFile

from .. import settings as settings_module
from .api import DriveClient, DriveError, DriveFile
from .merge import is_mergeable_text, three_way_merge


@dataclass
class SyncResult:
    pulled: int = 0
    pushed: int = 0
    merged: int = 0
    conflicts: int = 0
    deleted: int = 0
    moved: int = 0
    changed_local_paths: list[Path] = field(default_factory=list)
    log: list[str] = field(default_factory=list)
    errors: list[str] = field(default_factory=list)

    def changed(self) -> bool:
        return any((self.pulled, self.pushed, self.merged, self.conflicts, self.deleted, self.moved))

    def summary(self) -> str:
        return (
            f"{self.pulled} pulled, {self.pushed} pushed, {self.merged} merged, "
            f"{self.conflicts} conflicts, {self.deleted} deleted, {self.moved} moved"
        )


def _md5(data: bytes) -> str:
    return hashlib.md5(data).hexdigest()  # noqa: S324 - matches Drive's md5Checksum, not used for security


def state_dir_for(root: Path) -> Path:
    key = hashlib.sha1(str(root.expanduser().resolve()).encode("utf-8")).hexdigest()  # noqa: S324 - path key only
    return settings_module._get_config_dir().joinpath("gdrive", key)


def forget_space(root: Path) -> None:
    """Drop the sync index/base copies for *root* (after disconnecting it)."""

    state = state_dir_for(root)
    if not state.is_dir():
        return
    for path in sorted(state.rglob("*"), reverse=True):
        try:
            path.unlink() if path.is_file() else path.rmdir()
        except OSError:
            pass
    try:
        state.rmdir()
    except OSError:
        pass


def _is_hidden(rel_path: str) -> bool:
    return any(part.startswith(".") for part in rel_path.split("/"))


def _conflict_name(rel_path: str, taken: Callable[[str], bool]) -> str:
    parent, _, name = rel_path.rpartition("/")
    stem, dot, ext = name.rpartition(".")
    if not stem:
        stem, dot, ext = name, "", ""
    day = _dt.date.today().isoformat()
    n = 1
    while True:
        suffix = "" if n == 1 else f" {n}"
        candidate_name = f"{stem} (conflict from Google Drive {day}{suffix}){dot}{ext}"
        candidate = f"{parent}/{candidate_name}" if parent else candidate_name
        if not taken(candidate):
            return candidate
        n += 1


class SpaceSyncEngine:
    def __init__(self, client: DriveClient, root: Path, folder_id: str) -> None:
        self.client = client
        self.root = root.expanduser().resolve()
        self.folder_id = folder_id
        self.state_dir = state_dir_for(self.root)
        self.index_path = self.state_dir / "index.json"
        self.base_dir = self.state_dir / "base"
        self.result = SyncResult()
        self._folders: dict[str, str] = {}

    # --- index / base copies ---------------------------------------------------

    def _load_index(self) -> dict:
        try:
            data = json.loads(self.index_path.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            data = {}
        if not isinstance(data, dict) or data.get("folder_id") != self.folder_id:
            # First sync, or the Space was re-pointed at another Drive folder:
            # start clean so nothing is mistaken for a delete.
            forget_space(self.root)
            data = {"folder_id": self.folder_id, "files": {}, "folders": {}}
        data.setdefault("files", {})
        data.setdefault("folders", {})
        return data

    def _save_index(self, index: dict) -> None:
        self.state_dir.mkdir(parents=True, exist_ok=True)
        tmp = self.index_path.with_suffix(".tmp")
        tmp.write_text(json.dumps(index, indent=1), encoding="utf-8")
        os.replace(tmp, self.index_path)

    def _base_path(self, rel: str) -> Path:
        return self.base_dir / hashlib.sha1(rel.encode("utf-8")).hexdigest()  # noqa: S324

    def _read_base(self, rel: str) -> bytes | None:
        try:
            return self._base_path(rel).read_bytes()
        except OSError:
            return None

    def _write_base(self, rel: str, content: bytes | None) -> None:
        path = self._base_path(rel)
        if content is not None and is_mergeable_text(content):
            self.base_dir.mkdir(parents=True, exist_ok=True)
            path.write_bytes(content)
        else:
            path.unlink(missing_ok=True)

    # --- local filesystem ------------------------------------------------------

    def _abs(self, rel: str) -> Path:
        return self.root.joinpath(*rel.split("/"))

    def _scan_local(self) -> tuple[dict[str, os.stat_result], set[str]]:
        files: dict[str, os.stat_result] = {}
        dirs: set[str] = set()
        for dirpath, dirnames, filenames in os.walk(self.root):
            dirnames[:] = [d for d in dirnames if not d.startswith(".")]
            rel_dir = Path(dirpath).relative_to(self.root).as_posix()
            rel_dir = "" if rel_dir == "." else rel_dir
            if rel_dir:
                dirs.add(rel_dir)
            for name in filenames:
                if name.startswith("."):
                    continue
                rel = f"{rel_dir}/{name}" if rel_dir else name
                try:
                    files[rel] = os.stat(self._abs(rel))
                except OSError:
                    continue
        return files, dirs

    def _write_local(self, rel: str, content: bytes) -> None:
        target = self._abs(rel)
        target.parent.mkdir(parents=True, exist_ok=True)
        fd, tmp = tempfile.mkstemp(dir=target.parent, prefix=".crowdly-sync-")
        try:
            with os.fdopen(fd, "wb") as fh:
                fh.write(content)
            os.replace(tmp, target)
        except BaseException:
            Path(tmp).unlink(missing_ok=True)
            raise
        self.result.changed_local_paths.append(target)

    def _trash_local(self, rel: str) -> None:
        target = self._abs(rel)
        if not QFile.moveToTrash(str(target)):
            target.unlink(missing_ok=True)
        self.result.changed_local_paths.append(target)

    # --- Drive folders ---------------------------------------------------------

    def _ensure_drive_folder(self, rel_dir: str) -> str:
        if rel_dir in self._folders:
            return self._folders[rel_dir]
        parent, _, name = rel_dir.rpartition("/")
        parent_id = self._ensure_drive_folder(parent)
        existing = next((f for f in self.client.list_child_folders(parent_id) if f.name == name), None)
        folder = existing or self.client.create_folder(name, parent_id)
        self._folders[rel_dir] = folder.id
        return folder.id

    def _upload_new(self, rel: str, content: bytes) -> tuple[str, str | None]:
        parent, _, name = rel.rpartition("/")
        return self.client.upload(content, name=name, parent_id=self._ensure_drive_folder(parent))

    # --- main entry point ------------------------------------------------------

    def run(self) -> SyncResult:
        index = self._load_index()
        tree = self.client.list_tree(self.folder_id)
        self._folders = dict(tree.folders)
        remote_by_path: dict[str, DriveFile] = {f.path: f for f in tree.files if not _is_hidden(f.path)}
        remote_by_id: dict[str, DriveFile] = {f.id: f for f in remote_by_path.values()}
        local_files, _ = self._scan_local()
        files_index: dict[str, dict] = index["files"]

        self._apply_drive_moves(files_index, remote_by_id, local_files)

        for rel in sorted(set(files_index) | set(local_files) | set(remote_by_path)):
            try:
                self._sync_file(rel, files_index, local_files, remote_by_path)
            except DriveError as exc:
                if exc.status in (401, 403):
                    self._save_index(index)
                    raise  # auth/permission problem — every other file would fail the same way
                self.result.errors.append(f"{rel}: {exc}")
            except Exception as exc:  # keep going; one bad file mustn't stop the rest
                self.result.errors.append(f"{rel}: {exc}")

        self._sync_folders(index, tree.folders, remote_by_path)
        self._save_index(index)
        return self.result

    def _apply_drive_moves(self, files_index: dict, remote_by_id: dict[str, DriveFile], local_files: dict) -> None:
        for old_rel, entry in list(files_index.items()):
            remote = remote_by_id.get(entry.get("id", ""))
            if not remote or remote.path == old_rel:
                continue
            new_rel = remote.path
            if new_rel in local_files or new_rel in files_index or old_rel not in local_files:
                continue
            if self._local_md5(old_rel, local_files[old_rel], entry) != entry.get("md5"):
                continue  # edited locally since — let the normal rules sort it out
            target = self._abs(new_rel)
            target.parent.mkdir(parents=True, exist_ok=True)
            os.replace(self._abs(old_rel), target)
            self.result.changed_local_paths.extend([self._abs(old_rel), target])
            local_files[new_rel] = local_files.pop(old_rel)
            files_index[new_rel] = files_index.pop(old_rel)
            base = self._read_base(old_rel)
            self._write_base(old_rel, None)
            self._write_base(new_rel, base)
            self.result.moved += 1
            self.result.log.append(f"Moved {old_rel} → {new_rel} (moved on Google Drive)")

    def _local_md5(self, rel: str, stat: os.stat_result, entry: dict | None) -> str:
        if entry and entry.get("mtime") == stat.st_mtime_ns and entry.get("size") == stat.st_size:
            return entry["md5"]
        return _md5(self._abs(rel).read_bytes())

    def _record(self, files_index: dict, rel: str, file_id: str, md5: str | None, content: bytes) -> None:
        stat = os.stat(self._abs(rel))
        files_index[rel] = {"id": file_id, "md5": md5 or _md5(content), "mtime": stat.st_mtime_ns, "size": stat.st_size}
        self._write_base(rel, content)

    def _sync_file(self, rel: str, files_index: dict, local_files: dict, remote_by_path: dict[str, DriveFile]) -> None:
        entry = files_index.get(rel)
        stat = local_files.get(rel)
        remote = remote_by_path.get(rel)
        res = self.result

        if stat is not None and remote is not None:
            local_md5 = self._local_md5(rel, stat, entry)
            if local_md5 == remote.md5:
                if not entry or entry.get("id") != remote.id or entry.get("mtime") != stat.st_mtime_ns:
                    self._record(files_index, rel, remote.id, remote.md5, self._abs(rel).read_bytes())
                return
            synced = entry.get("md5") if entry else None
            local_changed = local_md5 != synced
            remote_changed = remote.md5 != synced
            if remote_changed and not local_changed:
                content = self.client.download(remote.id)
                self._write_local(rel, content)
                self._record(files_index, rel, remote.id, remote.md5, content)
                res.pulled += 1
                res.log.append(f"Pulled {rel}")
                return
            if local_changed and not remote_changed:
                content = self._abs(rel).read_bytes()
                file_id, md5 = self.client.upload(content, name=rel.rpartition("/")[2], file_id=remote.id)
                self._record(files_index, rel, file_id, md5, content)
                res.pushed += 1
                res.log.append(f"Pushed {rel}")
                return
            # Both changed (or first sync of two different versions).
            ours = self._abs(rel).read_bytes()
            theirs = self.client.download(remote.id)
            base = self._read_base(rel) if entry else None
            merged = None
            if base is not None and is_mergeable_text(ours) and is_mergeable_text(theirs):
                merged = three_way_merge(ours, base, theirs)
            if merged is not None:
                if merged != ours:
                    self._write_local(rel, merged)
                file_id, md5 = self.client.upload(merged, name=rel.rpartition("/")[2], file_id=remote.id)
                self._record(files_index, rel, file_id, md5, merged)
                res.merged += 1
                res.log.append(f"Merged local and Google Drive edits to {rel}")
                return
            conflict_rel = _conflict_name(rel, lambda p: p in local_files or p in remote_by_path or self._abs(p).exists())
            self._write_local(conflict_rel, theirs)
            conflict_id, conflict_md5 = self._upload_new(conflict_rel, theirs)
            self._record(files_index, conflict_rel, conflict_id, conflict_md5, theirs)
            file_id, md5 = self.client.upload(ours, name=rel.rpartition("/")[2], file_id=remote.id)
            self._record(files_index, rel, file_id, md5, ours)
            res.conflicts += 1
            res.log.append(f"Conflicting edits to {rel}: kept the local version, saved Google Drive's as {conflict_rel}")
            return

        if stat is not None:  # local only
            content = self._abs(rel).read_bytes()
            if entry and _md5(content) == entry.get("md5"):
                # Synced before, untouched locally, gone from Drive → deleted on Drive.
                self._trash_local(rel)
                files_index.pop(rel, None)
                self._write_base(rel, None)
                res.deleted += 1
                res.log.append(f"Removed {rel} (deleted on Google Drive)")
                return
            file_id, md5 = self._upload_new(rel, content)
            self._record(files_index, rel, file_id, md5, content)
            res.pushed += 1
            res.log.append(f"Pushed {rel}")
            return

        if remote is not None:  # Drive only
            if entry and remote.md5 == entry.get("md5"):
                # Synced before, untouched on Drive, gone locally → deleted locally.
                self.client.trash(remote.id)
                files_index.pop(rel, None)
                self._write_base(rel, None)
                res.deleted += 1
                res.log.append(f"Moved {rel} to the Google Drive trash (deleted locally)")
                return
            content = self.client.download(remote.id)
            self._write_local(rel, content)
            self._record(files_index, rel, remote.id, remote.md5, content)
            res.pulled += 1
            res.log.append(f"Pulled {rel}")
            return

        # Gone on both sides.
        files_index.pop(rel, None)
        self._write_base(rel, None)

    def _sync_folders(self, index: dict, remote_dirs: dict[str, str], remote_files: dict) -> None:
        synced: dict[str, str] = index["folders"]
        # Refresh the local view: files pulled above may have created directories.
        _, local_dirs = self._scan_local()
        remote_paths = {p for p in remote_dirs if p and not _is_hidden(p)}

        for rel in sorted(remote_paths - local_dirs):
            if rel in synced:
                # Synced before, removed locally: trash on Drive if nothing is left under it there.
                prefix = f"{rel}/"
                if not any(p.startswith(prefix) for p in remote_files) and not any(p.startswith(prefix) for p in remote_paths):
                    try:
                        self.client.trash(remote_dirs[rel])
                        synced.pop(rel, None)
                        self.result.deleted += 1
                        continue
                    except Exception as exc:
                        self.result.errors.append(f"{rel}: {exc}")
                        continue
            self._abs(rel).mkdir(parents=True, exist_ok=True)

        for rel in sorted(local_dirs - remote_paths, reverse=True):
            if rel in synced and not any(self._abs(rel).iterdir()):
                # Synced before, removed on Drive, and empty locally → remove.
                try:
                    self._abs(rel).rmdir()
                    synced.pop(rel, None)
                    self.result.deleted += 1
                except OSError:
                    pass
                continue
            try:
                self._ensure_drive_folder(rel)
            except Exception as exc:
                self.result.errors.append(f"{rel}: {exc}")

        index["folders"] = {p: i for p, i in self._folders.items() if p and self._abs(p).is_dir()}
