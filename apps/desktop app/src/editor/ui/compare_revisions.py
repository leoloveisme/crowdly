"""Full-screen compare revisions workspace.

This module provides a dedicated window where the user can:

- See a list of recorded revisions for the current document.
- Select 2–4 revisions to compare.
- Choose between several tiling/layout presets depending on how many
  revisions are selected.
- View each revision in its own read-only tile and copy text from it.

Revision content is sourced from the local versioning queue under the
per-directory ``.crowdly`` folder.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from pathlib import Path
from typing import List, Sequence

from PySide6.QtCore import Qt, QRectF, QSize, QEvent
from PySide6.QtGui import QIcon, QPixmap, QPainter, QPen, QColor, QBrush
from PySide6.QtWidgets import (
    QButtonGroup,
    QGridLayout,
    QHBoxLayout,
    QLabel,
    QListWidget,
    QListWidgetItem,
    QMainWindow,
    QMessageBox,
    QPushButton,
    QTextEdit,
    QVBoxLayout,
    QWidget,
    QToolButton,
    QSplitter,
)

from ..versioning import local_queue


logger = logging.getLogger(__name__)
# Ensure we get logs when running the app from a terminal without any
# explicit logging configuration.
if not logging.getLogger().handlers:
    logging.basicConfig(level=logging.INFO)


@dataclass
class RevisionSnapshot:
    """Single decoded revision snapshot for comparison."""

    index: int
    saved_at: str | None
    body_md: str
    body_html: str | None


# Layout presets for 2, 3, and 4 revisions. Each preset is a list of
# geometry tuples (row, column, row_span, col_span) for each tile index.
_LAYOUTS: dict[int, List[List[tuple[int, int, int, int]]]] = {
    2: [
        # 0: two horizontal tiles (top/bottom)
        [(0, 0, 1, 1), (1, 0, 1, 1)],
        # 1: two vertical tiles (left/right)
        [(0, 0, 1, 1), (0, 1, 1, 1)],
    ],
    3: [
        # 0: one wide on top, two below
        [(0, 0, 1, 2), (1, 0, 1, 1), (1, 1, 1, 1)],
        # 1: two on top, one large below
        [(0, 0, 1, 1), (0, 1, 1, 1), (1, 0, 1, 2)],
        # 2: two stacked left, one tall right
        [(0, 0, 1, 1), (1, 0, 1, 1), (0, 1, 2, 1)],
        # 3: one tall left, two stacked right
        [(0, 0, 2, 1), (0, 1, 1, 1), (1, 1, 1, 1)],
    ],
    4: [
        # 0: 2x2 grid (1 2 / 3 4)
        [(0, 0, 1, 1), (0, 1, 1, 1), (1, 0, 1, 1), (1, 1, 1, 1)],
        # 1: four vertical columns (1 2 3 4)
        [(0, 0, 1, 1), (0, 1, 1, 1), (0, 2, 1, 1), (0, 3, 1, 1)],
        # 2: four horizontal rows (1 / 2 / 3 / 4)
        [(0, 0, 1, 1), (1, 0, 1, 1), (2, 0, 1, 1), (3, 0, 1, 1)],
        # 3 
        [(0, 0, 1, 2), (1, 0, 1, 2), (2, 0, 1, 1), (2, 1, 1, 1)],
        # 4: 1 and 2 on top; 3 middle full width; 4 bottom full width
        #    row0: 1 left, 2 right
        #    row1: 3 spans both columns
        #    row2: 4 spans both columns
        [(0, 0, 1, 1), (0, 1, 1, 1), (1, 0, 1, 2), (2, 0, 1, 2)],
        # 5: 1 and 2 stacked on the left; 3 and 4 tall on the right
        #    row0: 1 left; 3 middle; 4 right
        #    row1: 2 left; 3 continues; 4 continues
        [(0, 0, 1, 1), (1, 0, 1, 1), (0, 1, 2, 1), (0, 2, 2, 1)],


        # 6: 1 and 2 stacked on the left; 3 and 4 tall on the right
        #    row0: 1 left; 3 middle; 4 right
        #    row1: 2 left; 3 continues; 4 continues
        [(0, 0, 2, 1), (0, 1, 2, 1), (0, 2, 1, 1), (1, 2, 1, 1)],



        # 7: one tall left, three stacked right
        [(0, 0, 3, 1), (0, 1, 1, 1), (1, 1, 1, 1), (2, 1, 1, 1)],
        # 8: three stacked left, one tall right
        [(0, 0, 1, 1), (1, 0, 1, 1), (2, 0, 1, 1), (0, 1, 3, 1)],
        # 9: one large top, three in a row below
        [(0, 0, 1, 3), (1, 0, 1, 1), (1, 1, 1, 1), (1, 2, 1, 1)],

        # 10: one large top, three in a row below
        [(0, 0, 1, 1), (0, 1, 1, 1), (0, 2, 1, 1), (1, 0, 1, 3)],

        # 11: 1 wide on top; 2,3 stacked left; 4 tall on the right
        #    row0: 1 spans both columns
        #    row1: 2 left, 4 right (tall)
        #    row2: 3 left, 4 continues
        [(0, 0, 1, 2), (1, 0, 1, 1), (2, 0, 1, 1), (1, 1, 2, 1)],

        # 12: 1 wide on top; 2,3 stacked left; 4 tall on the right
        #    row0: 1 spans both columns
        #    row1: 2 left, 4 right (tall)
        #    row2: 3 left, 4 continues
        [(0, 0, 1, 2), (1, 0, 2, 1), (1, 1, 1, 1), (2, 1, 1, 1)],



        # 13: 1 wide on top; 2,3 stacked left; 4 tall on the right
        #    row0: 1 spans both columns
        #    row1: 2 left, 4 right (tall)
        #    row2: 3 left, 4 continues
        [(0, 0, 1, 1), (1, 0, 1, 1), (0, 1, 2, 1), (2, 0, 1, 2)],

        # 14: 1 wide on top; 2,3 stacked left; 4 tall on the right
        #    row0: 1 spans both columns
        #    row1: 2 left, 4 right (tall)
        #    row2: 3 left, 4 continues
        [(0, 0, 2, 1), (0, 1, 1, 1), (1, 1, 1, 1), (2, 0, 1, 2)],

        # 15: 1 tall on the left; 2 and 3 on top row; 4 wide under 2+3
        #    row0: 1 tall left; 2 middle; 3 right
        #    row1: 1 continues; 4 spans middle+right
        [(0, 0, 2, 1), (0, 1, 1, 1), (0, 2, 1, 1), (1, 1, 1, 2)],

        # 16: 1 tall on the left; 2 and 3 on top row; 4 wide under 2+3
        #    row0: 1 tall left; 2 middle; 3 right
        #    row1: 1 continues; 4 spans middle+right
        [(0, 0, 2, 1), (0, 1, 1, 2), (1, 1, 1, 1), (1, 2, 1, 1)],

        # 17: 1 tall on the left; 2 and 3 on top row; 4 wide under 2+3
        #    row0: 1 tall left; 2 middle; 3 right
        #    row1: 1 continues; 4 spans middle+right
        [(0, 0, 1, 1), (0, 1, 1, 1), (0, 2, 2, 1), (1, 0, 1, 2)],

        # 18: 1 tall on the left; 2 and 3 on top row; 4 wide under 2+3
        #    row0: 1 tall left; 2 middle; 3 right
        #    row1: 1 continues; 4 spans middle+right
        [(0, 0, 1, 2), (1, 0, 1, 1), (1, 1, 1, 1), (0, 2, 2, 1)],

    ],
}


class CompareRevisionsWindow(QMainWindow):
    """Full-width, resizable window for comparing document revisions.

    The window opens maximised by default but can be resized, minimised,
    and restored like any normal top-level window.
    """

    def __init__(self, *, document_path: Path, parent: QWidget | None = None) -> None:
        super().__init__(parent)

        self._document_path = document_path
        self._snapshots: list[RevisionSnapshot] = self._load_snapshots(document_path)
        self._current_count: int | None = None
        self._current_layout_index: int = 0
        self._last_selected_indices: list[int] = []

        self.setWindowTitle(self.tr("Compare revisions"))
        self.setAttribute(Qt.WidgetAttribute.WA_DeleteOnClose)

        self._build_ui()

        # Open maximised to approximate a full-width/height workspace while
        # still allowing normal window management (resize, minimise, move).
        self.setWindowState(self.windowState() | Qt.WindowState.WindowMaximized)

        if not self._snapshots:
            QMessageBox.information(
                self,
                self.tr("Compare revisions"),
                self.tr("No revisions have been recorded yet for this document."),
            )

    # Internal helpers -----------------------------------------------------

    def _load_snapshots(self, path: Path) -> list[RevisionSnapshot]:
        """Decode all full snapshots from the local versioning queue."""

        decoded: list[RevisionSnapshot] = []
        try:
            payloads = local_queue.load_full_snapshots(path)
        except AttributeError:
            # Older versions may not provide a helper; fall back to an empty list
            # rather than crashing the UI.
            return []
        except Exception:
            return []

        for idx, payload in enumerate(payloads):
            if not isinstance(payload, dict):
                continue
            saved_at = payload.get("saved_at")
            body_md = payload.get("body_md")
            if not isinstance(body_md, str):
                continue
            body_html = payload.get("body_html") if isinstance(payload.get("body_html"), str) else None
            decoded.append(
                RevisionSnapshot(
                    index=idx,
                    saved_at=saved_at if isinstance(saved_at, str) else None,
                    body_md=body_md,
                    body_html=body_html,
                )
            )

        logger.info(
            "compare_revisions: loaded %d snapshots for %s",
            len(decoded),
            path,
        )
        return decoded

    def _build_ui(self) -> None:
        central = QWidget(self)
        root_layout = QHBoxLayout(central)
        root_layout.setContentsMargins(8, 8, 8, 8)
        root_layout.setSpacing(8)

        # Left panel: revision list + compare button.
        left_panel = QWidget(central)
        left_layout = QVBoxLayout(left_panel)
        left_layout.setContentsMargins(0, 0, 0, 0)
        left_layout.setSpacing(4)

        title = QLabel(left_panel)
        title.setText(self.tr("Revisions for: {name}").format(name=self._document_path.name))
        left_layout.addWidget(title)

        self._revision_list = QListWidget(left_panel)
        self._revision_list.itemChanged.connect(self._on_item_changed)
        left_layout.addWidget(self._revision_list, 1)

        self._info_label = QLabel(left_panel)
        self._info_label.setWordWrap(True)
        self._info_label.setText(self.tr("Select 2–4 revisions to enable comparison."))
        left_layout.addWidget(self._info_label)

        self._compare_button = QPushButton(self.tr("Compare selected"), left_panel)
        self._compare_button.setEnabled(False)
        self._compare_button.clicked.connect(self._on_compare_clicked)
        left_layout.addWidget(self._compare_button)

        root_layout.addWidget(left_panel, 0)

        # Populate revision list.
        for snap in self._snapshots:
            label = self.tr("Revision {index}").format(index=snap.index + 1)
            if snap.saved_at:
                label = f"{label} – {snap.saved_at}"
            item = QListWidgetItem(label)
            item.setFlags(item.flags() | Qt.ItemFlag.ItemIsUserCheckable)
            item.setCheckState(Qt.CheckState.Unchecked)
            item.setData(Qt.ItemDataRole.UserRole, snap.index)
            self._revision_list.addItem(item)

        # Right panel: layout toolbar + tiles area.
        right_panel = QWidget(central)
        right_layout = QVBoxLayout(right_panel)
        right_layout.setContentsMargins(0, 0, 0, 0)
        right_layout.setSpacing(4)

        toolbar = QWidget(right_panel)
        toolbar_layout = QHBoxLayout(toolbar)
        toolbar_layout.setContentsMargins(0, 0, 0, 0)
        toolbar_layout.setSpacing(4)

        toolbar_label = QLabel(self.tr("Layout:"), toolbar)
        toolbar_layout.addWidget(toolbar_label)

        self._layout_buttons_group = QButtonGroup(toolbar)
        self._layout_buttons_group.setExclusive(True)
        self._layout_buttons_group.idClicked.connect(self._on_layout_button_clicked)
        self._layout_buttons: list[QToolButton] = []

        toolbar_layout.addStretch(1)
        right_layout.addWidget(toolbar)

        # Tiles container with up to 4 read-only text editors.
        tiles_container = QWidget(right_panel)
        tiles_layout = QGridLayout(tiles_container)
        tiles_layout.setContentsMargins(0, 0, 0, 0)
        tiles_layout.setSpacing(4)

        self._tiles_container = tiles_container
        self._tiles_layout = tiles_layout

        self._tile_editors: list[QTextEdit] = []
        for _ in range(4):
            editor = QTextEdit(tiles_container)
            editor.setReadOnly(True)
            editor.setAcceptRichText(True)
            editor.setLineWrapMode(QTextEdit.LineWrapMode.WidgetWidth)
            editor.setVisible(False)
            self._tile_editors.append(editor)

        right_layout.addWidget(tiles_container, 1)
        root_layout.addWidget(right_panel, 1)

        self.setCentralWidget(central)

        # Apply current language strings (also refreshed on LanguageChange).
        self._retranslate_ui()

    # Utility ---------------------------------------------------------------

    def _checked_indices(self) -> list[int]:
        indices: list[int] = []
        for row in range(self._revision_list.count()):
            item = self._revision_list.item(row)
            if item is None:
                continue
            if item.checkState() == Qt.CheckState.Checked:
                idx = item.data(Qt.ItemDataRole.UserRole)
                if isinstance(idx, int):
                    indices.append(idx)
        return indices

    # Slots -----------------------------------------------------------------

    def _on_item_changed(self, item: QListWidgetItem) -> None:  # pragma: no cover - UI wiring
        # Enforce maximum of 4 checked revisions.
        checked = self._checked_indices()
        if len(checked) > 4:
            # Revert the latest change.
            self._revision_list.blockSignals(True)
            try:
                item.setCheckState(Qt.CheckState.Unchecked)
            finally:
                self._revision_list.blockSignals(False)
            checked = self._checked_indices()

        count = len(checked)
        self._compare_button.setEnabled(2 <= count <= 4)

        if count < 2:
            self._info_label.setText(self.tr("Select 2–4 revisions to enable comparison."))
        elif count > 4:
            self._info_label.setText(self.tr("You can compare up to 4 revisions at once."))
        else:
            self._info_label.setText(
                self.tr("{count} revisions selected.").format(count=count)
            )

    def _on_compare_clicked(self) -> None:  # pragma: no cover - UI wiring
        checked = self._checked_indices()
        logger.info(
            "compare_revisions: Compare selected clicked with %d revisions: %s",
            len(checked),
            checked,
        )
        if not (2 <= len(checked) <= 4):
            QMessageBox.information(
                self,
                self.tr("Compare revisions"),
                self.tr("Please select between 2 and 4 revisions first."),
            )
            return

        # Keep a stable order for tiles: sort by snapshot index.
        checked.sort()
        self._last_selected_indices = checked

        count = len(checked)
        self._current_count = count
        self._configure_layout_buttons_for(count)
        self._apply_layout(self._current_layout_index, checked)

    def _configure_layout_buttons_for(self, count: int) -> None:
        logger.info("compare_revisions: configuring layout buttons for count=%d", count)

        presets = _LAYOUTS.get(count) or []
        if not presets:
            return

        toolbar = self._layout_buttons_group.parent()
        if not isinstance(toolbar, QWidget):
            return

        toolbar_layout = toolbar.layout()
        if not isinstance(toolbar_layout, QHBoxLayout):
            return

        # Remove any existing layout buttons from the toolbar and button group.
        for button in self._layout_buttons:
            self._layout_buttons_group.removeButton(button)
            toolbar_layout.removeWidget(button)
            button.deleteLater()
        self._layout_buttons.clear()

        # Insert new buttons just before the final stretch item when present,
        # so they stay between the 'Layout:' label and the stretch.
        insert_index = toolbar_layout.count()
        if insert_index > 0:
            last_item = toolbar_layout.itemAt(insert_index - 1)
            if last_item is not None and last_item.spacerItem() is not None:
                insert_index -= 1

        for i, geom in enumerate(presets):
            btn = QToolButton(toolbar)
            btn.setCheckable(True)
            btn.setIcon(self._create_layout_icon(geom))
            btn.setIconSize(QSize(32, 32))
            btn.setToolTip(self.tr("Layout {index}").format(index=i + 1))
            toolbar_layout.insertWidget(insert_index + i, btn)
            self._layout_buttons_group.addButton(btn, i)
            self._layout_buttons.append(btn)

        # Default to the first layout preset.
        self._current_layout_index = 0
        if self._layout_buttons:
            self._layout_buttons[0].setChecked(True)

    def _on_layout_button_clicked(self, layout_id: int) -> None:  # pragma: no cover - UI wiring
        self._current_layout_index = layout_id
        if not self._last_selected_indices:
            return
        self._apply_layout(layout_id, self._last_selected_indices)

    def _apply_layout(self, layout_index: int, selected_indices: Sequence[int]) -> None:
        count = len(selected_indices)
        logger.debug(
            "compare_revisions: applying layout %d for count=%d", layout_index, count
        )
        presets = _LAYOUTS.get(count) or []
        if not presets:
            return
        if layout_index < 0 or layout_index >= len(presets):
            layout_index = 0

        # Clear existing widgets from the grid (previous layout root + editors).
        while self._tiles_layout.count() > 0:
            item = self._tiles_layout.takeAt(0)
            w = item.widget()
            if w is not None:
                self._tiles_layout.removeWidget(w)

        # Configure tile editors with content and visibility.
        for i in range(4):
            editor = self._tile_editors[i]
            if i < count:
                idx = selected_indices[i]
                snap = self._snapshots[idx] if 0 <= idx < len(self._snapshots) else None
                if snap is not None:
                    editor.setPlainText(snap.body_md)
                editor.setVisible(True)
            else:
                editor.clear()
                editor.setVisible(False)

        # Build a resizable splitter layout for the current preset.
        root = self._build_tiles_root(count, layout_index)
        if root is not None:
            self._tiles_layout.addWidget(root, 0, 0, 1, 1)

    def _build_tiles_root(self, count: int, layout_index: int) -> QWidget | None:
        """Create a nested splitter tree for the active layout.

        This keeps the existing layout presets (as defined in ``_LAYOUTS``)
        while making the tile boundaries draggable via ``QSplitter``.
        """

        container = self._tiles_container
        editors = self._tile_editors

        def hsplit(*widgets: QWidget) -> QSplitter:
            splitter = QSplitter(Qt.Orientation.Horizontal, container)
            for w in widgets:
                splitter.addWidget(w)
            return splitter

        def vsplit(*widgets: QWidget) -> QSplitter:
            splitter = QSplitter(Qt.Orientation.Vertical, container)
            for w in widgets:
                splitter.addWidget(w)
            return splitter

        if count == 2:
            # Two revisions: horizontal (top/bottom) or vertical (left/right).
            if layout_index == 0:
                return vsplit(editors[0], editors[1])
            return hsplit(editors[0], editors[1])

        if count == 3:
            idx = layout_index
            if idx == 0:
                # One wide on top, two below.
                return vsplit(editors[0], hsplit(editors[1], editors[2]))
            if idx == 1:
                # Two on top, one large below.
                return vsplit(hsplit(editors[0], editors[1]), editors[2])
            if idx == 2:
                # Two stacked left, one tall right.
                return hsplit(vsplit(editors[0], editors[1]), editors[2])
            # Fallback / alternative: one tall left, two stacked right.
            return hsplit(editors[0], vsplit(editors[1], editors[2]))

        if count == 4:
            idx = layout_index

            if idx == 0:
                # 2x2 grid (1 2 / 3 4).
                left = vsplit(editors[0], editors[2])
                right = vsplit(editors[1], editors[3])
                return hsplit(left, right)

            if idx == 1:
                # Four vertical columns (1 2 3 4).
                return hsplit(editors[0], editors[1], editors[2], editors[3])

            if idx == 2:
                # Four horizontal rows (1 / 2 / 3 / 4).
                return vsplit(editors[0], editors[1], editors[2], editors[3])

            if idx == 3:
                # 1 and 2 stacked, 3 and 4 on the bottom row.
                bottom = hsplit(editors[2], editors[3])
                return vsplit(editors[0], editors[1], bottom)

            if idx == 4:
                # 1 and 2 on top; 3 middle full width; 4 bottom full width.
                top = hsplit(editors[0], editors[1])
                return vsplit(top, editors[2], editors[3])

            if idx == 5:
                # 1 and 2 stacked on the left; 3 and 4 tall on the right.
                left = vsplit(editors[0], editors[1])
                right = hsplit(editors[2], editors[3])
                return hsplit(left, right)

            if idx == 6:
                # 1 and 2 tall on the left; 3 and 4 stacked on the right.
                left = hsplit(editors[0], editors[1])
                right = vsplit(editors[2], editors[3])
                return hsplit(left, right)

            if idx == 7:
                # One tall left, three stacked right.
                return hsplit(editors[0], vsplit(editors[1], editors[2], editors[3]))

            if idx == 8:
                # Three stacked left, one tall right.
                return hsplit(vsplit(editors[0], editors[1], editors[2]), editors[3])

            if idx == 9:
                # One large top, three in a row below.
                bottom = hsplit(editors[1], editors[2], editors[3])
                return vsplit(editors[0], bottom)

            if idx == 10:
                # Three in a row on top, one wide below.
                top = hsplit(editors[0], editors[1], editors[2])
                return vsplit(top, editors[3])

            if idx == 11:
                # 1 wide on top; 2,3 stacked left; 4 tall on the right.
                bottom = hsplit(vsplit(editors[1], editors[2]), editors[3])
                return vsplit(editors[0], bottom)

            if idx == 12:
                # Variant of 11 with slightly different emphasis.
                bottom = hsplit(editors[1], vsplit(editors[2], editors[3]))
                return vsplit(editors[0], bottom)

            if idx == 13:
                # 1,2 stacked on the left; 3 on top-right; 4 bottom-wide.
                left = vsplit(editors[0], editors[1])
                right = vsplit(editors[2], editors[3])
                return hsplit(left, right)

            if idx == 14:
                # 1 tall on the left; 2 and 3 on top-right; 4 wide under 2+3.
                right = vsplit(hsplit(editors[1], editors[2]), editors[3])
                return hsplit(editors[0], right)

            if idx == 15:
                # 1 tall on the left; emphasis on 4 as bottom-right.
                right = vsplit(editors[1], hsplit(editors[2], editors[3]))
                return hsplit(editors[0], right)

            if idx == 16:
                # Similar to 15, but start with a wide area then split below.
                right = vsplit(editors[1], hsplit(editors[2], editors[3]))
                return hsplit(editors[0], right)

            if idx == 17:
                # 1 and 2 on the top row; 3 tall on the right; 4 bottom-left.
                left = vsplit(hsplit(editors[0], editors[1]), editors[3])
                return hsplit(left, editors[2])

        if idx == 18:
                # 1 and 2 stacked on the left; 3 and 4 tall on the right.
                left = vsplit(editors[0], editors[1])
                right = vsplit(editors[2], editors[3])
                return hsplit(left, right)
 
        return None

    def _retranslate_ui(self) -> None:
        """(Re-)apply translatable strings for the current language."""

        # Window title.
        self.setWindowTitle(self.tr("Compare revisions"))

        # Left panel title.
        try:
            self._title_label.setText(
                self.tr("Revisions for: {name}").format(name=self._document_path.name)
            )
        except Exception:
            pass

        # Info label text based on selection count.
        try:
            count = len(self._checked_indices())
            if count < 2:
                self._info_label.setText(
                    self.tr("Select 2–4 revisions to enable comparison.")
                )
            elif count > 4:
                self._info_label.setText(
                    self.tr("You can compare up to 4 revisions at once.")
                )
            else:
                self._info_label.setText(
                    self.tr("{count} revisions selected.").format(count=count)
                )
        except Exception:
            pass

        # Compare button.
        try:
            self._compare_button.setText(self.tr("Compare selected"))
        except Exception:
            pass

        # Toolbar label.
        try:
            self._toolbar_label.setText(self.tr("Layout:"))
        except Exception:
            pass

        # Revision list item labels.
        try:
            for row in range(self._revision_list.count()):
                item = self._revision_list.item(row)
                if item is None:
                    continue
                idx = item.data(Qt.ItemDataRole.UserRole)
                if not isinstance(idx, int) or not (0 <= idx < len(self._snapshots)):
                    continue
                snap = self._snapshots[idx]
                label = self.tr("Revision {index}").format(index=snap.index + 1)
                if snap.saved_at:
                    label = f"{label} – {snap.saved_at}"
                item.setText(label)
        except Exception:
            pass

        # Layout button tooltips.
        for i, btn in enumerate(getattr(self, "_layout_buttons", [])):
            try:
                btn.setToolTip(self.tr("Layout {index}").format(index=i + 1))
            except Exception:
                continue

    def changeEvent(self, event):  # pragma: no cover - UI wiring
        if event.type() == QEvent.LanguageChange:
            self._retranslate_ui()
        super().changeEvent(event)
 
    def _create_layout_icon(self, geometry: Sequence[tuple[int, int, int, int]]) -> QIcon:
        """Return a small icon visualising the tile geometry.

        The icon is a simple grid of rectangles roughly matching the layout
        (no numbers inside, just tile outlines).
        """

        if not geometry:
            return QIcon()

        rows = max(r + rs for r, c, rs, cs in geometry)
        cols = max(c + cs for r, c, rs, cs in geometry)
        if rows <= 0 or cols <= 0:
            return QIcon()

        pixmap = QPixmap(48, 48)
        pixmap.fill(Qt.GlobalColor.transparent)

        painter = QPainter(pixmap)
        pen = QPen(QColor("#444444"))
        pen.setWidth(2)
        painter.setPen(pen)
        painter.setBrush(QBrush(QColor("#e0e0e0")))

        w_unit = pixmap.width() / float(cols)
        h_unit = pixmap.height() / float(rows)

        for r, c, rs, cs in geometry:
            x = c * w_unit
            y = r * h_unit
            w = cs * w_unit
            h = rs * h_unit
            rect = QRectF(x + 1, y + 1, max(1.0, w - 2), max(1.0, h - 2))
            painter.drawRect(rect)

        painter.end()
        return QIcon(pixmap)
