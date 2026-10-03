"""'Start where I left off': capture and restore the whole app session.

With Settings -> Startup -> On launch -> "Start where I left off"
(``Settings.session_control == "keep_session"``) the app saves one snapshot
when it closes and rebuilds it on the next launch::

    {"version": 2, "windows": [{
        "geometry": <base64 QMainWindow.saveGeometry()>,
        "mode": "discovery" | "creation",
        "active_tab": 0,
        "markdown_html": true, "wysiwyg": true,   # pane toggles of the active tab
        "tabs": [{"path": "...", "title": "", "md": {...}, "wysiwyg": {...},
                  "panes": {"md": true, "wysiwyg": true}}],
        "discovery": {"view": "reader", "item_id": "...", "locator": {...}}}]}

The snapshot covers *every* open window, taken in one go when the app
quits or the primary window closes (which closes the others), so a window
that happens to close last can no longer overwrite the rest. Closing a
single extra window on its own simply drops it from the next snapshot.
"""

from __future__ import annotations

import base64
from pathlib import Path
from typing import TYPE_CHECKING, Any, Callable

from PySide6.QtCore import QByteArray, QTimer

from .app_modes import MODE_CREATION, normalize_mode

if TYPE_CHECKING:  # pragma: no cover
    from .settings import Settings

SESSION_VERSION = 2


def _b64(data: QByteArray) -> str:
    return base64.b64encode(bytes(data)).decode("ascii")


def _unb64(text: str) -> QByteArray:
    try:
        return QByteArray(base64.b64decode(text.encode("ascii")))
    except Exception:
        return QByteArray()


# -- capture -------------------------------------------------------------------


def capture_window(win: Any) -> dict:
    """Snapshot one ``MainWindow``."""

    state: dict[str, Any] = {
        "geometry": _b64(win.saveGeometry()),
        "mode": getattr(win, "_mode", MODE_CREATION),
        "active_tab": int(getattr(win, "_current_tab_index", 0)),
        "tabs": [],
    }
    try:
        state["markdown_html"] = bool(win._chk_md_editor.isChecked())
        state["wysiwyg"] = bool(win._chk_wysiwyg.isChecked())
    except Exception:
        pass

    tab_widget = win._tab_widget
    for i, doc in enumerate(getattr(win, "_tab_documents", [])):
        path = getattr(doc, "path", None)
        if not isinstance(path, Path) or not path.is_file():
            # Unsaved documents have nothing to reopen.
            continue
        title = tab_widget.tabText(i) if i < tab_widget.count() else ""
        if i not in getattr(win, "_tab_user_renamed", set()) or title == path.name:
            title = ""
        tab: dict[str, Any] = {"path": str(path), "title": title, "index": i}
        try:
            editor, preview = win._tab_widgets[i]
            if i == win._current_tab_index:
                tab["md"] = editor.get_cursor_state()
                tab["wysiwyg"] = preview.get_cursor_state()
            else:
                saved = win._tab_caret_states[i] if i < len(win._tab_caret_states) else {}
                tab["md"] = (saved or {}).get("md")
                tab["wysiwyg"] = (saved or {}).get("wysiwyg")
        except Exception:
            pass
        try:
            panes = win._tab_pane_visibility[i]
            tab["panes"] = {"md": bool(panes.get("md", True)), "wysiwyg": bool(panes.get("wysiwyg", True))}
        except Exception:
            pass
        state["tabs"].append(tab)

    # The active tab index refers to the saved (on-disk) tabs only.
    saved_indexes = [t.pop("index") for t in state["tabs"]]
    state["active_tab"] = (
        saved_indexes.index(state["active_tab"]) if state["active_tab"] in saved_indexes else 0
    )

    discovery = getattr(win, "_discovery_view", None)
    if discovery is not None:
        try:
            state["discovery"] = discovery.capture_state()
        except Exception:
            pass
    return state


def capture_session(windows: list[Any]) -> dict:
    snapshots = []
    for win in windows:
        try:
            snapshots.append(capture_window(win))
        except Exception:
            continue
    return {"version": SESSION_VERSION, "windows": snapshots}


# -- legacy settings -------------------------------------------------------------


def session_from_settings(settings: "Settings") -> dict:
    """Return the saved v2 snapshot, converting the pre-v2 tab list if needed."""

    state = getattr(settings, "session_state", None) or {}
    if isinstance(state, dict) and state.get("version") == SESSION_VERSION and state.get("windows"):
        return state

    tabs = list(getattr(settings, "session_open_tabs", []) or [])
    if not tabs:
        return {}
    titles = list(getattr(settings, "session_tab_titles", []) or [])
    active = int(getattr(settings, "session_active_tab", 0) or 0)
    return {
        "version": SESSION_VERSION,
        "windows": [
            {
                "mode": MODE_CREATION,
                "active_tab": active if 0 <= active < len(tabs) else 0,
                "tabs": [
                    {"path": p, "title": titles[i] if i < len(titles) else ""}
                    for i, p in enumerate(tabs)
                ],
            }
        ],
    }


# -- restore ---------------------------------------------------------------------


def restore_window(win: Any, state: dict) -> list[str]:
    """Rebuild *win* from *state*; return the paths that no longer exist."""

    geometry = state.get("geometry")
    if isinstance(geometry, str) and geometry:
        win.restoreGeometry(_unb64(geometry))

    tabs = [t for t in state.get("tabs") or [] if isinstance(t, dict) and t.get("path")]
    present = [t for t in tabs if Path(t["path"]).expanduser().is_file()]
    missing = [t["path"] for t in tabs if t not in present]

    active_saved = int(state.get("active_tab") or 0)
    active_tab_state = tabs[active_saved] if 0 <= active_saved < len(tabs) else None
    active = present.index(active_tab_state) if active_tab_state in present else 0

    if present:
        win._open_paths_from_cli([t["path"] for t in present])
        count = win._tab_widget.count()
        for i, tab in enumerate(present):
            if i >= count:
                break
            title = tab.get("title")
            if title:
                win._tab_widget.setTabText(i, title)
                win._tab_user_renamed.add(i)
            panes = tab.get("panes")
            if isinstance(panes, dict) and i < len(win._tab_pane_visibility):
                win._tab_pane_visibility[i] = {
                    "md": bool(panes.get("md", True)),
                    "wysiwyg": bool(panes.get("wysiwyg", True)),
                }
        if 0 <= active < count:
            win._tab_widget.setCurrentIndex(active)
            # Re-apply the active tab so its pane toggles take effect even
            # when it was already the current tab.
            win._on_tab_changed(active)
        for i, tab in enumerate(present):
            if i == active or i >= len(win._tab_caret_states):
                continue
            win._tab_caret_states[i] = {"md": tab.get("md"), "wysiwyg": tab.get("wysiwyg")}

        if active_tab_state in present:
            # Cursor and scroll only make sense once the restored document
            # is laid out; let the event loop run first.
            def _apply_cursor(win=win, tab=active_tab_state) -> None:
                try:
                    win.editor.restore_cursor_state(tab.get("md"))
                except Exception:
                    pass
                try:
                    win.preview.restore_cursor_state(tab.get("wysiwyg"))
                except Exception:
                    pass

            QTimer.singleShot(150, _apply_cursor)

    mode = normalize_mode(state.get("mode")) or MODE_CREATION
    win.set_mode(mode)
    discovery_state = state.get("discovery")
    if mode == "discovery" and isinstance(discovery_state, dict):
        view = win.discovery_view()
        if view is not None:
            QTimer.singleShot(0, lambda: view.restore_state(discovery_state))
    return missing


def restore_session(
    state: dict,
    create_window: Callable[[int], Any],
) -> tuple[list[Any], list[str]]:
    """Recreate every saved window via ``create_window(index)``.

    Returns the windows and the file paths that could not be reopened.
    """

    windows: list[Any] = []
    missing: list[str] = []
    for index, win_state in enumerate(state.get("windows") or []):
        if not isinstance(win_state, dict):
            continue
        win = create_window(index)
        try:
            missing.extend(restore_window(win, win_state))
        except Exception:
            import traceback

            traceback.print_exc()
        windows.append(win)
    return windows, missing
