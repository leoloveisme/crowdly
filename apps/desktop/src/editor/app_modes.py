"""The two modes of the Crowdly desktop app: Discovery and Creation.

Crowdly is one app with two modes that can be switched at any time:

- **Crowdly Discovery** - read and listen (library, reader, Crowdly stories).
- **Crowdly Creation** - write (the editor this app started as).

The app is distributed as two downloads ("Crowdly Discovery" and "Crowdly
Creation", and later two store listings). They are the same code; each one
only bundles a different *first-start mode* in ``first_start_mode.txt``
next to this module (see ``first_start_mode``). That value decides the mode
on the very first start, after which ``Settings.startup_mode`` - which the
user can change under Settings -> Startup - takes over.
"""

from __future__ import annotations

import sys
from pathlib import Path

from PySide6.QtCore import QCoreApplication

MODE_DISCOVERY = "discovery"
MODE_CREATION = "creation"
MODES = (MODE_DISCOVERY, MODE_CREATION)
DEFAULT_MODE = MODE_CREATION

FIRST_START_MODE_FILE = "first_start_mode.txt"


def normalize_mode(value: object) -> str | None:
    """Return *value* if it names a known mode, else ``None``."""

    if isinstance(value, str) and value.strip().lower() in MODES:
        return value.strip().lower()
    return None


def _candidate_paths() -> list[Path]:
    here = Path(__file__).resolve().parent
    paths = [here / FIRST_START_MODE_FILE]
    # PyInstaller one-file / one-dir bundles unpack data files under
    # sys._MEIPASS; the spec places the file next to the package.
    base = getattr(sys, "_MEIPASS", None)
    if base:
        paths.append(Path(base) / "editor" / FIRST_START_MODE_FILE)
        paths.append(Path(base) / FIRST_START_MODE_FILE)
    return paths


def first_start_mode() -> str:
    """Return the mode bundled with this download (``creation`` if none)."""

    for path in _candidate_paths():
        try:
            if path.is_file():
                mode = normalize_mode(path.read_text(encoding="utf-8"))
                if mode:
                    return mode
        except OSError:
            continue
    return DEFAULT_MODE


def display_name(mode: str) -> str:
    """Translated product name for *mode*, e.g. "Crowdly Discovery"."""

    if mode == MODE_DISCOVERY:
        return QCoreApplication.translate("AppModes", "Crowdly Discovery")
    return QCoreApplication.translate("AppModes", "Crowdly Creation")


def short_name(mode: str) -> str:
    """Translated short mode label for toggles, e.g. "Discovery"."""

    if mode == MODE_DISCOVERY:
        return QCoreApplication.translate("AppModes", "Discovery")
    return QCoreApplication.translate("AppModes", "Creation")
