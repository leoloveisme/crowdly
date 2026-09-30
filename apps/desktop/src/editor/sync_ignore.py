"""Which paths inside a project space must never be synced.

Mirrors the backend's ``backend/src/spaceSyncIgnore.js``:

* every dot-file / dot-folder (``.git/``, ``.gitignore``, ``.DS_Store``,
  ``.crowdly/`` — the local per-device revision queue, which must never be
  shared between machines), and
* anything the space's own ``.gitignore`` files list. A nested
  ``.gitignore`` applies under its own folder, like git.

``.gitignore`` matching needs the ``pathspec`` package. If it isn't
installed (an older environment that hasn't re-run ``pip install -e .``),
only the dot-path rule applies rather than failing the whole sync.
"""

from __future__ import annotations

import os
from pathlib import Path

try:  # pragma: no cover - depends on the environment
    import pathspec
except ImportError:  # pragma: no cover
    pathspec = None


def is_dot_path(rel_path: str) -> bool:
    return any(part.startswith(".") for part in rel_path.split("/") if part)


class SyncIgnore:
    """Loads every ``.gitignore`` under *root* once; ``ignores()`` answers per path."""

    def __init__(self, root: Path) -> None:
        self.root = Path(root)
        self._specs: list[tuple[str, object]] = []
        if pathspec is None:
            return
        for dirpath, dirnames, filenames in os.walk(self.root):
            dirnames[:] = [d for d in dirnames if not d.startswith(".")]
            if ".gitignore" not in filenames:
                continue
            rel_dir = Path(dirpath).relative_to(self.root).as_posix()
            rel_dir = "" if rel_dir == "." else rel_dir
            try:
                lines = (Path(dirpath) / ".gitignore").read_text(encoding="utf-8", errors="replace").splitlines()
            except OSError:
                continue
            self._specs.append((rel_dir, pathspec.PathSpec.from_lines("gitwildmatch", lines)))

    def ignores(self, rel_path: str, is_dir: bool = False) -> bool:
        rel_path = rel_path.strip("/")
        if not rel_path:
            return False
        if is_dot_path(rel_path):
            return True
        for rel_dir, spec in self._specs:
            if rel_dir and not (rel_path == rel_dir or rel_path.startswith(rel_dir + "/")):
                continue
            sub = rel_path[len(rel_dir) + 1:] if rel_dir else rel_path
            if not sub:
                continue
            if spec.match_file(sub + "/" if is_dir else sub):
                return True
            # A file inside an ignored folder is ignored too ("drafts/" -> "drafts/x.md").
            parts = sub.split("/")
            for i in range(1, len(parts)):
                if spec.match_file("/".join(parts[:i]) + "/"):
                    return True
        return False
