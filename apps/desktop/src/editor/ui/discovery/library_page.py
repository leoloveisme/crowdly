"""My Library: everything that's yours, with shelves in a sidebar.

Sidebar:
  Continue reading / All books / Audiobooks / Crowdly stories   (this computer)
  Crowdly: Favorites / Living / Lived                           (account)
  My shelves: manual and ⚙ smart shelves                        (account)

Built-in views come from the local library; shelves come from the local
shelf store (``library.shelf_store``), a mirror of the account's shelves that
works without sync or a connection and is synced by ``library.shelf_sync``. Cards can be dropped on a manual shelf in
the sidebar, files can be dropped on the page to import them, and a manual
shelf in "My order" can be reordered by dragging.
"""

from __future__ import annotations

import json

from PySide6.QtCore import QPoint, Qt, Signal
from PySide6.QtWidgets import (
    QAbstractItemView,
    QButtonGroup,
    QComboBox,
    QHBoxLayout,
    QInputDialog,
    QLabel,
    QListWidget,
    QListWidgetItem,
    QMenu,
    QMessageBox,
    QPushButton,
    QSplitter,
    QStackedWidget,
    QToolButton,
    QVBoxLayout,
    QWidget,
)

from ...library.store import KIND_CROWDLY, KIND_IMPORTED, LibraryItem, LocalLibrary
from ...library.shelf_store import LocalShelfStore, item_card
from .cards import CARD_MIME, CardView, CoverProvider
from .shelves_page import STATUS_SYSTEM_KEYS, system_shelf_name
from .smart_shelf_dialog import SORTS, SmartShelfDialog, sort_label

LOCAL_VIEWS = ("local:continue", "local:books", "local:audio", "local:crowdly")
FINISHED_PERCENT = 98
KEY_ROLE = Qt.ItemDataRole.UserRole
KIND_ROLE = Qt.ItemDataRole.UserRole + 1

def local_card(item: LibraryItem) -> dict:
    """Card dict for an item of the local library."""

    return item_card(item)


class ShelfSidebar(QListWidget):
    """Shelf list that accepts cards (add to shelf) and reorders my shelves."""

    cardDropped = Signal(str, dict)  # shelf id, card payload
    shelvesReordered = Signal(list)

    def __init__(self, parent: QWidget | None = None) -> None:
        super().__init__(parent)
        self.setAcceptDrops(True)
        self.setDragEnabled(True)
        self.setDropIndicatorShown(True)
        self.setDragDropMode(QAbstractItemView.DragDropMode.DragDrop)
        self.read_only = False

    def _shelf_at(self, pos: QPoint) -> QListWidgetItem | None:
        item = self.itemAt(pos)
        if item is not None and item.data(KIND_ROLE) in ("manual", "smart"):
            return item
        return None

    def dragEnterEvent(self, event) -> None:  # pragma: no cover - UI wiring
        if self.read_only:
            event.ignore()
            return
        if event.mimeData().hasFormat(CARD_MIME) or event.source() is self:
            event.acceptProposedAction()
        else:
            event.ignore()

    def dragMoveEvent(self, event) -> None:  # pragma: no cover - UI wiring
        target = self._shelf_at(event.position().toPoint())
        if event.source() is self:
            dragged = self.currentItem()
            ok = target is not None and dragged is not None and dragged.data(KIND_ROLE) in ("manual", "smart")
        else:
            ok = target is not None and target.data(KIND_ROLE) == "manual"
        if ok:
            event.acceptProposedAction()
        else:
            event.ignore()

    def dropEvent(self, event) -> None:  # pragma: no cover - UI wiring
        target = self._shelf_at(event.position().toPoint())
        if target is None:
            event.ignore()
            return
        if event.source() is self:
            dragged = self.currentItem()
            if dragged is None or dragged is target or dragged.data(KIND_ROLE) not in ("manual", "smart"):
                event.ignore()
                return
            ids = [self.item(i).data(KEY_ROLE) for i in range(self.count()) if self.item(i).data(KIND_ROLE) in ("manual", "smart")]
            ids.remove(dragged.data(KEY_ROLE))
            ids.insert(ids.index(target.data(KEY_ROLE)), dragged.data(KEY_ROLE))
            self.shelvesReordered.emit(ids)
            event.acceptProposedAction()
            return
        try:
            payload = json.loads(bytes(event.mimeData().data(CARD_MIME)).decode("utf-8"))
        except Exception:
            event.ignore()
            return
        if target.data(KIND_ROLE) == "manual":
            self.cardDropped.emit(target.data(KEY_ROLE), payload)
            event.acceptProposedAction()
        else:
            event.ignore()


class LibraryPage(QWidget):
    cardClicked = Signal(dict)
    cardActivated = Signal(dict)
    cardContextMenu = Signal(dict, QPoint)
    detailsRequested = Signal(dict)
    filesDropped = Signal(list)
    statusMessage = Signal(str)
    viewModeChanged = Signal(str)

    def __init__(
        self,
        library: LocalLibrary,
        covers: CoverProvider,
        store: LocalShelfStore,
        parent: QWidget | None = None,
    ) -> None:
        super().__init__(parent)
        self._library = library
        self._covers = covers
        self._store = store
        self._system: list[dict] = []
        self._custom: list[dict] = []
        self._current = "local:books"
        self._items: list[dict] = []
        self._filter = ""
        self._local_sort = "last_read"

        root = QHBoxLayout(self)
        root.setContentsMargins(0, 0, 0, 0)
        splitter = QSplitter(Qt.Orientation.Horizontal, self)
        root.addWidget(splitter)

        # Sidebar ----------------------------------------------------------------
        side = QWidget(splitter)
        side_layout = QVBoxLayout(side)
        side_layout.setContentsMargins(8, 8, 4, 8)
        self.sidebar = ShelfSidebar(side)
        self.sidebar.setFrameShape(ShelfSidebar.Shape.NoFrame)
        self.sidebar.setSpacing(1)
        self.sidebar.setStyleSheet(
            "QListWidget { background: transparent; }"
            "QListWidget::item { padding: 4px 8px; border-radius: 5px; }"
            "QListWidget::item:selected { background: #4b3fa8; color: white; }"
            "QListWidget::item:hover:!selected { background: rgba(75, 63, 168, 0.12); }"
        )
        self.sidebar.itemClicked.connect(self._sidebar_clicked)
        self.sidebar.cardDropped.connect(self._card_dropped_on_shelf)
        self.sidebar.shelvesReordered.connect(self._shelves_reordered)
        self.sidebar.setContextMenuPolicy(Qt.ContextMenuPolicy.CustomContextMenu)
        self.sidebar.customContextMenuRequested.connect(self._shelf_context_menu)
        side_layout.addWidget(self.sidebar, 1)
        self._btn_new = QPushButton(side)
        self._btn_new.clicked.connect(self.new_shelf)
        side_layout.addWidget(self._btn_new)
        self._btn_new_smart = QPushButton(side)
        self._btn_new_smart.clicked.connect(self.new_smart_shelf)
        side_layout.addWidget(self._btn_new_smart)

        # Content ----------------------------------------------------------------
        content = QWidget(splitter)
        layout = QVBoxLayout(content)
        layout.setContentsMargins(8, 8, 8, 8)
        toolbar = QHBoxLayout()
        self._title = QLabel(content)
        font = self._title.font()
        font.setBold(True)
        font.setPointSizeF(font.pointSizeF() * 1.3)
        self._title.setFont(font)
        toolbar.addWidget(self._title, 1)
        self._sort_label = QLabel(content)
        toolbar.addWidget(self._sort_label)
        self._sort = QComboBox(content)
        self._sort.activated.connect(self._sort_changed)
        toolbar.addWidget(self._sort)
        self._view_group = QButtonGroup(self)
        self._btn_grid = QToolButton(content)
        self._btn_list = QToolButton(content)
        for button, mode in ((self._btn_grid, "grid"), (self._btn_list, "list")):
            button.setCheckable(True)
            button.setAutoRaise(True)
            button.clicked.connect(lambda _=False, m=mode: self.set_view_mode(m, emit=True))
            self._view_group.addButton(button)
            toolbar.addWidget(button)
        layout.addLayout(toolbar)
        self._hint = QLabel(content)
        self._hint.setWordWrap(True)
        self._hint.setStyleSheet("color: #666;")
        layout.addWidget(self._hint)

        self._body = QStackedWidget(content)
        self.view = CardView(covers, "grid", self._body)
        self.view.accept_files = True
        self.view.cardClicked.connect(self.cardClicked)
        self.view.cardActivated.connect(self.cardActivated)
        self.view.cardContextMenu.connect(self.cardContextMenu)
        self.view.detailsRequested.connect(self.detailsRequested)
        self.view.filesDropped.connect(self.filesDropped)
        self.view.reordered.connect(self._items_reordered)
        self._body.addWidget(self.view)
        self._empty = _DropZone(self._body)
        self._empty.filesDropped.connect(self.filesDropped)
        self._body.addWidget(self._empty)
        layout.addWidget(self._body, 1)

        self._crowdly_label = QLabel(content)
        font = self._crowdly_label.font()
        font.setBold(True)
        self._crowdly_label.setFont(font)
        layout.addWidget(self._crowdly_label)
        self.crowdly_row = CardView(covers, "row", content)
        self.crowdly_row.cardClicked.connect(self.cardClicked)
        self.crowdly_row.cardActivated.connect(self.cardActivated)
        self.crowdly_row.cardContextMenu.connect(self.cardContextMenu)
        layout.addWidget(self.crowdly_row)
        self._crowdly_label.setVisible(False)
        self.crowdly_row.setVisible(False)

        splitter.addWidget(side)
        splitter.addWidget(content)
        splitter.setStretchFactor(0, 0)
        splitter.setStretchFactor(1, 1)
        splitter.setSizes([230, 900])

        self._view_mode = "grid"
        self._btn_grid.setChecked(True)
        self.retranslate()

    # -- labels ------------------------------------------------------------------

    def view_name(self, key: str) -> str:
        names = {
            "local:continue": self.tr("Continue reading"),
            "local:books": self.tr("All books"),
            "local:audio": self.tr("Audiobooks"),
            "local:crowdly": self.tr("Crowdly stories"),
        }
        if key in names:
            return names[key]
        if key in STATUS_SYSTEM_KEYS:
            return system_shelf_name(key)
        shelf = self._shelf(key)
        return (shelf or {}).get("name", "")

    def retranslate(self) -> None:
        self._btn_new.setText(self.tr("+ New shelf"))
        self._btn_new_smart.setText(self.tr("+ New smart shelf"))
        self._sort_label.setText(self.tr("Sort by"))
        self._btn_grid.setText(self.tr("Grid"))
        self._btn_list.setText(self.tr("List"))
        self._crowdly_label.setText(self.tr("Also on Crowdly"))
        self._empty.retranslate()
        self.view.delegate.untitled = self.tr("Untitled")
        self.crowdly_row.delegate.untitled = self.tr("Untitled")
        self._render_sidebar()
        self._render()

    # -- data ------------------------------------------------------------------

    def _shelf(self, key: str) -> dict | None:
        return next((s for s in self._custom if s.get("id") == key), None)

    def current_key(self) -> str:
        return self._current

    def refresh(self, select: str | None = None) -> None:
        """Re-read the shelves (and the selected view) from the store."""

        if select:
            self._current = select
        data = self._store.list_shelves()
        self._system = [s for s in data.get("system") or [] if s.get("key") in STATUS_SYSTEM_KEYS]
        self._custom = list(data.get("custom") or [])
        if self._current not in LOCAL_VIEWS and self._current not in STATUS_SYSTEM_KEYS and not self._shelf(self._current):
            self._current = "local:books"
        self._render_sidebar()
        self.select(self._current)

    def reload_local(self) -> None:
        """Refresh after the library or the shelves changed (import, sync, removal)."""

        self.refresh()

    def select(self, key: str) -> None:
        self._current = key
        self._mark_selected()
        if key in LOCAL_VIEWS:
            self._items = self._local_items(key)
        else:
            self._items = list(self._store.shelf_items(key).get("items") or [])
        self._render()

    def _local_items(self, key: str) -> list[dict]:
        items = self._library.items()
        if key == "local:continue":
            chosen = [
                i for i in items
                if 0 < float((i.position or {}).get("percent") or 0) < FINISHED_PERCENT
            ]
            return [local_card(i) for i in sorted(chosen, key=lambda i: i.last_opened_at or "", reverse=True)]
        if key == "local:books":
            # Everything in My Library: imported books, audiobooks and the
            # Crowdly stories read here.
            chosen = list(items)
        elif key == "local:audio":
            chosen = [i for i in items if i.kind == KIND_IMPORTED and i.format == "audio"]
        else:
            chosen = [i for i in items if i.kind == KIND_CROWDLY]
        return self._sorted([local_card(i) for i in chosen], self._local_sort)

    @staticmethod
    def _sorted(items: list[dict], sort: str) -> list[dict]:
        if sort == "title":
            return sorted(items, key=lambda i: (i.get("title") or "").lower())
        if sort == "added":
            return sorted(items, key=lambda i: i.get("added_at") or "", reverse=True)
        if sort == "progress":
            return sorted(items, key=lambda i: float(i.get("progress") or 0), reverse=True)
        return sorted(items, key=lambda i: i.get("last_read_at") or i.get("added_at") or "", reverse=True)

    # -- filtering / search ------------------------------------------------------

    def set_filter(self, text: str) -> None:
        self._filter = text.strip().lower()
        self._render()

    def set_crowdly_results(self, items: list[dict]) -> None:
        visible = bool(self._filter) and bool(items)
        self.crowdly_row.set_items(items if visible else [])
        self._crowdly_label.setVisible(visible)
        self.crowdly_row.setVisible(visible)

    def _filtered(self) -> list[dict]:
        if not self._filter:
            return self._items
        needle = self._filter

        def matches(item: dict) -> bool:
            hay = " ".join(str(item.get(k) or "") for k in ("title", "author", "subtitle", "language")).lower()
            return needle in hay

        return [i for i in self._items if matches(i)]

    # -- rendering ---------------------------------------------------------------

    def _render_sidebar(self) -> None:
        self.sidebar.blockSignals(True)
        self.sidebar.clear()

        def header(text: str) -> None:
            item = QListWidgetItem(text.upper(), self.sidebar)
            item.setFlags(Qt.ItemFlag.NoItemFlags)
            font = item.font()
            font.setBold(True)
            font.setPointSizeF(max(7.0, font.pointSizeF() * 0.8))
            item.setFont(font)

        def entry(key: str, label: str, kind: str, count: int | None = None, drag: bool = False) -> None:
            text = label + (f"  ({count})" if count is not None else "")
            item = QListWidgetItem(text, self.sidebar)
            item.setData(KEY_ROLE, key)
            item.setData(KIND_ROLE, kind)
            flags = Qt.ItemFlag.ItemIsEnabled | Qt.ItemFlag.ItemIsSelectable
            if kind == "manual":
                flags |= Qt.ItemFlag.ItemIsDropEnabled
            if drag:
                flags |= Qt.ItemFlag.ItemIsDragEnabled
            item.setFlags(flags)

        header(self.tr("This computer"))
        counts = {key: len(self._local_items(key)) for key in LOCAL_VIEWS}
        for key in LOCAL_VIEWS:
            entry(key, self.view_name(key), "local", counts[key])
        header(self.tr("Crowdly"))
        system_counts = {s.get("key"): s.get("count") for s in self._system}
        for key in STATUS_SYSTEM_KEYS:
            entry(key, system_shelf_name(key), "system", system_counts.get(key))
        header(self.tr("My shelves"))
        for shelf in self._custom:
            mark = "⚙ " if shelf.get("kind") == "smart" else ""
            entry(shelf["id"], mark + (shelf.get("name") or ""), shelf.get("kind") or "manual", shelf.get("count"), drag=True)
        self.sidebar.blockSignals(False)
        self._mark_selected()

    def _mark_selected(self) -> None:
        for i in range(self.sidebar.count()):
            item = self.sidebar.item(i)
            if item.data(KEY_ROLE) == self._current:
                self.sidebar.setCurrentItem(item)
                return

    def _render(self) -> None:
        key = self._current
        shelf = self._shelf(key)
        self._title.setText(self.view_name(key))
        items = self._filtered()
        self.view.set_items(items)
        self.view.reorder_enabled = bool(
            shelf and shelf.get("kind") == "manual" and shelf.get("sort") == "manual" and not self._filter
        )

        # Sort options: local views sort here; account shelves keep their own.
        self._sort.blockSignals(True)
        self._sort.clear()
        if key in LOCAL_VIEWS and key != "local:continue":
            for s in SORTS:
                self._sort.addItem(sort_label(self, s), s)
            self._sort.setCurrentIndex(max(0, self._sort.findData(self._local_sort)))
        elif shelf is not None:
            for s in (SORTS if shelf.get("kind") == "smart" else ("manual", *SORTS)):
                self._sort.addItem(sort_label(self, s), s)
            self._sort.setCurrentIndex(max(0, self._sort.findData(shelf.get("sort"))))
        self._sort.blockSignals(False)
        has_sort = self._sort.count() > 0
        self._sort.setVisible(has_sort)
        self._sort_label.setVisible(has_sort)

        if shelf is not None and shelf.get("kind") == "smart":
            hint = self.tr("This smart shelf fills itself from its rules.")
        elif not items and self._filter:
            hint = self.tr("Nothing here matches your search.")
        elif not items and key == "local:continue":
            hint = self.tr("Books and stories you have started appear here.")
        elif not items and key in LOCAL_VIEWS:
            hint = ""
        elif not items:
            hint = self.tr("This shelf is empty. Drag a book or story onto it, or use \"Add to shelf\".")
        else:
            hint = ""
        self._hint.setText(hint)
        self._hint.setVisible(bool(hint))
        show_drop_zone = not items and not self._filter and key in ("local:books", "local:audio")
        self._body.setCurrentWidget(self._empty if show_drop_zone else self.view)

    def set_view_mode(self, mode: str, *, emit: bool = False) -> None:
        if mode not in ("grid", "list"):
            mode = "grid"
        self._view_mode = mode
        (self._btn_grid if mode == "grid" else self._btn_list).setChecked(True)
        self.view.set_mode(mode)
        if emit:
            self.viewModeChanged.emit(mode)

    def view_mode(self) -> str:
        return self._view_mode

    def scroll_value(self) -> int:
        return self.view.verticalScrollBar().value()

    def set_scroll_value(self, value: int) -> None:
        self.view.verticalScrollBar().setValue(int(value))

    # -- actions -----------------------------------------------------------------

    def _sidebar_clicked(self, item: QListWidgetItem) -> None:
        key = item.data(KEY_ROLE)
        if key:
            self.select(key)

    def _sort_changed(self) -> None:
        value = self._sort.currentData()
        if self._current in LOCAL_VIEWS:
            self._local_sort = value
            self._items = self._local_items(self._current)
            self._render()
            return
        shelf = self._shelf(self._current)
        if shelf is not None:
            shelf_id = shelf["id"]
            self._call(lambda c: c.update_shelf(shelf_id, sort=value), select=shelf_id)

    def _call(self, fn, *, reload: bool = True, select=None) -> None:
        """Apply *fn* to the shelf store, then re-render."""

        result = fn(self._store)
        if reload:
            target = select(result) if callable(select) else select
            self.refresh(target)

    def new_shelf(self) -> None:
        name, ok = QInputDialog.getText(self, self.tr("New shelf"), self.tr("Shelf name:"))
        name = (name or "").strip()
        if ok and name:
            self._call(lambda c: c.create_shelf(name), select=lambda shelf: (shelf or {}).get("id"))

    def new_smart_shelf(self) -> None:
        dialog = SmartShelfDialog(self)
        if dialog.exec():
            data = dialog.result_data()
            self._call(
                lambda c: c.create_shelf(data["name"], kind="smart", rules=data["rules"], sort=data["sort"]),
                select=lambda shelf: (shelf or {}).get("id"),
            )

    def _shelf_context_menu(self, pos) -> None:
        item = self.sidebar.itemAt(pos)
        if item is None:
            return
        shelf = self._shelf(item.data(KEY_ROLE))
        if shelf is None:
            return
        shelf_id = shelf["id"]
        menu = QMenu(self)
        rename = menu.addAction(self.tr("Rename…"))
        edit_rules = menu.addAction(self.tr("Edit rules…")) if shelf.get("kind") == "smart" else None
        menu.addSeparator()
        delete = menu.addAction(self.tr("Delete shelf"))
        chosen = menu.exec(self.sidebar.mapToGlobal(pos))
        if chosen is rename:
            name, ok = QInputDialog.getText(self, self.tr("Rename shelf"), self.tr("Shelf name:"), text=shelf.get("name") or "")
            name = (name or "").strip()
            if ok and name:
                self._call(lambda c: c.update_shelf(shelf_id, name=name), select=shelf_id)
        elif edit_rules is not None and chosen is edit_rules:
            dialog = SmartShelfDialog(self, name=shelf.get("name") or "", rules=shelf.get("rules"), sort=shelf.get("sort") or "title")
            if dialog.exec():
                data = dialog.result_data()
                self._call(
                    lambda c: c.update_shelf(shelf_id, name=data["name"], rules=data["rules"], sort=data["sort"]),
                    select=shelf_id,
                )
        elif chosen is delete:
            answer = QMessageBox.question(
                self,
                self.tr("Delete shelf"),
                self.tr("Delete the shelf \"{name}\"? The books and stories on it are not deleted.").format(
                    name=shelf.get("name")
                ),
            )
            if answer == QMessageBox.StandardButton.Yes:
                if self._current == shelf_id:
                    self._current = "local:books"
                self._call(lambda c: c.delete_shelf(shelf_id), select=self._current)

    def remove_from_current_shelf(self, item: dict) -> None:
        shelf = self._shelf(self._current)
        if shelf is None or not item.get("entry_id"):
            return
        shelf_id, entry_id = shelf["id"], item["entry_id"]
        self._call(lambda c: c.remove_from_shelf(shelf_id, entry_id), select=shelf_id)

    def current_shelf_is_manual(self) -> bool:
        shelf = self._shelf(self._current)
        return bool(shelf and shelf.get("kind") == "manual")

    def _card_dropped_on_shelf(self, shelf_id: str, payload: dict) -> None:
        item_type = payload.get("type")
        # Books go on shelves by their local id, so they can be shelved
        # before they are synced.
        ref = payload.get("local_id") if item_type == "library_item" else payload.get("id")
        if not item_type or not ref:
            return
        self._store.add_to_shelf(shelf_id, item_type, ref, title=payload.get("title") or "")
        name = (self._shelf(shelf_id) or {}).get("name", "")
        self.statusMessage.emit(self.tr("Added to \"{shelf}\"").format(shelf=name))
        self.refresh()

    def _shelves_reordered(self, ids: list) -> None:
        order = {sid: i for i, sid in enumerate(ids)}
        self._custom.sort(key=lambda s: order.get(s.get("id"), 0))
        self._render_sidebar()
        self._call(lambda c: c.reorder_shelves(ids), reload=False)

    def _items_reordered(self, items: list) -> None:
        shelf = self._shelf(self._current)
        if shelf is None:
            return
        self._items = items
        entry_ids = [i.get("entry_id") for i in items if i.get("entry_id")]
        shelf_id = shelf["id"]
        self._call(lambda c: c.reorder_shelf_items(shelf_id, entry_ids), reload=False)


class _DropZone(QLabel):
    """Empty-library state that also accepts dropped files."""

    filesDropped = Signal(list)

    def __init__(self, parent: QWidget | None = None) -> None:
        super().__init__(parent)
        self.setAlignment(Qt.AlignmentFlag.AlignCenter)
        self.setWordWrap(True)
        self.setAcceptDrops(True)
        self.setStyleSheet("border: 2px dashed #b9b9c9; border-radius: 12px; color: #666; padding: 24px;")

    def retranslate(self) -> None:
        self.setText(
            self.tr(
                "Drop EPUB, PDF, audio or text files here, or use \"+ Add books\".\n"
                "Your books stay private to you."
            )
        )

    def dragEnterEvent(self, event) -> None:  # pragma: no cover - UI wiring
        if event.mimeData().hasUrls():
            event.acceptProposedAction()

    def dropEvent(self, event) -> None:  # pragma: no cover - UI wiring
        paths = [u.toLocalFile() for u in event.mimeData().urls() if u.isLocalFile()]
        if paths:
            self.filesDropped.emit(paths)
        event.acceptProposedAction()
