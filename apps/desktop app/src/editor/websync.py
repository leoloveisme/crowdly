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

from .settings import Settings


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

  root_path = str(project_space.expand_user().resolve()) if hasattr(project_space, "expand_user") else str(project_space.resolve())
  folder_name = project_space.resolve().name

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
  return True, message
