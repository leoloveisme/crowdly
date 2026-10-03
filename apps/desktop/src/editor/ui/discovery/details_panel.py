"""Side panel with a card's details: cover, title, author, progress, actions."""

from __future__ import annotations

from typing import Callable

from PySide6.QtCore import QSize, Qt, Signal
from PySide6.QtWidgets import (
    QHBoxLayout,
    QLabel,
    QMenu,
    QProgressBar,
    QPushButton,
    QScrollArea,
    QToolButton,
    QVBoxLayout,
    QWidget,
)

from .cards import CoverProvider

DETAILS_COVER = QSize(180, 270)


class DetailsPanel(QWidget):
    closeRequested = Signal()

    def __init__(self, covers: CoverProvider, parent: QWidget | None = None) -> None:
        super().__init__(parent)
        self._covers = covers
        self._item: dict | None = None
        self.setMinimumWidth(260)
        self.setMaximumWidth(360)

        outer = QVBoxLayout(self)
        outer.setContentsMargins(8, 8, 8, 8)
        top = QHBoxLayout()
        top.addStretch(1)
        self._btn_close = QToolButton(self)
        self._btn_close.setText("✕")
        self._btn_close.setAutoRaise(True)
        self._btn_close.clicked.connect(self.closeRequested)
        top.addWidget(self._btn_close)
        outer.addLayout(top)

        scroll = QScrollArea(self)
        scroll.setWidgetResizable(True)
        scroll.setFrameShape(QScrollArea.Shape.NoFrame)
        body = QWidget(scroll)
        layout = QVBoxLayout(body)
        layout.setContentsMargins(0, 0, 0, 0)
        self._cover = QLabel(body)
        self._cover.setAlignment(Qt.AlignmentFlag.AlignCenter)
        layout.addWidget(self._cover)
        self._title = QLabel(body)
        self._title.setWordWrap(True)
        font = self._title.font()
        font.setBold(True)
        font.setPointSizeF(font.pointSizeF() * 1.3)
        self._title.setFont(font)
        self._title.setTextInteractionFlags(Qt.TextInteractionFlag.TextSelectableByMouse)
        layout.addWidget(self._title)
        self._meta = QLabel(body)
        self._meta.setWordWrap(True)
        self._meta.setStyleSheet("color: #777;")
        layout.addWidget(self._meta)
        self._progress = QProgressBar(body)
        self._progress.setRange(0, 100)
        self._progress.setTextVisible(True)
        self._progress.setMaximumHeight(14)
        layout.addWidget(self._progress)

        self._actions = QVBoxLayout()
        self._btn_primary = QPushButton(body)
        self._btn_primary.setDefault(True)
        self._actions.addWidget(self._btn_primary)
        self._btn_shelf = QToolButton(body)
        self._btn_shelf.setPopupMode(QToolButton.ToolButtonPopupMode.InstantPopup)
        self._btn_shelf.setToolButtonStyle(Qt.ToolButtonStyle.ToolButtonTextOnly)
        self._btn_shelf.setSizePolicy(self._btn_primary.sizePolicy())
        self._actions.addWidget(self._btn_shelf)
        self._extra_box = QVBoxLayout()
        self._actions.addLayout(self._extra_box)
        layout.addLayout(self._actions)

        self._description = QLabel(body)
        self._description.setWordWrap(True)
        self._description.setTextInteractionFlags(Qt.TextInteractionFlag.TextSelectableByMouse)
        self._description.setAlignment(Qt.AlignmentFlag.AlignTop)
        layout.addWidget(self._description)
        layout.addStretch(1)
        scroll.setWidget(body)
        outer.addWidget(scroll, 1)

        self._primary_cb: Callable[[], None] | None = None
        self._btn_primary.clicked.connect(lambda: self._primary_cb and self._primary_cb())
        self.shelf_label = "Add to shelf"

    def item(self) -> dict | None:
        return self._item

    def show_card(
        self,
        item: dict,
        *,
        meta: str,
        primary: tuple[str, Callable[[], None]] | None,
        shelf_menu: QMenu | None,
        extra: list[tuple[str, Callable[[], None]]] | None = None,
        description: str = "",
    ) -> None:
        self._item = item
        self._cover.setPixmap(self._covers.pixmap(item, DETAILS_COVER))
        self._title.setText(item.get("title") or "")
        self._meta.setText(meta)
        self._meta.setVisible(bool(meta))
        progress = int(round(float(item.get("progress") or 0)))
        self._progress.setValue(progress)
        self._progress.setVisible(progress > 0)
        if primary:
            self._btn_primary.setText(primary[0])
            self._primary_cb = primary[1]
        self._btn_primary.setVisible(primary is not None)
        old = self._btn_shelf.menu()
        self._btn_shelf.setMenu(shelf_menu)
        self._btn_shelf.setText(self.shelf_label + " ▾")
        self._btn_shelf.setVisible(shelf_menu is not None)
        if old is not None and old is not shelf_menu:
            old.deleteLater()
        while self._extra_box.count():
            widget = self._extra_box.takeAt(0).widget()
            if widget is not None:
                widget.deleteLater()
        for label, callback in extra or []:
            button = QPushButton(label, self)
            button.setFlat(True)
            button.setStyleSheet("text-align: left;")
            button.clicked.connect(lambda _=False, cb=callback: cb())
            self._extra_box.addWidget(button)
        self._description.setText(description)
        self._description.setVisible(bool(description))
        self.show()

    def refresh_cover(self, key: str) -> None:
        if self._item is not None and self._item.get("key") == key:
            self._cover.setPixmap(self._covers.pixmap(self._item, DETAILS_COVER))
