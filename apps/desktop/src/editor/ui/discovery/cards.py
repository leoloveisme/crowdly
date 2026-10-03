"""Cover cards: the building block of Browse Crowdly and My Library.

A card is a plain dict (the shape of a ``/shelves/:key/items`` or
``/discover/home`` item, plus ``key`` and, for books on this computer,
``local_id``)::

    {"key": "story:<id>", "type": "story", "id": "<id>", "title": "...",
     "subtitle": "...", "author": "...", "language": "de", "format": "story",
     "progress": 42.0, "cover_url": "/uploads/...", "local_id": "<library id>"}

``CardView`` shows cards as a wrapping grid, a list, or a single horizontal
row (Browse). ``CoverProvider`` supplies cover pixmaps: the book's own
thumbnail, a downloaded Crowdly cover, or a generated placeholder.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Callable

from PySide6.QtCore import (
    QAbstractListModel,
    QMimeData,
    QModelIndex,
    QObject,
    QPoint,
    QRect,
    QSize,
    Qt,
    Signal,
)
from PySide6.QtGui import QColor, QDrag, QFont, QFontMetrics, QPainter, QPalette, QPixmap
from PySide6.QtWidgets import QAbstractItemView, QListView, QStyle, QStyledItemDelegate

from ...library.covers import RemoteCoverCache, placeholder_cover
from .tasks import run_in_background

CARD_MIME = "application/x-crowdly-card"
GRID_COVER = QSize(128, 192)
ROW_COVER = QSize(120, 180)
LIST_COVER = QSize(40, 60)


def card_key(item: dict) -> str:
    return item.get("key") or f"{item.get('type')}:{item.get('id') or item.get('local_id')}"


def card_second_line(item: dict) -> str:
    """Author, else chapter/slugline; this tells same-titled stories apart."""

    return item.get("author") or item.get("subtitle") or ""


class CoverProvider(QObject):
    """Cover pixmaps for cards, loaded once and cached by card key."""

    coverReady = Signal(str)

    def __init__(
        self,
        remote_cache: RemoteCoverCache,
        api_base: Callable[[], str],
        local_cover: Callable[[dict], Path | None],
        parent: QObject | None = None,
    ) -> None:
        super().__init__(parent)
        self._remote = remote_cache
        self._api_base = api_base
        self._local_cover = local_cover
        self._pixmaps: dict[tuple[str, int, int], QPixmap] = {}
        self._loading: set[str] = set()

    def _absolute(self, url: str) -> str:
        if url.startswith(("http://", "https://")):
            return url
        return self._api_base().rstrip("/") + "/" + url.lstrip("/")

    def pixmap(self, item: dict, size: QSize) -> QPixmap:
        key = card_key(item)
        cache_key = (key, size.width(), size.height())
        cached = self._pixmaps.get(cache_key)
        if cached is not None:
            return cached
        source: QPixmap | None = None
        local = self._local_cover(item)
        if local is not None:
            source = QPixmap(str(local))
        elif item.get("cover_url"):
            url = self._absolute(item["cover_url"])
            path = self._remote.cached(url)
            if path is not None:
                source = QPixmap(str(path))
            elif key not in self._loading:
                self._loading.add(key)

                def done(_path, key=key) -> None:
                    self._loading.discard(key)
                    for k in [k for k in self._pixmaps if k[0] == key]:
                        del self._pixmaps[k]
                    self.coverReady.emit(key)

                run_in_background(lambda url=url: self._remote.fetch(url), done, lambda _m: None)
        if source is None or source.isNull():
            label = {"story": "Crowdly", "screenplay": "Crowdly"}.get(item.get("format") or "", "")
            if not label:
                label = (item.get("format") or "").upper()
            pixmap = placeholder_cover(item.get("title") or "", key, size, label=label)
        else:
            pixmap = source.scaled(
                size, Qt.AspectRatioMode.KeepAspectRatioByExpanding, Qt.TransformationMode.SmoothTransformation
            )
            if pixmap.size() != size:
                x = max(0, (pixmap.width() - size.width()) // 2)
                y = max(0, (pixmap.height() - size.height()) // 2)
                pixmap = pixmap.copy(x, y, size.width(), size.height())
        self._pixmaps[cache_key] = pixmap
        return pixmap

    def forget(self, key: str) -> None:
        for k in [k for k in self._pixmaps if k[0] == key]:
            del self._pixmaps[k]


class CardModel(QAbstractListModel):
    ItemRole = Qt.ItemDataRole.UserRole + 1

    def __init__(self, parent: QObject | None = None) -> None:
        super().__init__(parent)
        self._items: list[dict] = []

    def set_items(self, items: list[dict]) -> None:
        self.beginResetModel()
        self._items = [dict(i, key=card_key(i)) for i in items]
        self.endResetModel()

    def items(self) -> list[dict]:
        return list(self._items)

    def rowCount(self, parent: QModelIndex = QModelIndex()) -> int:  # noqa: B008
        return 0 if parent.isValid() else len(self._items)

    def data(self, index: QModelIndex, role: int = Qt.ItemDataRole.DisplayRole):
        if not index.isValid() or index.row() >= len(self._items):
            return None
        item = self._items[index.row()]
        if role == Qt.ItemDataRole.DisplayRole:
            return item.get("title") or ""
        if role == Qt.ItemDataRole.ToolTipRole:
            parts = [item.get("title") or "", card_second_line(item)]
            return "\n".join(p for p in parts if p)
        if role == self.ItemRole:
            return item
        return None

    def flags(self, index: QModelIndex):
        base = super().flags(index)
        if index.isValid():
            return base | Qt.ItemFlag.ItemIsDragEnabled
        return base | Qt.ItemFlag.ItemIsDropEnabled

    def refresh_key(self, key: str) -> None:
        for row, item in enumerate(self._items):
            if item.get("key") == key:
                idx = self.index(row)
                self.dataChanged.emit(idx, idx)

    def move(self, source: int, target: int) -> None:
        if source == target or not (0 <= source < len(self._items)):
            return
        target = max(0, min(target, len(self._items) - 1))
        self.beginResetModel()
        item = self._items.pop(source)
        self._items.insert(target, item)
        self.endResetModel()


class CardDelegate(QStyledItemDelegate):
    """Paints a card: cover, title, second line and a progress bar."""

    def __init__(self, covers: CoverProvider, view: "CardView") -> None:
        super().__init__(view)
        self._covers = covers
        self._view = view
        self.untitled = "Untitled"

    def _cover_size(self) -> QSize:
        mode = self._view.card_mode
        return {"grid": GRID_COVER, "row": ROW_COVER}.get(mode, LIST_COVER)

    def sizeHint(self, option, index) -> QSize:
        cover = self._cover_size()
        if self._view.card_mode == "list":
            return QSize(max(300, self._view.viewport().width() - 8), cover.height() + 12)
        return QSize(cover.width() + 16, cover.height() + 64)

    def paint(self, painter: QPainter, option, index) -> None:
        item = index.data(CardModel.ItemRole) or {}
        painter.save()
        painter.setRenderHint(QPainter.RenderHint.Antialiasing)
        rect = option.rect
        palette = option.palette
        selected = bool(option.state & QStyle.StateFlag.State_Selected)
        hovered = bool(option.state & QStyle.StateFlag.State_MouseOver)
        if selected or hovered:
            color = palette.color(QPalette.ColorRole.Highlight)
            color.setAlpha(60 if selected else 25)
            painter.fillRect(rect.adjusted(2, 2, -2, -2), color)

        cover_size = self._cover_size()
        pixmap = self._covers.pixmap(item, cover_size)
        list_mode = self._view.card_mode == "list"
        if list_mode:
            cover_rect = QRect(rect.left() + 6, rect.top() + 6, cover_size.width(), cover_size.height())
            text_rect = QRect(cover_rect.right() + 12, rect.top() + 6, rect.width() - cover_size.width() - 30, rect.height() - 12)
        else:
            cover_rect = QRect(rect.left() + 8, rect.top() + 6, cover_size.width(), cover_size.height())
            text_rect = QRect(rect.left() + 8, cover_rect.bottom() + 6, cover_size.width(), rect.bottom() - cover_rect.bottom() - 8)
        painter.drawPixmap(cover_rect, pixmap)
        painter.setPen(QColor(0, 0, 0, 40))
        painter.drawRect(cover_rect.adjusted(0, 0, -1, -1))

        progress = float(item.get("progress") or 0)
        if progress > 0:
            bar = QRect(cover_rect.left(), cover_rect.bottom() - 4, cover_rect.width(), 4)
            painter.fillRect(bar, QColor(0, 0, 0, 90))
            done = QRect(bar.left(), bar.top(), int(bar.width() * min(progress, 100) / 100), bar.height())
            painter.fillRect(done, QColor("#e2477a"))

        title = item.get("title") or ""
        title_font = QFont(option.font)
        title_font.setBold(True)
        painter.setFont(title_font)
        painter.setPen(palette.color(QPalette.ColorRole.Text) if title else QColor("#888888"))
        if not title:
            title_font.setItalic(True)
            painter.setFont(title_font)
            title = self.untitled
        fm = QFontMetrics(title_font)
        title_lines = 1 if list_mode else 2
        title_height = fm.lineSpacing() * title_lines
        title_rect = QRect(text_rect.left(), text_rect.top(), text_rect.width(), title_height)
        elided = title if title_lines > 1 else fm.elidedText(title, Qt.TextElideMode.ElideRight, text_rect.width())
        painter.drawText(title_rect, int(Qt.AlignmentFlag.AlignLeft | Qt.AlignmentFlag.AlignTop | Qt.TextFlag.TextWordWrap), elided)

        second = card_second_line(item)
        extra = []
        if list_mode:
            if item.get("subtitle") and item.get("subtitle") != second:
                extra.append(item["subtitle"])
            if item.get("language"):
                extra.append(item["language"])
            if progress > 0:
                extra.append(f"{int(round(progress))}%")
        small = QFont(option.font)
        small.setPointSizeF(max(7.0, option.font.pointSizeF() * 0.88))
        painter.setFont(small)
        painter.setPen(QColor("#777777"))
        sfm = QFontMetrics(small)
        line = " · ".join(p for p in [second, *extra] if p)
        if line:
            second_rect = QRect(text_rect.left(), title_rect.bottom() + 2, text_rect.width(), sfm.lineSpacing())
            painter.drawText(second_rect, int(Qt.AlignmentFlag.AlignLeft), sfm.elidedText(line, Qt.TextElideMode.ElideRight, text_rect.width()))
        painter.restore()


class CardView(QListView):
    """Cards as a grid (``grid``), a list (``list``) or one row (``row``)."""

    cardClicked = Signal(dict)
    cardActivated = Signal(dict)
    cardContextMenu = Signal(dict, QPoint)
    detailsRequested = Signal(dict)
    filesDropped = Signal(list)
    reordered = Signal(list)

    def __init__(self, covers: CoverProvider, mode: str = "grid", parent=None) -> None:
        super().__init__(parent)
        self.card_mode = mode
        self._covers = covers
        self.model_ = CardModel(self)
        self.setModel(self.model_)
        self.delegate = CardDelegate(covers, self)
        self.setItemDelegate(self.delegate)
        self.setMouseTracking(True)
        self.setSelectionMode(QAbstractItemView.SelectionMode.SingleSelection)
        self.setEditTriggers(QAbstractItemView.EditTrigger.NoEditTriggers)
        self.setDragEnabled(True)
        self.setAcceptDrops(True)
        self.setDropIndicatorShown(True)
        self.setDragDropMode(QAbstractItemView.DragDropMode.DragDrop)
        self.setDefaultDropAction(Qt.DropAction.CopyAction)
        self.accept_files = False
        self.reorder_enabled = False
        self.clicked.connect(lambda idx: self.cardClicked.emit(idx.data(CardModel.ItemRole) or {}))
        self.doubleClicked.connect(lambda idx: self.cardActivated.emit(idx.data(CardModel.ItemRole) or {}))
        self.setContextMenuPolicy(Qt.ContextMenuPolicy.CustomContextMenu)
        self.customContextMenuRequested.connect(self._context_menu)
        covers.coverReady.connect(self.model_.refresh_key)
        self.set_mode(mode)

    # -- configuration -----------------------------------------------------------

    def set_mode(self, mode: str) -> None:
        self.card_mode = mode
        self.setUniformItemSizes(True)
        if mode == "list":
            self.setViewMode(QListView.ViewMode.ListMode)
            self.setFlow(QListView.Flow.TopToBottom)
            self.setWrapping(False)
            self.setSpacing(1)
            self.setHorizontalScrollBarPolicy(Qt.ScrollBarPolicy.ScrollBarAlwaysOff)
        else:
            self.setViewMode(QListView.ViewMode.IconMode)
            self.setMovement(QListView.Movement.Static)
            self.setResizeMode(QListView.ResizeMode.Adjust)
            self.setSpacing(6)
            if mode == "row":
                self.setFlow(QListView.Flow.LeftToRight)
                self.setWrapping(False)
                self.setVerticalScrollBarPolicy(Qt.ScrollBarPolicy.ScrollBarAlwaysOff)
                self.setHorizontalScrollBarPolicy(Qt.ScrollBarPolicy.ScrollBarAsNeeded)
                self.setHorizontalScrollMode(QAbstractItemView.ScrollMode.ScrollPerPixel)
                hint = self.delegate.sizeHint(None, None)
                self.setFixedHeight(hint.height() + self.horizontalScrollBar().sizeHint().height() + 16)
            else:
                self.setFlow(QListView.Flow.LeftToRight)
                self.setWrapping(True)
                self.setHorizontalScrollBarPolicy(Qt.ScrollBarPolicy.ScrollBarAlwaysOff)
        self.scheduleDelayedItemsLayout()
        self.viewport().update()

    def set_items(self, items: list[dict]) -> None:
        self.model_.set_items(items)

    def items(self) -> list[dict]:
        return self.model_.items()

    def current_item(self) -> dict | None:
        idx = self.currentIndex()
        return idx.data(CardModel.ItemRole) if idx.isValid() else None

    # -- events ------------------------------------------------------------------

    def _context_menu(self, pos: QPoint) -> None:
        idx = self.indexAt(pos)
        if idx.isValid():
            self.setCurrentIndex(idx)
            self.cardContextMenu.emit(idx.data(CardModel.ItemRole) or {}, self.viewport().mapToGlobal(pos))

    def keyPressEvent(self, event) -> None:  # pragma: no cover - UI wiring
        if event.key() == Qt.Key.Key_Space and self.current_item():
            self.detailsRequested.emit(self.current_item())
            return
        if event.key() in (Qt.Key.Key_Return, Qt.Key.Key_Enter) and self.current_item():
            self.cardActivated.emit(self.current_item())
            return
        super().keyPressEvent(event)

    def wheelEvent(self, event) -> None:  # pragma: no cover - UI wiring
        # A row only scrolls sideways; vertical wheel movement scrolls the page.
        delta = event.angleDelta()
        if self.card_mode == "row" and abs(delta.y()) > abs(delta.x()):
            event.ignore()
            return
        super().wheelEvent(event)

    def startDrag(self, actions) -> None:  # pragma: no cover - UI wiring
        idx = self.currentIndex()
        if not idx.isValid():
            return
        item = idx.data(CardModel.ItemRole) or {}
        mime = QMimeData()
        mime.setData(CARD_MIME, json.dumps({k: item.get(k) for k in ("key", "type", "id", "local_id", "entry_id", "title")}).encode())
        drag = QDrag(self)
        drag.setMimeData(mime)
        drag.setPixmap(self._covers.pixmap(item, LIST_COVER))
        drag.exec(Qt.DropAction.CopyAction | Qt.DropAction.MoveAction)

    def dragEnterEvent(self, event) -> None:  # pragma: no cover - UI wiring
        mime = event.mimeData()
        if (self.accept_files and mime.hasUrls()) or (self.reorder_enabled and mime.hasFormat(CARD_MIME) and event.source() is self):
            event.acceptProposedAction()
        else:
            event.ignore()

    def dragMoveEvent(self, event) -> None:  # pragma: no cover - UI wiring
        self.dragEnterEvent(event)

    def dropEvent(self, event) -> None:  # pragma: no cover - UI wiring
        mime = event.mimeData()
        if self.accept_files and mime.hasUrls():
            paths = [u.toLocalFile() for u in mime.urls() if u.isLocalFile()]
            if paths:
                self.filesDropped.emit(paths)
            event.acceptProposedAction()
            return
        if self.reorder_enabled and event.source() is self and mime.hasFormat(CARD_MIME):
            source = self.currentIndex().row()
            target_idx = self.indexAt(event.position().toPoint())
            target = target_idx.row() if target_idx.isValid() else self.model_.rowCount() - 1
            self.model_.move(source, target)
            self.reordered.emit(self.model_.items())
            event.acceptProposedAction()
            return
        event.ignore()
