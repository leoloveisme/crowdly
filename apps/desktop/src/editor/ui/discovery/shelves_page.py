"""Shelf helpers shared by My Library, Browse Crowdly and the reader.

Shelves live on the user's Crowdly account (backend/src/shelves.js), so the
desktop app and the web /shelves page show the same ones; My Library
(``library_page.py``) shows them in its sidebar.

``AddToShelfMenu`` is the "Add to shelf" submenu: Favorite / Living / Lived
toggles for Crowdly stories, a checkbox per manual shelf, and "New shelf…".
"""

from __future__ import annotations

from typing import Callable

from PySide6.QtCore import QCoreApplication, Qt, Signal
from PySide6.QtWidgets import QInputDialog, QMenu, QWidget


SYSTEM_KEYS = ("favorites", "living", "lived", "newest", "most_active", "most_popular")
STATUS_SYSTEM_KEYS = ("favorites", "living", "lived")
STATUS_KEYS = ("favorite", "living", "lived")



def _tr(text: str) -> str:
    return QCoreApplication.translate("Shelves", text)


def system_shelf_name(key: str) -> str:
    return {
        "favorites": _tr("Favorites"),
        "living": _tr("Living"),
        "lived": _tr("Lived"),
        "newest": _tr("Newest stories"),
        "most_active": _tr("Most active"),
        "most_popular": _tr("Most popular"),
    }[key]


def status_name(key: str) -> str:
    return {"favorite": _tr("Favorite"), "living": _tr("Living"), "lived": _tr("Lived")}[key]


def item_details(item: dict) -> str:
    """Second line of a shelf item: author/chapter, kind and progress."""

    kinds = {
        "epub": "EPUB",
        "pdf": "PDF",
        "audio": _tr("Audio"),
        "text": _tr("Text"),
        "story": _tr("Story"),
        "screenplay": _tr("Screenplay"),
    }
    parts = []
    if item.get("subtitle"):
        parts.append(str(item["subtitle"]))
    parts.append(kinds.get(item.get("format") or "", item.get("format") or ""))
    progress = int(round(float(item.get("progress") or 0)))
    if progress:
        parts.append(_tr("{percent}% read").format(percent=progress))
    if item.get("type") == "library_item":
        parts.append(_tr("in my library"))
    return " · ".join(p for p in parts if p)


class AddToShelfMenu(QMenu):
    """Favorite / Living / Lived and the manual shelves, from the local store.

    Works with sync off: changes go to the local shelf store and are sent to
    the account by the next sync (see library.shelf_sync). Library books are
    identified by their *local* library item id.
    """

    changed = Signal()

    def __init__(
        self,
        store,
        item_type: str,
        item_id: str | None,
        parent: QWidget | None = None,
        *,
        title: str = "",
        status_message: Callable[[str], None] | None = None,
    ) -> None:
        super().__init__(_tr("Add to shelf"), parent)
        self._store = store
        self._item_type = item_type
        self._item_id = item_id
        self._title = title
        self._status_message = status_message or (lambda _m: None)
        self.aboutToShow.connect(self._load)

    def _load(self) -> None:
        self.clear()
        if not self._item_id:
            hint = self.addAction(_tr("This item can't be put on a shelf."))
            hint.setEnabled(False)
            return
        self.populate(self._store.membership(self._item_type, self._item_id))

    def populate(self, data: dict) -> None:
        """Fill the menu from a membership result (``LocalShelfStore.membership``)."""

        self.clear()
        if self._item_type in ("story", "screenplay"):
            status = data.get("status") or {}
            for key in STATUS_KEYS:
                action = self.addAction(status_name(key))
                action.setCheckable(True)
                action.setChecked(bool(status.get(key)))
                action.toggled.connect(lambda on, k=key: self._set_status(k, on))
            self.addSeparator()
        for shelf in data.get("shelves") or []:
            action = self.addAction(shelf.get("name") or "")
            action.setCheckable(True)
            action.setChecked(bool(shelf.get("contains")))
            action.toggled.connect(lambda on, sid=shelf["id"]: self._toggle_shelf(sid, on))
        if data.get("shelves"):
            self.addSeparator()
        new = self.addAction(_tr("New shelf…"))
        new.triggered.connect(self._new_shelf)

    def _done(self, message: str) -> None:
        self._status_message(message)
        self.changed.emit()

    def _set_status(self, key: str, on: bool) -> None:
        self._store.set_story_status(self._item_type, self._item_id, title=self._title, **{key: on})
        self._done(_tr("Saved"))

    def _toggle_shelf(self, shelf_id: str, on: bool) -> None:
        if on:
            self._store.add_to_shelf(shelf_id, self._item_type, self._item_id, title=self._title)
            self._done(_tr("Added to the shelf"))
        else:
            self._store.remove_from_shelf(shelf_id, self._item_id, self._item_type)
            self._done(_tr("Removed from the shelf"))

    def _new_shelf(self) -> None:
        name, ok = QInputDialog.getText(self.parentWidget(), _tr("New shelf"), _tr("Shelf name:"))
        name = (name or "").strip()
        if not ok or not name:
            return
        shelf = self._store.create_shelf(name)
        self._store.add_to_shelf(shelf["id"], self._item_type, self._item_id, title=self._title)
        self._done(_tr("Added to the shelf"))
