"""Helpers for synchronising desktop Spaces with the Crowdly web backend.

This module is intentionally GUI-agnostic. It exposes a small API that
accepts a Settings object and a project-space Path and pushes a
one-way snapshot of that directory tree to the backend creative_spaces
endpoints.
"""

from __future__ import annotations

from pathlib import Path
from datetime import datetime, timezone
from typing import Any, Dict, List, Tuple
import json
import os
from urllib import request, error
from urllib.parse import quote as _urlquote

from .settings import Settings, save_settings


DEFAULT_API_BASE = "http://localhost:4000"


def _build_api_base(settings: Settings) -> str:
  """Return the base URL for the backend API.

  When ``settings.crowdly_base_url`` is configured we use that as the
  base, otherwise we fall back to the local development backend.
  """

  base = settings.crowdly_base_url or DEFAULT_API_BASE
  return base.rstrip("/")


def _request_json(url: str, *, method: str = "GET", payload: Dict[str, Any] | None = None, timeout: float = 10.0) -> Tuple[int, Dict[str, Any]]:
  """Perform an HTTP request that sends/receives JSON.

  Returns ``(status_code, body_dict)``. For non-2xx responses we still
  try to decode the response body as JSON so that callers can surface
  backend error messages.
  """

  data: bytes | None
  if payload is None:
    data = None
  else:
    data = json.dumps(payload).encode("utf-8")

  req = request.Request(url, data=data, headers={"Content-Type": "application/json"})
  req.get_method = lambda: method  # type: ignore[assignment]

  try:
    with request.urlopen(req, timeout=timeout) as resp:  # type: ignore[call-arg]
      body_bytes = resp.read()
      try:
        body = json.loads(body_bytes.decode("utf-8"))
      except Exception:
        body = {}
      return resp.getcode(), body
  except error.HTTPError as exc:  # pragma: no cover - network dependent
    try:
      raw = exc.read().decode("utf-8")
      body = json.loads(raw) if raw else {}
    except Exception:
      body = {"error": str(exc)}
    return exc.code, body  # type: ignore[return-value]
  except Exception as exc:  # pragma: no cover - network dependent
    raise RuntimeError(str(exc)) from exc


def _get_json(url: str, timeout: float = 10.0) -> Tuple[int, Dict[str, Any]]:
  """Shortcut for a JSON GET request."""

  return _request_json(url, method="GET", payload=None, timeout=timeout)


def _post_json(url: str, payload: Dict[str, Any], timeout: float = 10.0) -> Tuple[int, Dict[str, Any]]:
  """POST *payload* as JSON to *url* and return (status_code, body_dict)."""

  return _request_json(url, method="POST", payload=payload, timeout=timeout)


def build_space_snapshot(root: Path) -> Dict[str, Any]:
  """Return a snapshot payload for the given project-space *root*.

  The payload shape is compatible with the backend
  ``POST /creative-spaces/:spaceId/sync`` endpoint and consists of a
  ``snapshotGeneratedAt`` timestamp and an ``items`` list containing
  folders and files.
  """

  root = root.expanduser().resolve()
  if not root.exists() or not root.is_dir():
    raise ValueError(f"Project space does not exist or is not a directory: {root}")

  items: List[Dict[str, Any]] = []

  for dirpath, dirnames, filenames in os.walk(root):
    base = Path(dirpath)
    try:
      rel_dir = base.relative_to(root)
    except ValueError:
      # Should not happen, but guard against it.
      rel_dir = Path(".")

    # For the root directory we do not emit an explicit folder item; the
    # backend treats the space itself as the root.
    if rel_dir != Path("."):
      rel_str = rel_dir.as_posix()
      items.append(
        {
          "relativePath": rel_str,
          "kind": "folder",
          "sizeBytes": None,
          "hash": None,
          "deleted": False,
        }
      )

    for filename in filenames:
      full_path = base / filename
      try:
        stat_result = full_path.stat()
        size_bytes = int(stat_result.st_size)
      except OSError:
        size_bytes = None

      rel_file = filename if rel_dir == Path(".") else (rel_dir / filename).as_posix()

      items.append(
        {
          "relativePath": rel_file,
          "kind": "file",
          "sizeBytes": size_bytes,
          "hash": None,
          "deleted": False,
        }
      )

  return {
    "snapshotGeneratedAt": datetime.now(timezone.utc).isoformat(),
    "items": items,
  }


def sync_space_to_web(settings: Settings, project_space: Path, user_id: str) -> Tuple[bool, str]:
  """Push a snapshot of *project_space* to the Crowdly backend.

  Returns ``(True, message)`` on success; on failure this function
  raises a :class:`RuntimeError` with a descriptive message.

  The function tries hard to *reuse* an existing creative space for this
  user instead of always syncing into the first/default one:

  * If a creative space with a matching ``path`` already exists for the
    user, that space is reused.
  * Otherwise, if there is exactly one space whose ``name`` matches the
    project-space folder name, that space is reused and its ``path`` is
    updated.
  * If neither of the above rules find a match, a new creative space is
    created with ``name`` equal to the folder name and ``path`` set to
    the full project-space path.
  """

  api_base = _build_api_base(settings)
  snapshot = build_space_snapshot(project_space)

  # Normalise the project-space root path and folder name once; this is
  # used both for matching existing creative spaces and for creating
  # new ones when necessary.
  root = project_space.expanduser().resolve()
  root_path = str(root)
  folder_name = root.name

  # 1) Try to find an existing space for this user and path/name.
  space_id: str | None = None
  list_url = f"{api_base}/creative-spaces?userId={user_id}"
  status, body = _get_json(list_url)
  if status == 200 and isinstance(body, list):
    # Prefer an exact path match.
    for row in body:
      try:
        if str(row.get("path") or "") == root_path:
          sid = row.get("id")
          if isinstance(sid, str) and sid:
            space_id = sid
            break
      except Exception:
        continue

    # Otherwise fall back to a unique name match.
    if space_id is None:
      try:
        candidates = [
          r for r in body
          if isinstance(r.get("name"), str) and r.get("name") == folder_name
        ]
      except Exception:
        candidates = []
      if len(candidates) == 1:
        sid = candidates[0].get("id")
        if isinstance(sid, str) and sid:
          space_id = sid

  # 2) If still unknown, create a new creative space for this project-space.
  if space_id is None:
    create_url = f"{api_base}/creative-spaces"
    status, body = _post_json(
      create_url,
      {
        "userId": user_id,
        "name": folder_name or "No name creative space",
        "description": None,
        "path": root_path,
        "visibility": "private",
        "published": False,
      },
    )
    if status not in (200, 201):
      raise RuntimeError(body.get("error") or f"Failed to create creative space (status {status})")
    sid = body.get("id")
    if not isinstance(sid, str) or not sid:
      raise RuntimeError("Backend did not return a creative space id")
    space_id = sid
  else:
    # Keep the remote path in sync with the local project-space path.
    try:
      patch_url = f"{api_base}/creative-spaces/{space_id}"
      _post_json(
        patch_url,
        {"userId": user_id, "path": root_path},
        timeout=5.0,
      )
    except Exception:
      # Non-fatal; path is only advisory metadata.
      pass

  # 3) Push the snapshot into the resolved creative space.
  sync_url = f"{api_base}/creative-spaces/{space_id}/sync"
  payload = {"userId": user_id, **snapshot}
  status, body = _post_json(sync_url, payload)
  if status != 200 or not body.get("ok"):
    raise RuntimeError(body.get("error") or f"Sync failed with status {status}")

  created = int(body.get("created", 0))
  updated = int(body.get("updated", 0))
  deleted = int(body.get("deleted", 0))

  message = f"Synced {created} new, {updated} updated and {deleted} deleted items."

  # Remember the mapping from this local project-space path to the remote
  # creative space id so that later pulls can find the correct Space even
  # if its name or path metadata change.
  try:
    root = project_space.expanduser().resolve()
    root_path = str(root)
    state = getattr(settings, "space_sync_state", {}) or {}
    if not isinstance(state, dict):
      state = {}
    mapping = dict(state.get(root_path) or {})
    mapping["remote_space_id"] = space_id
    state[root_path] = mapping
    settings.space_sync_state = state  # type: ignore[assignment]
    save_settings(settings)
  except Exception:
    # Best-effort; failure to persist mapping should not make the sync fail.
    pass

  return True, message


def pull_space_from_web(settings: Settings, project_space: Path, user_id: str) -> str:
  """Pull folder/file structure for *project_space* from the Crowdly backend.

  The current implementation is deliberately conservative: it mirrors
  *remote* folders and files into the local project-space directory but
  does **not** overwrite or delete existing local files. Remote deletions
  are treated as "hints" and skipped locally to avoid accidental data
  loss; they can be reconciled later by the user from the desktop side.

  Returns a short human-readable summary string describing how many
  folders/files were created locally and how many remote deletions or
  existing paths were skipped.
  """

  api_base = _build_api_base(settings)

  root = project_space.expanduser().resolve()
  if not root.exists() or not root.is_dir():
    raise ValueError(f"Project space does not exist or is not a directory: {root}")

  root_path = str(root)
  folder_name = root.name

  # Load any previously recorded sync state for this local project-space.
  state = getattr(settings, "space_sync_state", {}) or {}
  mapping = state.get(root_path) if isinstance(state, dict) else None
  mapped_space_id: str | None = None
  last_pull_at: str | None = None
  if isinstance(mapping, dict):
    val = mapping.get("remote_space_id")
    if isinstance(val, str) and val:
      mapped_space_id = val
    lp = mapping.get("last_pull_at")
    if isinstance(lp, str) and lp:
      last_pull_at = lp

  # 1) Resolve the corresponding creative space id using the same rules as
  #    sync_space_to_web, preferring any previously remembered mapping.
  space_id: str | None = mapped_space_id
  if space_id is None:
    list_url = f"{api_base}/creative-spaces?userId={user_id}"
    status, body = _get_json(list_url)
    if status == 200 and isinstance(body, list):
      # Prefer an exact path match on the current root.
      for row in body:
        try:
          if str(row.get("path") or "") == root_path:
            sid = row.get("id")
            if isinstance(sid, str) and sid:
              space_id = sid
              break
        except Exception:
          continue

      # Otherwise fall back to a unique name match.
      if space_id is None:
        try:
          candidates = [
            r for r in body
            if isinstance(r.get("name"), str) and r.get("name") == folder_name
          ]
        except Exception:
          candidates = []
        if len(candidates) == 1:
          sid = candidates[0].get("id")
          if isinstance(sid, str) and sid:
            space_id = sid

  if space_id is None:
    # Nothing to pull: the web knows nothing about this Space yet.
    return (
      "No matching creative Space was found on the web for this project space; "
      "nothing was pulled. Try syncing this Space to the web first."
    )

  # 2) Fetch the list of items for this creative space. When we have a
  #    previously recorded ``last_pull_at`` timestamp, we request only
  #    items that changed since then to keep payloads small.
  if last_pull_at:
    encoded_since = _urlquote(last_pull_at, safe="")
    sync_url = f"{api_base}/creative-spaces/{space_id}/sync?since={encoded_since}"
  else:
    sync_url = f"{api_base}/creative-spaces/{space_id}/sync"
  status, body = _get_json(sync_url)
  if status != 200:
    raise RuntimeError(body.get("error") or f"Failed to fetch creative space items (status {status})")

  items = body.get("items") or []
  if not isinstance(items, list):
    raise RuntimeError("Backend returned an invalid items payload for creative space sync")

  # Track the newest updated_at timestamp so we can perform incremental
  # pulls next time for this Space.
  latest_updated: str | None = None
  if items:
    try:
      # The backend orders by updated_at ASC, so the last row has the
      # newest timestamp.
      candidate = items[-1].get("updated_at")
      if isinstance(candidate, str) and candidate:
        latest_updated = candidate
    except Exception:
      latest_updated = None

  created_folders = 0
  created_files = 0
  skipped_existing = 0
  skipped_deletes = 0

  # First create folder structure so file creation never fails due to
  # missing parents.
  for raw in items:
    try:
      rel = str(raw.get("relative_path") or "").strip()
    except Exception:
      continue
    if not rel:
      continue

    kind = "folder" if raw.get("kind") == "folder" else "file"
    deleted = bool(raw.get("deleted"))
    local_path = root / rel

    if deleted:
      if local_path.exists():
        skipped_deletes += 1
      continue

    if kind != "folder":
      continue

    if not local_path.exists():
      try:
        local_path.mkdir(parents=True, exist_ok=True)
        created_folders += 1
      except OSError:
        # Best-effort: skip problematic paths.
        continue
    else:
      skipped_existing += 1

  # Now create any missing files.
  for raw in items:
    try:
      rel = str(raw.get("relative_path") or "").strip()
    except Exception:
      continue
    if not rel:
      continue

    kind = "folder" if raw.get("kind") == "folder" else "file"
    deleted = bool(raw.get("deleted"))
    local_path = root / rel

    if deleted or kind != "file":
      continue

    if local_path.exists():
      skipped_existing += 1
      continue

    try:
      local_path.parent.mkdir(parents=True, exist_ok=True)
      # We intentionally create an empty placeholder file here; the actual
      # text content remains managed locally for now.
      local_path.touch(exist_ok=True)
      created_files += 1
    except OSError:
      continue

  parts: list[str] = []
  if created_folders:
    parts.append(f"created {created_folders} folder(s)")
  if created_files:
    parts.append(f"created {created_files} file(s)")
  if skipped_existing:
    parts.append(f"skipped {skipped_existing} existing path(s)")
  if skipped_deletes:
    parts.append(f"skipped {skipped_deletes} remote deletion(s) (kept local copies)")

  # Persist updated sync state for this Space so that future pulls can be
  # incremental and we remember the remote mapping across sessions.
  try:
    state = getattr(settings, "space_sync_state", {}) or {}
    if not isinstance(state, dict):
      state = {}
    mapping = dict(state.get(root_path) or {})
    mapping["remote_space_id"] = space_id
    if latest_updated:
      mapping["last_pull_at"] = latest_updated
    state[root_path] = mapping
    settings.space_sync_state = state  # type: ignore[assignment]
    save_settings(settings)
  except Exception:
    # Best-effort only; failure to persist should not abort the pull.
    pass

  if not parts:
    return "Space is already up to date; no structural changes were pulled from the web."

  return "; ".join(parts) + "."
