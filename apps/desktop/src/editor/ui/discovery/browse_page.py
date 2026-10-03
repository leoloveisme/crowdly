"""Browse Crowdly: the platform's main page as rows of cover cards.

Rows come from ``GET /discover/home`` (same sections and order as the web
home page, src/pages/Index.tsx), preceded by "Continue reading" from this
computer. "See all" and search results show a full grid.
"""

from __future__ import annotations

from PySide6.QtCore import QPoint, Qt, Signal
from PySide6.QtWidgets import (
    QHBoxLayout,
    QLabel,
    QPushButton,
    QScrollArea,
    QStackedWidget,
    QToolButton,
    QVBoxLayout,
    QWidget,
)

from .cards import CardView, CoverProvider

ROW_KEYS = (
    "continue",
    "favorites",
    "newest",
    "newest_screenplays",
    "most_popular",
    "most_popular_screenplays",
    "most_active_screenplays",
    "most_active",
    "living",
    "lived",
)


class _Row(QWidget):
    seeAll = Signal(str)

    def __init__(self, key: str, covers: CoverProvider, parent: QWidget) -> None:
        super().__init__(parent)
        self.key = key
        layout = QVBoxLayout(self)
        layout.setContentsMargins(0, 8, 0, 0)
        header = QHBoxLayout()
        self.title = QLabel(self)
        font = self.title.font()
        font.setBold(True)
        font.setPointSizeF(font.pointSizeF() * 1.2)
        self.title.setFont(font)
        header.addWidget(self.title)
        header.addStretch(1)
        self.see_all = QToolButton(self)
        self.see_all.setAutoRaise(True)
        self.see_all.clicked.connect(lambda: self.seeAll.emit(self.key))
        header.addWidget(self.see_all)
        layout.addLayout(header)
        self.view = CardView(covers, "row", self)
        self.view.setFrameShape(CardView.Shape.NoFrame)
        self.view.setStyleSheet("QListView { background: transparent; }")
        layout.addWidget(self.view)


class BrowsePage(QWidget):
    cardClicked = Signal(dict)
    cardActivated = Signal(dict)
    cardContextMenu = Signal(dict, QPoint)
    detailsRequested = Signal(dict)
    retryRequested = Signal()

    def __init__(self, covers: CoverProvider, parent: QWidget | None = None) -> None:
        super().__init__(parent)
        self._covers = covers
        self._row_items: dict[str, list[dict]] = {}
        self._grid_title = ""

        root = QVBoxLayout(self)
        root.setContentsMargins(0, 0, 0, 0)
        self._stack = QStackedWidget(self)
        root.addWidget(self._stack)

        # Rows -----------------------------------------------------------------
        self._scroll = QScrollArea(self._stack)
        self._scroll.setWidgetResizable(True)
        self._scroll.setFrameShape(QScrollArea.Shape.NoFrame)
        body = QWidget(self._scroll)
        self._rows_layout = QVBoxLayout(body)
        self._rows_layout.setContentsMargins(12, 4, 12, 12)
        self._status = QLabel(body)
        self._status.setWordWrap(True)
        self._rows_layout.addWidget(self._status)
        self._btn_retry = QPushButton(body)
        self._btn_retry.clicked.connect(self.retryRequested)
        self._btn_retry.setVisible(False)
        self._rows_layout.addWidget(self._btn_retry, 0, Qt.AlignmentFlag.AlignLeft)
        self._rows: dict[str, _Row] = {}
        for key in ROW_KEYS:
            row = _Row(key, covers, body)
            row.seeAll.connect(self.show_row_grid)
            self._wire(row.view)
            row.setVisible(False)
            self._rows_layout.addWidget(row)
            self._rows[key] = row
        self._rows_layout.addStretch(1)
        self._scroll.setWidget(body)
        self._stack.addWidget(self._scroll)

        # Grid ("See all" / search) ----------------------------------------------
        self._grid_page = QWidget(self._stack)
        grid_layout = QVBoxLayout(self._grid_page)
        grid_layout.setContentsMargins(12, 4, 12, 4)
        header = QHBoxLayout()
        self._btn_back = QToolButton(self._grid_page)
        self._btn_back.setAutoRaise(True)
        self._btn_back.clicked.connect(self.show_rows)
        header.addWidget(self._btn_back)
        self._grid_label = QLabel(self._grid_page)
        font = self._grid_label.font()
        font.setBold(True)
        font.setPointSizeF(font.pointSizeF() * 1.2)
        self._grid_label.setFont(font)
        header.addWidget(self._grid_label, 1)
        grid_layout.addLayout(header)
        self._grid_hint = QLabel(self._grid_page)
        grid_layout.addWidget(self._grid_hint)
        self.grid = CardView(covers, "grid", self._grid_page)
        self._wire(self.grid)
        grid_layout.addWidget(self.grid, 1)
        self._stack.addWidget(self._grid_page)

        self.titles: dict[str, str] = {}
        self.retranslate()

    def _wire(self, view: CardView) -> None:
        view.cardClicked.connect(self.cardClicked)
        view.cardActivated.connect(self.cardActivated)
        view.cardContextMenu.connect(self.cardContextMenu)
        view.detailsRequested.connect(self.detailsRequested)

    # -- public ------------------------------------------------------------------

    def retranslate(self) -> None:
        self.titles = {
            "continue": self.tr("Continue reading"),
            "favorites": self.tr("Favorites"),
            "newest": self.tr("Newest stories"),
            "newest_screenplays": self.tr("Newest screenplays"),
            "most_popular": self.tr("Most popular stories"),
            "most_popular_screenplays": self.tr("Most popular screenplays"),
            "most_active_screenplays": self.tr("Most active screenplays"),
            "most_active": self.tr("Most active stories"),
            "living": self.tr("Living"),
            "lived": self.tr("Lived"),
        }
        for key, row in self._rows.items():
            row.title.setText(self.titles[key])
            row.see_all.setText(self.tr("See all ›"))
        self._btn_back.setText(self.tr("‹ Back"))
        self._btn_retry.setText(self.tr("Try again"))
        self.grid.delegate.untitled = self.tr("Untitled")
        for row in self._rows.values():
            row.view.delegate.untitled = self.tr("Untitled")
        if self._grid_title in self.titles:
            self._grid_label.setText(self.titles[self._grid_title])

    def set_loading(self) -> None:
        self._status.setText(self.tr("Loading Crowdly…"))
        self._status.setVisible(True)
        self._btn_retry.setVisible(False)

    def set_error(self, message: str) -> None:
        self._status.setText(self.tr("Crowdly could not be reached: {error}").format(error=message))
        self._status.setVisible(True)
        self._btn_retry.setVisible(True)

    def set_rows(self, rows: dict[str, list[dict]]) -> None:
        """Show rows keyed like ROW_KEYS; empty rows are hidden."""

        self._row_items.update(rows)
        self._status.setVisible(False)
        self._btn_retry.setVisible(False)
        for key, row in self._rows.items():
            items = self._row_items.get(key) or []
            row.view.set_items(items)
            row.setVisible(bool(items))

    def show_rows(self) -> None:
        self._grid_title = ""
        self._stack.setCurrentWidget(self._scroll)

    def show_row_grid(self, key: str) -> None:
        self._grid_title = key
        self.show_grid(self.titles.get(key, key), self._row_items.get(key) or [])

    def show_grid(self, title: str, items: list[dict], hint: str = "") -> None:
        self._grid_label.setText(title)
        self._grid_hint.setText(hint)
        self._grid_hint.setVisible(bool(hint))
        self.grid.set_items(items)
        self._stack.setCurrentWidget(self._grid_page)

    def showing_grid(self) -> bool:
        return self._stack.currentWidget() is self._grid_page

    def scroll_value(self) -> int:
        return self._scroll.verticalScrollBar().value()

    def set_scroll_value(self, value: int) -> None:
        self._scroll.verticalScrollBar().setValue(int(value))
