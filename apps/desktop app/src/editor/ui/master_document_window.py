"""Master Document window and include containers.

This module implements a dedicated full-window workspace for composing a
"Master document" from multiple included files. It provides:

* A dockable file explorer pane for dragging files into the workspace.
* A central list of include containers that can be added via a
  right-click menu, reordered via drag-and-drop, edited inline, deleted,
  and collapsed/expanded.
"""

from __future__ import annotations

import uuid
from pathlib import Path
from typing import Dict
from datetime import datetime
import hashlib
import difflib

from PySide6.QtCore import Qt, QPoint, Signal, QTimer, QEvent, QObject
from PySide6.QtGui import QAction
from PySide6.QtWidgets import (
    QAbstractItemView,
    QDockWidget,
    QFileDialog,
    QHBoxLayout,
    QLineEdit,
    QListWidget,
    QListWidgetItem,
    QMainWindow,
    QMenu,
    QMessageBox,
    QPlainTextEdit,
    QSizePolicy,
    QToolButton,
    QVBoxLayout,
    QWidget,
)

from .. import storage
from .. import file_metadata
from ..format import story_markup, screenplay_markup
from ..settings import save_settings
from ..versioning import local_queue
from .file_explorer_widget import FileExplorerWidget


class MasterSyncBus(QObject):
    """Process-wide bus used to keep master documents and chapters in sync.

    MainWindow instances emit :attr:`chapterContentUpdated` and
    :attr:`chapterDocumentClosed` when a chapter file's content changes or when
    a chapter document is closed. Individual :class:`MasterDocumentWindow`
    instances subscribe to these events and update their include containers and
    ``.master`` files accordingly.

    Editable include containers inside a :class:`MasterDocumentWindow` emit
    :attr:`includeContentUpdated` when their content changes so that any
    :class:`MainWindow` currently editing the same chapter file can refresh its
    in-memory document and views in real time.

    The bus is intentionally lightweight and best-effort only; failures must
    never interfere with core editing behaviour.
    """

    # `path` is passed as a Path-like object; receivers normalise it as needed.
    chapterContentUpdated = Signal(object, str)
    chapterDocumentClosed = Signal(object)
    # Emitted when an editable include container's content changes. `path`
    # identifies the underlying chapter file; `text` is the full new content.
    includeContentUpdated = Signal(object, str)


# Global singleton used by all windows.
master_sync_bus = MasterSyncBus()


class _IncludeListWidget(QListWidget):
    """Custom list widget to host include containers.

    We rely on Qt's InternalMove drag/drop mode for reordering, but
    explicitly disallow dropping *onto* an existing item so that
    containers cannot be "nested" or appear to disappear. Only
    positioning *between* rows (above/below) is allowed.

    This subclass also enables smooth auto-scrolling while a container is
    being dragged near the top or bottom edge so that users can move
    includes across large documents without having to drag-and-drop in
    multiple small steps.

    It also keeps every row's width locked to the viewport width so that
    include containers always span the full work area, regardless of
    edits, pastes or window resizes.
    """

    def __init__(self, *args, **kwargs) -> None:  # pragma: no cover - UI wiring
        super().__init__(*args, **kwargs)
        # Ensure smooth scrolling during drag operations.
        self.setVerticalScrollMode(QAbstractItemView.ScrollPerPixel)
        self.setAutoScroll(True)
        # Use a slightly larger margin so scrolling kicks in before the
        # cursor hits the exact edge of the viewport.
        self.setAutoScrollMargin(32)
        # We never want a horizontal scrollbar; each item is stretched to
        # the viewport width instead.
        self.setHorizontalScrollBarPolicy(Qt.ScrollBarPolicy.ScrollBarAlwaysOff)

    def resizeEvent(self, event) -> None:  # pragma: no cover - UI wiring
        """Keep all rows stretched to the viewport width on resize."""

        super().resizeEvent(event)
        try:
            self._update_item_widths()
        except Exception:
            # Width synchronisation is best-effort only and must not break
            # basic list behaviour if anything goes wrong.
            pass

    def _update_item_widths(self) -> None:
        """Force every item's width to match the viewport width.

        This is called on resize and by the master document window whenever
        a container's height changes so that edits and pastes cannot cause
        rows to "shrink" horizontally.
        """

        try:
            viewport_width = self.viewport().width()
        except Exception:
            viewport_width = 0

        if viewport_width <= 0:
            return

        for row in range(self.count()):
            item = self.item(row)
            if item is None:
                continue
            hint = item.sizeHint()
            if not hint.isValid():
                continue
            if hint.width() != viewport_width:
                hint.setWidth(viewport_width)
                item.setSizeHint(hint)

    def dropEvent(self, event) -> None:  # pragma: no cover - UI wiring
        pos = self.dropIndicatorPosition()
        if pos == QAbstractItemView.DropIndicatorPosition.OnItem:
            # Ignore drops that target the middle of an item; the user must
            # drop above or below a row so the ordering remains flat.
            event.ignore()
            return
        super().dropEvent(event)

    def dragMoveEvent(self, event) -> None:  # pragma: no cover - UI wiring
        """Auto-scroll when dragging near the top/bottom of the viewport.

        Qt's built-in auto-scroll is not always triggered when drags are
        initiated programmatically (as we do from the container header),
        so we nudge the vertical scroll bar ourselves based on the drag
        position while still delegating to the default implementation for
        drop indication and item reordering.
        """

        # First, let the base class update the drop indicator and handle
        # standard drag behaviour.
        super().dragMoveEvent(event)

        try:
            # QDragMoveEvent.position() is available in Qt 6; fall back to
            # pos() for compatibility.
            pos = event.position().toPoint() if hasattr(event, "position") else event.pos()
            y = pos.y()

            viewport = self.viewport()
            height = viewport.height()
            margin = max(8, self.autoScrollMargin())

            bar = self.verticalScrollBar()
            if bar is None:
                return

            if y < margin and bar.value() > bar.minimum():
                # Near the top: scroll up a bit.
                bar.setValue(bar.value() - bar.singleStep())
            elif y > height - margin and bar.value() < bar.maximum():
                # Near the bottom: scroll down a bit.
                bar.setValue(bar.value() + bar.singleStep())
        except Exception:
            # Never let auto-scroll issues interfere with drag/reorder.
            return


class IncludeContainerWidget(QWidget):
    """Container for an included document inside the Master document.

    The widget supports two modes:

    * Editable live include (``editable=True``): content area is editable.
    * Read-only include (``editable=False``): content area is read-only.

    Users can drag files from the file explorer into the container to
    populate it, edit the title inline, collapse/expand, and request
    deletion.
    """

    deleteRequested = Signal(object)
    sizeChanged = Signal()
    contentChanged = Signal()
    filePathNeeded = Signal(object)
    editInMainRequested = Signal(object)
    renameRequested = Signal(object)
    cloneFileRequested = Signal(object)
    cloneContainerRequested = Signal(object)

    def __init__(self, editable: bool, parent: object | None = None) -> None:
        super().__init__(parent)

        self._editable = editable
        self._file_path: Path | None = None
        self._collapsed = False
        self._loading_from_master = False
        # True while content is being updated in response to a change that
        # originated from the main editor window. This prevents feedback loops
        # where programmatic updates would otherwise be treated as fresh user
        # edits and re-broadcast back to the main window.
        self._syncing_from_main = False
        # Track drag gestures that start from the header/toolbar area.
        self._drag_start_pos: QPoint | None = None
        # Content hash from when this container was last loaded/synced from the master.
        self._master_content_hash: str | None = None
        # Snapshot of the content from the last master/chapter sync, used as a
        # best-effort base for diff/merge operations. When unavailable we fall
        # back to a conservative two-way merge that never discards text from
        # either side.
        self._master_base_content: str | None = None
        # Filesystem mtime from when we last read the underlying file.
        self._last_file_mtime: float | None = None

        # Debounced saver for editable containers so changes are written back
        # into the underlying file without excessive disk writes.
        self._save_timer = QTimer(self)
        self._save_timer.setSingleShot(True)
        self._save_timer.setInterval(1500)
        self._save_timer.timeout.connect(self._flush_to_file)

        self.setAcceptDrops(True)

        # Ensure the container itself prefers to take full available width.
        self.setSizePolicy(
            QSizePolicy.Policy.Expanding,
            QSizePolicy.Policy.Preferred,
        )

        self._build_ui()

    # UI -----------------------------------------------------------------

    def _build_ui(self) -> None:
        layout = QVBoxLayout(self)
        layout.setContentsMargins(6, 6, 6, 6)
        layout.setSpacing(4)

        # Header row: drag area, collapse/expand, title, type label, delete.
        header = QWidget(self)
        header_layout = QHBoxLayout(header)
        header_layout.setContentsMargins(0, 0, 0, 0)
        header_layout.setSpacing(4)

        # We'll treat the entire header row (and its simple children) as a
        # drag handle so users don't need to target a tiny area.
        self._header_widget = header

        self._btn_collapse = QToolButton(header)
        self._btn_collapse.setText("▾")
        self._btn_collapse.setToolTip(self.tr("Collapse / expand include"))
        self._btn_collapse.clicked.connect(self._toggle_collapsed)
        header_layout.addWidget(self._btn_collapse)

        self._title_edit = QLineEdit(header)
        if self._editable:
            self._title_edit.setPlaceholderText(self.tr("Editable include title"))
        else:
            self._title_edit.setPlaceholderText(self.tr("Read-only include title"))
        header_layout.addWidget(self._title_edit, 1)

        self._type_label = QToolButton(header)
        self._type_label.setEnabled(False)
        self._type_label.setText(self.tr("Editable") if self._editable else self.tr("Read-only"))
        header_layout.addWidget(self._type_label)

        # Action buttons available for both editable and read-only containers.
        self._btn_edit_in_main = QToolButton(header)
        self._btn_edit_in_main.setText(self.tr("Edit in main"))
        self._btn_edit_in_main.setToolTip(
            self.tr("Edit this chapter in the main window")
        )
        self._btn_edit_in_main.clicked.connect(
            lambda: self.editInMainRequested.emit(self)
        )
        header_layout.addWidget(self._btn_edit_in_main)

        self._btn_rename_file = QToolButton(header)
        self._btn_rename_file.setText(self.tr("Rename"))
        self._btn_rename_file.setToolTip(
            self.tr("Rename the underlying chapter file using the file explorer")
        )
        self._btn_rename_file.clicked.connect(
            lambda: self.renameRequested.emit(self)
        )
        header_layout.addWidget(self._btn_rename_file)

        self._btn_clone_file = QToolButton(header)
        self._btn_clone_file.setText(self.tr("Clone file"))
        self._btn_clone_file.setToolTip(
            self.tr("Create a copy of the underlying chapter file")
        )
        self._btn_clone_file.clicked.connect(
            lambda: self.cloneFileRequested.emit(self)
        )
        header_layout.addWidget(self._btn_clone_file)

        self._btn_clone_container = QToolButton(header)
        self._btn_clone_container.setText(self.tr("Clone container"))
        self._btn_clone_container.setToolTip(
            self.tr(
                "Create a copy of the chapter file and a new include container below this one"
            )
        )
        self._btn_clone_container.clicked.connect(
            lambda: self.cloneContainerRequested.emit(self)
        )
        header_layout.addWidget(self._btn_clone_container)

        self._btn_delete = QToolButton(header)
        self._btn_delete.setText("✕")
        self._btn_delete.setToolTip(self.tr("Remove this include from the master document"))
        self._btn_delete.clicked.connect(lambda: self.deleteRequested.emit(self))
        header_layout.addWidget(self._btn_delete)

        # Install a shared event filter on the header and its lightweight
        # children so that dragging anywhere in the header row can reorder
        # the container, while clicks still work normally.
        self._drag_sources = [
            header,
            self._btn_collapse,
            self._title_edit,
            self._type_label,
            self._btn_edit_in_main,
            self._btn_rename_file,
            self._btn_clone_file,
            self._btn_clone_container,
            self._btn_delete,
        ]
        for src in self._drag_sources:
            try:
                src.setCursor(Qt.CursorShape.OpenHandCursor)
                src.installEventFilter(self)
            except Exception:
                continue

        layout.addWidget(header)

        # Content area.
        self._content = QPlainTextEdit(self)
        self._content.setLineWrapMode(QPlainTextEdit.LineWrapMode.WidgetWidth)
        self._content.setSizePolicy(
            QSizePolicy.Policy.Expanding,
            QSizePolicy.Policy.MinimumExpanding,
        )
        # Route drag-and-drop for files to the container widget so that we
        # can open file contents instead of letting QTextEdit insert file://
        # links as plain text.
        self._content.setAcceptDrops(False)
        self._content.textChanged.connect(self._on_text_changed)

        if not self._editable:
            self._content.setReadOnly(True)

        # Any title change also marks this container as modified.
        self._title_edit.textChanged.connect(lambda _text: self.contentChanged.emit())

        layout.addWidget(self._content, 1)

        # Provide a subtle background to distinguish containers visually.
        self.setStyleSheet(
            "IncludeContainerWidget {"
            "  border: 1px solid palette(mid);"
            "  border-radius: 4px;"
            "  background-color: palette(base);"
            "}"
        )
 
        self._update_height()
 
    def _retranslate_ui(self) -> None:
        """(Re-)apply translatable strings for this include container."""

        try:
            self._btn_collapse.setToolTip(self.tr("Collapse / expand include"))
        except Exception:
            pass
        try:
            if self._editable:
                self._title_edit.setPlaceholderText(self.tr("Editable include title"))
            else:
                self._title_edit.setPlaceholderText(self.tr("Read-only include title"))
        except Exception:
            pass
        try:
            self._type_label.setText(
                self.tr("Editable") if self._editable else self.tr("Read-only")
            )
        except Exception:
            pass
        try:
            self._btn_edit_in_main.setText(self.tr("Edit in main"))
            self._btn_edit_in_main.setToolTip(
                self.tr("Edit this chapter in the main window")
            )
        except Exception:
            pass
        try:
            self._btn_rename_file.setText(self.tr("Rename"))
            self._btn_rename_file.setToolTip(
                self.tr("Rename the underlying chapter file using the file explorer")
            )
        except Exception:
            pass
        try:
            self._btn_clone_file.setText(self.tr("Clone file"))
            self._btn_clone_file.setToolTip(
                self.tr("Create a copy of the underlying chapter file")
            )
        except Exception:
            pass
        try:
            self._btn_clone_container.setText(self.tr("Clone container"))
            self._btn_clone_container.setToolTip(
                self.tr(
                    "Create a copy of the chapter file and a new include container below this one"
                )
            )
        except Exception:
            pass
        try:
            self._btn_delete.setToolTip(
                self.tr("Remove this include from the master document")
            )
        except Exception:
            pass
 
    # Public API ---------------------------------------------------------

    @property
    def file_path(self) -> Path | None:
        return self._file_path

    def set_bound_path(self, path: Path) -> None:
        """Set the underlying file path without changing content.

        This is used by the owning MasterDocumentWindow when it needs to
        create a new file for an editable container on first edit.
        """

        self._file_path = path

    def load_from_master(
        self,
        *,
        file_path: Path | None,
        title: str | None,
        content: str,
    ) -> None:
        """Populate the container from a `.master` entry without side effects.

        This sets the internal file path, title and content without
        triggering autosave or write-back to the underlying file. It is
        intended only for initial loading of a master document; subsequent
        user edits go through the normal signals and write-back logic.
        """

        self._loading_from_master = True
        try:
            self._file_path = file_path

            # Avoid emitting contentChanged while we are initialising from
            # the master file.
            try:
                self._title_edit.blockSignals(True)
                self._title_edit.setText(title or "")
            finally:
                self._title_edit.blockSignals(False)

            # Setting the text programmatically will emit textChanged on the
            # inner QPlainTextEdit, but _on_text_changed short-circuits when
            # _loading_from_master is True so we do not accidentally write
            # back to the original file.
            self._content.setPlainText(content or "")
            self._update_height()
            
            # Remember the content hash and baseline content for change
            # detection and merging. We intentionally do NOT set
            # _last_file_mtime here so that, when a master document is opened,
            # we always compare the current on-disk file content to what was
            # stored in the master. This allows us to detect and merge any
            # external changes immediately on open.
            baseline = content or ""
            self._master_base_content = baseline
            self._master_content_hash = self._compute_content_hash(baseline)
            self._last_file_mtime = None
        finally:
            self._loading_from_master = False

    def set_file_from_path(self, path: Path) -> None:
        """Populate the container from *path*.

        The file content is loaded via :mod:`editor.storage`. The title is
        updated to the filename when it is currently empty.
        """

        try:
            text = storage.read_text(path)
        except Exception:
            text = ""

        self._file_path = path
        self._content.setPlainText(text)

        if not self._title_edit.text().strip():
            self._title_edit.setText(path.name)

        self._update_height()
        
        # Update tracking state for change detection and future merges.
        self._master_base_content = text
        self._master_content_hash = self._compute_content_hash(text)
        try:
            self._last_file_mtime = path.stat().st_mtime
        except Exception:
            self._last_file_mtime = None
        
        self.contentChanged.emit()

    # Internal helpers ---------------------------------------------------

    def _compute_content_hash(self, content: str) -> str:
        """Return a stable hash of *content* for change detection."""
        try:
            return hashlib.sha256(content.encode("utf-8")).hexdigest()
        except Exception:
            return ""

    def _two_way_merge_text(self, master_text: str, file_text: str) -> str:
        """Best-effort, conflict-free merge of two text versions.

        The algorithm operates line-by-line using :mod:`difflib` and never
        discards text from either side. In conflicting regions where both
        versions changed the same area, it keeps the master lines followed by
        the file lines. This is intentionally conservative: it may produce
        duplicated or slightly redundant text, but it avoids silently losing
        edits.
        """

        if master_text == file_text:
            return master_text

        if not master_text:
            return file_text
        if not file_text:
            return master_text

        master_lines = master_text.splitlines()
        file_lines = file_text.splitlines()

        merged: list[str] = []
        try:
            matcher = difflib.SequenceMatcher(a=master_lines, b=file_lines)
            for tag, alo, ahi, blo, bhi in matcher.get_opcodes():
                if tag == "equal":
                    merged.extend(master_lines[alo:ahi])
                elif tag == "replace":
                    seg_a = master_lines[alo:ahi]
                    seg_b = file_lines[blo:bhi]
                    merged.extend(seg_a)
                    if seg_b != seg_a:
                        merged.extend(seg_b)
                elif tag == "delete":
                    # Lines only present in the master side are preserved so
                    # that external deletions on the chapter file cannot
                    # silently drop content from the master.
                    merged.extend(master_lines[alo:ahi])
                elif tag == "insert":
                    # Lines only present in the chapter file are appended in
                    # the position indicated by the diff.
                    merged.extend(file_lines[blo:bhi])
        except Exception:
            # If anything goes wrong with the structured merge, fall back to
            # a simple concatenation that still preserves both versions.
            merged = master_lines + [""] + file_lines

        return "\n".join(merged)

    def check_and_merge_file_changes(self) -> bool:
        """Check if the underlying file has changed and merge updates.

        Returns ``True`` if changes were detected and merged, ``False``
        otherwise.

        For editable containers we perform a **conflict-free, diff-based
        merge** that preserves both the container content (typically loaded
        from the ``.master`` file) and any external edits made directly to
        the chapter file. In the worst case this can produce duplicated or
        slightly redundant text, but it deliberately avoids **losing**
        changes from either side.

        For read-only containers, the file content always wins.
        """

        path = self._file_path
        if path is None or not path.exists():
            return False

        # Check if the file has been modified since we last saw it.
        try:
            current_mtime = path.stat().st_mtime
        except Exception:
            return False

        if self._last_file_mtime is not None and current_mtime <= self._last_file_mtime:
            # File hasn't changed on disk.
            return False

        # Read current file content.
        try:
            file_content = storage.read_text(path)
        except Exception:
            return False

        container_content = self._content.toPlainText()

        # Fast path: contents already identical.
        if file_content == container_content:
            self._last_file_mtime = current_mtime
            self._master_content_hash = self._compute_content_hash(container_content)
            return False

        file_hash = self._compute_content_hash(file_content)

        # For read-only containers, always reflect the current file content.
        if not self._editable:
            self._content.setPlainText(file_content)
            self._master_base_content = file_content
            self._master_content_hash = file_hash
            self._last_file_mtime = current_mtime
            self._update_height()
            return True

        # Editable containers: perform a conservative, conflict-free merge of
        # the master/container content and the on-disk chapter content. We
        # currently use a two-way line-based merge that never drops text from
        # either side; future versions may take advantage of
        # ``_master_base_content`` to implement a full three-way merge when a
        # stable common ancestor is available.
        try:
            merged_content = self._two_way_merge_text(container_content, file_content)
        except Exception:
            # If anything goes wrong during merging, fall back to concatenation
            # so that neither version is lost.
            merged_content = container_content + "\n" + file_content

        # Update both the container and the underlying file so that the
        # chapter and master representations converge on the merged version.
        self._content.setPlainText(merged_content)
        try:
            storage.write_text(path, merged_content)
        except Exception:
            # Best-effort only; if we cannot write back to disk we still keep
            # the merged content in the container so the master document
            # reflects all known changes.
            pass

        # Refresh tracking state to treat the merged content as the new base
        # for future change detection and merges.
        self._master_base_content = merged_content
        self._master_content_hash = self._compute_content_hash(merged_content)
        try:
            self._last_file_mtime = path.stat().st_mtime
        except Exception:
            self._last_file_mtime = current_mtime

        self._update_height()
        return True

    def _toggle_collapsed(self) -> None:
        self._collapsed = not self._collapsed
        self._content.setVisible(not self._collapsed)
        self._btn_collapse.setText("▸" if self._collapsed else "▾")
        self._update_height()

    def _on_text_changed(self) -> None:
        # During master-file initialisation we ignore textChanged so that we
        # do not immediately overwrite the underlying files.
        if self._loading_from_master:
            self._update_height()
            return

        # Ignore updates that originate from the main window via the
        # MasterSyncBus. In that direction the main editor is the canonical
        # source of truth and we only need to refresh the visual height.
        if getattr(self, "_syncing_from_main", False):
            self._update_height()
            return

        # Only respond to user edits; read-only widgets will not emit textChanged.
        self._update_height()

        # For editable containers, ensure there is a backing file path when
        # the user starts typing. The master document window will respond by
        # creating a new `.md` file inside the current project space.
        if self._editable:
            if self._file_path is None and self._content.toPlainText().strip():
                self.filePathNeeded.emit(self)

            # Once a path exists, schedule a debounced save so that changes
            # are written back to disk.
            if self._file_path is not None:
                if self._save_timer.isActive():
                    self._save_timer.stop()
                self._save_timer.start()

        # Notify the owning master document that content has changed.
        self.contentChanged.emit()

        # When this editable container is bound to a concrete chapter file,
        # broadcast the updated content via the shared MasterSyncBus so that
        # any main editor window currently editing the same file can refresh
        # its in-memory document and views.
        try:
            if self._editable and self._file_path is not None:
                master_sync_bus.includeContentUpdated.emit(
                    self._file_path,
                    self._content.toPlainText(),
                )
        except Exception:
            # Synchronisation must never interfere with core editing.
            pass

    def _update_height(self) -> None:
        # Approximate auto-height behaviour by setting a minimum height based
        # on the document's size. This keeps containers growing as content is
        # added while still allowing the overall workspace to scroll.
        if self._collapsed:
            self._content.setMinimumHeight(0)
        else:
            try:
                doc = self._content.document()
                layout = doc.documentLayout()
                if layout is not None:
                    doc_size = layout.documentSize()
                    min_height = max(80, int(doc_size.height()) + 16)
                else:
                    min_height = 80
            except Exception:
                min_height = 80

            self._content.setMinimumHeight(min_height)

        # Let the parent layout and QListWidget control the overall width; we
        # only hint that the geometry has changed so height can be updated.
        self.updateGeometry()
        self.sizeChanged.emit()

    def eventFilter(self, obj, event):  # pragma: no cover - UI wiring
        """Handle drag gestures that start from the header area.

        We invoke Qt's built-in InternalMove drag on the parent QListWidget
        so that row reordering is robust and uses standard behaviour.
        """

        try:
            sources = getattr(self, "_drag_sources", None) or []
            if obj in sources:
                from PySide6.QtWidgets import QApplication  # local import

                if event.type() == QEvent.Type.MouseButtonPress and event.button() == Qt.MouseButton.LeftButton:
                    # Record drag start position relative to the source widget.
                    pos = event.position().toPoint() if hasattr(event, "position") else event.pos()
                    self._drag_start_pos = pos

                elif event.type() == QEvent.Type.MouseMove and (event.buttons() & Qt.MouseButton.LeftButton):
                    if self._drag_start_pos is None:
                        return False
                    pos = event.position().toPoint() if hasattr(event, "position") else event.pos()
                    if (pos - self._drag_start_pos).manhattanLength() >= QApplication.startDragDistance():
                        self._start_internal_drag()
                        return True

                elif event.type() == QEvent.Type.MouseButtonRelease:
                    self._drag_start_pos = None

                return False
        except Exception:
            pass

        return super().eventFilter(obj, event)

    def _start_internal_drag(self) -> None:
        """Ask the parent QListWidget to start an InternalMove drag."""

        parent = self.parent()
        from PySide6.QtWidgets import QListWidget  # local import

        if not isinstance(parent, QListWidget):
            return

        # Find the row that hosts this widget.
        row = -1
        try:
            for i in range(parent.count()):
                item = parent.item(i)
                if parent.itemWidget(item) is self:
                    row = i
                    break
        except Exception:
            row = -1

        if row < 0:
            return

        try:
            item = parent.item(row)
            parent.setCurrentItem(item)
            parent.startDrag(Qt.DropAction.MoveAction)
        except Exception:
            return

    def _flush_to_file(self) -> None:
        """Persist the current content back into the underlying file.

        This is only active for editable containers that are associated
        with a concrete filesystem path.
        """

        if not self._editable or self._file_path is None:
            return

        try:
            storage.write_text(self._file_path, self._content.toPlainText())
        except Exception:
            # Best-effort only; never let write failures break the UI.
            pass

    # Drag-and-drop ------------------------------------------------------

    def dragEnterEvent(self, event) -> None:  # pragma: no cover - UI wiring
        mime = event.mimeData()
        if mime is not None and mime.hasUrls():
            for url in mime.urls():
                if url.isLocalFile():
                    event.acceptProposedAction()
                    return
        event.ignore()

    def dragMoveEvent(self, event) -> None:  # pragma: no cover - UI wiring
        self.dragEnterEvent(event)

    def dropEvent(self, event) -> None:  # pragma: no cover - UI wiring
        mime = event.mimeData()
        if mime is None or not mime.hasUrls():
            event.ignore()
            return

        local_urls = [url for url in mime.urls() if url.isLocalFile()]
        if not local_urls:
            event.ignore()
            return

        # For now we take the first file; users can add multiple include
        # containers if they want to include multiple files.
        path = Path(local_urls[0].toLocalFile())
        self.set_file_from_path(path)

        event.acceptProposedAction()


class MasterDocumentWindow(QMainWindow):
    """Full-screen window for composing a Master Document.

    This window is intentionally self-contained so that existing editor
    behaviour remains unchanged.
    """

    def __init__(
        self,
        *,
        settings: object | None = None,
        project_space: Path | None = None,
        master_path: Path | None = None,
        parent: object | None = None,
    ) -> None:
        super().__init__(parent)

        # We treat *settings* as an opaque object and only access attributes
        # via getattr so that this window does not depend on the concrete
        # Settings implementation.
        self._settings = settings
        self._project_space = project_space

        self.setWindowTitle(self.tr("Master document"))

        self._include_list: QListWidget
        self._container_items: Dict[IncludeContainerWidget, QListWidgetItem] = {}
        self._explorer: FileExplorerWidget | None = None

        # Path to the backing `.master` file and simple dirty flag.
        self._master_path: Path | None = master_path
        self._dirty: bool = False

        # Debounced autosave timer for the master document itself.
        self._autosave_timer = QTimer(self)
        self._autosave_timer.setSingleShot(True)
        self._autosave_timer.setInterval(2000)
        self._autosave_timer.timeout.connect(self._perform_autosave)

        # Keep include containers in sync with edits performed in the main
        # window via the shared master_sync_bus. Connections are best-effort
        # only so that missing or misconfigured buses cannot break core UI.
        try:
            master_sync_bus.chapterContentUpdated.connect(self._on_external_chapter_content_updated)
            master_sync_bus.chapterDocumentClosed.connect(self._on_external_chapter_closed)
        except Exception:
            pass

        self._setup_ui()

        # When opening an existing `.master` file, populate the workspace
        # from its contents.
        if master_path is not None:
            try:
                self._load_from_master_file(master_path)
                # After loading, check if any referenced files have changed and merge.
                self._check_and_merge_all_file_changes()
            except Exception:
                # Best-effort only; failures here should not prevent the
                # window from opening.
                pass

    # UI setup -----------------------------------------------------------

    def _setup_ui(self) -> None:
        # Central workspace: list of include containers.
        central = QWidget(self)
        layout = QVBoxLayout(central)
        layout.setContentsMargins(6, 6, 6, 6)
        layout.setSpacing(6)

        self._include_list = _IncludeListWidget(central)
        # Use Qt's built-in drag/drop support with InternalMove while hiding
        # the default selection background so include containers look clean.
        self._include_list.setSelectionMode(QAbstractItemView.SingleSelection)
        self._include_list.setDragEnabled(True)
        self._include_list.setAcceptDrops(True)
        self._include_list.setDropIndicatorShown(True)
        self._include_list.setDragDropMode(QAbstractItemView.InternalMove)
        self._include_list.setDefaultDropAction(Qt.MoveAction)
        self._include_list.setSpacing(8)
        self._include_list.setContextMenuPolicy(Qt.CustomContextMenu)
        self._include_list.customContextMenuRequested.connect(self._on_work_area_context_menu)
        # Hide the default selection background so rows still look clean.
        self._include_list.setStyleSheet(
            "QListWidget::item:selected { background: transparent; border: none; }"
        )

        # Reordering containers should also mark the master document dirty.
        model = self._include_list.model()
        if model is not None:
            try:
                model.rowsMoved.connect(self._on_rows_moved)
            except Exception:
                # Best-effort only; absence of this connection should not
                # affect core behaviour.
                pass

        layout.addWidget(self._include_list)

        self.setCentralWidget(central)

        # Dockable file explorer.
        explorer = FileExplorerWidget(self._project_space, parent=self)
        self._explorer = explorer
        self._explorer_dock = QDockWidget(self.tr("File explorer"), self)
        self._explorer_dock.setObjectName("master_document_file_explorer")
        self._explorer_dock.setWidget(explorer)

        # Keep include containers in sync when files are renamed via the
        # explorer. QFileSystemModel emits a fileRenamed signal that we can
        # use to update any bound container paths so that subsequent master
        # autosaves write the new filenames.
        try:
            model = explorer.model()
            # QFileSystemModel exposes fileRenamed in Qt, but the exact
            # attribute name can vary between bindings; guard accordingly.
            file_renamed = getattr(model, "fileRenamed", None)
            if callable(file_renamed):
                file_renamed.connect(self._on_explorer_file_renamed)  # type: ignore[arg-type]
        except Exception:
            # Never let model wiring failures break the master document UI.
            pass
        self._explorer_dock.setAllowedAreas(
            Qt.DockWidgetArea.LeftDockWidgetArea
            | Qt.DockWidgetArea.RightDockWidgetArea
            | Qt.DockWidgetArea.TopDockWidgetArea
            | Qt.DockWidgetArea.BottomDockWidgetArea
        )
        self.addDockWidget(Qt.DockWidgetArea.LeftDockWidgetArea, self._explorer_dock)

        # Save as menu: save the master document contents in different formats.
        save_as_menu = self.menuBar().addMenu(self.tr("Save as"))
        self._save_as_menu = save_as_menu
        self._action_save_as_md = save_as_menu.addAction(
            self.tr("as .md file"), self._save_as_md
        )
        self._action_save_as_story = save_as_menu.addAction(
            self.tr("as .story file"), self._save_as_story
        )
        self._action_save_as_screenplay = save_as_menu.addAction(
            self.tr("as .screenplay file"), self._save_as_screenplay
        )

        # Simple menu bar with a View menu for toggling the explorer.
        self._view_menu = self.menuBar().addMenu(self.tr("View"))
        self._view_menu.addAction(self._explorer_dock.toggleViewAction())

    # Include containers --------------------------------------------------

    def _add_include_container(self, editable: bool) -> None:
        widget = IncludeContainerWidget(editable, parent=self._include_list)
        item = QListWidgetItem(self._include_list)

        # Let the list widget control the row width; we only care about the
        # height here. The width will be stretched to the viewport width via
        # _IncludeListWidget._update_item_widths().
        hint = widget.sizeHint()
        item.setSizeHint(hint)

        # Explicitly enable drag and drop on this list item so Qt's internal
        # move reordering works.
        item.setFlags(item.flags() | Qt.ItemFlag.ItemIsDragEnabled | Qt.ItemFlag.ItemIsDropEnabled)

        self._include_list.addItem(item)
        self._include_list.setItemWidget(item, widget)

        self._container_items[widget] = item

        widget.deleteRequested.connect(self._on_container_delete_requested)
        widget.sizeChanged.connect(self._on_container_size_changed)
        widget.contentChanged.connect(self._on_container_modified)
        widget.filePathNeeded.connect(self._on_container_file_path_needed)
        widget.editInMainRequested.connect(self._on_container_edit_in_main_requested)
        widget.renameRequested.connect(self._on_container_rename_requested)
        widget.cloneFileRequested.connect(self._on_container_clone_file_requested)
        widget.cloneContainerRequested.connect(self._on_container_clone_container_requested)

        # Ensure all rows span the full work area, including this new one.
        try:
            self._include_list._update_item_widths()  # type: ignore[attr-defined]
        except Exception:
            pass

        self._mark_dirty()

    def _on_container_delete_requested(self, widget: IncludeContainerWidget) -> None:
        item = self._container_items.pop(widget, None)
        if item is None:
            return

        row = self._include_list.row(item)
        if row >= 0:
            removed_item = self._include_list.takeItem(row)
            del removed_item  # allow Qt/Python to clean up the item

        self._mark_dirty()

    def _on_container_size_changed(self) -> None:
        # Sender is the container whose size has changed; update its item hint.
        sender = self.sender()
        if not isinstance(sender, IncludeContainerWidget):
            return

        item = self._container_items.get(sender)
        if item is not None:
            # Keep the item's height in sync with the widget's preferred
            # height. Width is handled centrally by _IncludeListWidget so that
            # containers always span the full work area.
            current = item.sizeHint()
            new_hint = sender.sizeHint()
            if not current.isValid():
                current = new_hint
            else:
                current.setHeight(new_hint.height())

            item.setSizeHint(current)

        # After adjusting a single row, reapply the full-width policy so that
        # no row can accidentally shrink horizontally during edits or pastes.
        try:
            self._include_list._update_item_widths()  # type: ignore[attr-defined]
        except Exception:
            pass

    def _on_container_modified(self) -> None:
        """Slot invoked when any include container's content/title changes."""

        self._mark_dirty()

    def _on_rows_moved(self, *args, **kwargs) -> None:  # pragma: no cover - UI wiring
        """Mark the master document dirty when containers are reordered."""

        self._mark_dirty()

    def _on_container_file_path_needed(self, widget: IncludeContainerWidget) -> None:
        """Create a new `.md` file for *widget* when the user starts typing.

        The new file is created inside the current project space, using a
        timestamp-based `untitled-YYYYMMDD-HHMMSS.md` naming scheme similar
        to the main editor. If no project space is configured, the request is
        ignored and the container remains in-memory-only.
        """

        if not isinstance(widget, IncludeContainerWidget):
            return
        if widget.file_path is not None:
            return
        if self._project_space is None:
            return

        timestamp = datetime.now().strftime("%Y%m%d-%H%M%S")
        candidate = self._project_space / f"untitled-{timestamp}.md"

        # Very low probability of collision, but be defensive: append a
        # numeric suffix if the path already exists.
        index = 1
        new_path = candidate
        try:
            while new_path.exists():
                new_path = self._project_space / f"untitled-{timestamp}-{index}.md"
                index += 1
        except Exception:
            # If existence checks fail for any reason, fall back to the
            # original candidate and let the write call surface errors.
            new_path = candidate

        widget.set_bound_path(new_path)

        # If the title is still empty, use the new filename as a sensible
        # default so the master document representation is clearer.
        try:
            if not widget._title_edit.text().strip():  # type: ignore[attr-defined]
                widget._title_edit.setText(new_path.name)  # type: ignore[attr-defined]
        except Exception:
            pass

    def _load_from_master_file(self, path: Path) -> None:
        """Populate include containers from an existing `.master` file."""

        try:
            text = storage.read_text(path)
        except Exception:
            return

        self._master_path = path

        # Clear any existing state.
        self._include_list.clear()
        self._container_items.clear()

        lines = text.splitlines()
        i = 0
        n = len(lines)

        while i < n:
            # Skip leading blank lines.
            while i < n and not lines[i].strip():
                i += 1
            if i >= n:
                break

            # First line: optional Markdown link with full path as label.
            raw_link = lines[i].strip()
            file_path: Path | None = None
            i += 1

            if raw_link.startswith("[") and "](" in raw_link:
                try:
                    close = raw_link.index("](")
                    label = raw_link[1:close]
                    file_path = Path(label)
                except Exception:
                    file_path = None
            else:
                # Not our expected header; treat it as part of content for a
                # synthetic container with no bound file.
                i -= 1  # step back so the line is processed as content

            # Optional title line: Markdown level-2 heading.
            title = ""
            if i < n and lines[i].lstrip().startswith("## "):
                title = lines[i].lstrip()[3:].strip()
                i += 1

            # Collect content lines until a separator `---` or EOF.
            content_lines: list[str] = []
            while i < n:
                line = lines[i]
                if line.strip() == "---":
                    i += 1
                    break
                content_lines.append(line)
                i += 1

            content = "\n".join(content_lines).rstrip("\n")

            widget = IncludeContainerWidget(True, parent=self._include_list)
            item = QListWidgetItem(self._include_list)

            # Initial size hint comes from the widget; width will be stretched
            # to the viewport width by _IncludeListWidget.
            hint = widget.sizeHint()
            item.setSizeHint(hint)

            # Explicitly enable drag and drop on this list item.
            item.setFlags(item.flags() | Qt.ItemFlag.ItemIsDragEnabled | Qt.ItemFlag.ItemIsDropEnabled)

            self._include_list.addItem(item)
            self._include_list.setItemWidget(item, widget)

            self._container_items[widget] = item

            widget.deleteRequested.connect(self._on_container_delete_requested)
            widget.sizeChanged.connect(self._on_container_size_changed)
            widget.contentChanged.connect(self._on_container_modified)
            widget.filePathNeeded.connect(self._on_container_file_path_needed)
            widget.editInMainRequested.connect(self._on_container_edit_in_main_requested)
            widget.renameRequested.connect(self._on_container_rename_requested)
            widget.cloneFileRequested.connect(self._on_container_clone_file_requested)
            widget.cloneContainerRequested.connect(self._on_container_clone_container_requested)

            # Initialise widget state without triggering autosave or
            # write-back into the underlying files.
            widget.load_from_master(file_path=file_path, title=title, content=content)

        # After a successful load the in-memory state reflects the file.
        try:
            self._include_list._update_item_widths()  # type: ignore[attr-defined]
        except Exception:
            pass

        self._dirty = False
    
    def _check_and_merge_all_file_changes(self) -> None:
        """Check all containers for file changes and merge updates.
        
        This is called when opening a .master file to ensure the master
        document reflects the latest state of all referenced files.
        """
        changes_detected = False
        for row in range(self._include_list.count()):
            item = self._include_list.item(row)
            if item is None:
                continue
            widget = self._include_list.itemWidget(item)
            if not isinstance(widget, IncludeContainerWidget):
                continue
            
            try:
                if widget.check_and_merge_file_changes():
                    changes_detected = True
            except Exception:
                # Never let individual container failures affect others.
                pass
        
        # If any changes were merged, mark the master document as dirty
        # so it will be saved with the updated content.
        if changes_detected:
            self._mark_dirty()

    # Explorer / external file events ------------------------------------

    def _on_external_chapter_content_updated(self, path_obj: object, new_content: str) -> None:
        """Update live include containers when a chapter is edited in main window.

        This slot is invoked via :data:`master_sync_bus` whenever a
        :class:`MainWindow` instance reports that a chapter file's content has
        changed. Any include container whose ``file_path`` matches the
        provided *path_obj* is updated letter-for-letter so that the master
        document window reflects edits in real time.
        """

        try:
            incoming = Path(path_obj)
        except Exception:
            return

        updated = False

        for widget in list(self._container_items.keys()):
            try:
                wpath = widget.file_path
            except Exception:
                continue
            if wpath is None:
                continue

            try:
                same = Path(wpath).resolve() == incoming.resolve()
            except Exception:
                same = Path(wpath) == incoming

            if not same:
                continue

            # If the container already shows the same text, avoid resetting its
            # caret/scroll position by reapplying the content.
            try:
                existing = widget._content.toPlainText()  # type: ignore[attr-defined]
                if existing == new_content:
                    continue
            except Exception:
                existing = None

            try:
                # Replace the container content with the latest text from the
                # main editor. We go through the internal widgets directly to
                # avoid triggering master-file initialisation paths.
                try:
                    widget._syncing_from_main = True  # type: ignore[attr-defined]
                except Exception:
                    pass
                try:
                    widget._content.setPlainText(new_content)  # type: ignore[attr-defined]
                    widget._update_height()  # type: ignore[attr-defined]
                finally:
                    try:
                        widget._syncing_from_main = False  # type: ignore[attr-defined]
                    except Exception:
                        pass
            except Exception:
                continue

            updated = True

        if updated:
            # Mark the master document dirty so it will be autosaved shortly.
            self._mark_dirty()

    def _on_external_chapter_closed(self, path_obj: object) -> None:
        """Flush the master document when a linked chapter is closed.

        When a chapter file that is referenced by this master document is
        closed in the main window, we ensure any pending autosave is flushed so
        the `.master` file captures the final include content.
        """

        try:
            incoming = Path(path_obj)
        except Exception:
            return

        # Only act when at least one container is bound to the given path.
        has_match = False
        for widget in list(self._container_items.keys()):
            try:
                wpath = widget.file_path
            except Exception:
                continue
            if wpath is None:
                continue

            try:
                same = Path(wpath).resolve() == incoming.resolve()
            except Exception:
                same = Path(wpath) == incoming

            if same:
                has_match = True
                break

        if not has_match:
            return

        try:
            if self._autosave_timer.isActive():
                self._autosave_timer.stop()
        except Exception:
            pass

        try:
            self._perform_autosave()
        except Exception:
            # Synchronisation must never prevent closing a chapter.
            pass

    def _on_explorer_file_renamed(self, path: str, old_name: str, new_name: str) -> None:
        """Update containers when a file is renamed via the explorer.

        *path* is the directory containing the renamed entry; *old_name* and
        *new_name* are the base filenames. We only adjust containers whose
        bound ``file_path`` exactly matches the old full path so that master
        serialisation writes the new filename on the next autosave.
        """

        try:
            base_dir = Path(path)
        except Exception:
            return

        old_path = base_dir / old_name
        new_path = base_dir / new_name

        updated = False
        for widget, _item in list(self._container_items.items()):
            try:
                current = widget.file_path
            except Exception:
                continue
            if current is None:
                continue

            try:
                same = current.resolve() == old_path.resolve()
            except Exception:
                same = current == old_path

            if not same:
                continue

            try:
                widget.set_bound_path(new_path)
            except Exception:
                widget._file_path = new_path  # type: ignore[attr-defined]

            updated = True

        if updated:
            self._mark_dirty()

    # Container action handlers -------------------------------------------

    def _ensure_container_file_path(self, widget: IncludeContainerWidget) -> Path | None:
        """Ensure *widget* has a concrete file path, creating one if needed.

        For editable containers we mirror the behaviour used when typing in a
        container without a backing file: a new Markdown file is created inside
        the current project space. For read-only containers we do not create
        new files and instead return ``None`` when there is no bound path.
        """

        path = widget.file_path
        if path is not None:
            return path

        if not getattr(widget, "_editable", False):
            return None

        self._on_container_file_path_needed(widget)
        return widget.file_path

    def _flush_container_to_file(self, widget: IncludeContainerWidget) -> None:
        """Best-effort: flush the container's current content to disk."""

        try:
            if getattr(widget, "_editable", False):
                # Access the internal helper used by the debounced timer so we
                # do not wait for the next timeout before opening in the main
                # window or cloning the file.
                flush = getattr(widget, "_flush_to_file", None)
                if callable(flush):
                    flush()
        except Exception:
            return

    def _on_container_edit_in_main_requested(self, widget: IncludeContainerWidget) -> None:
        """Open the container's chapter file for editing in the main window."""

        path = self._ensure_container_file_path(widget)
        if path is None:
            QMessageBox.information(
                self,
                self.tr("Edit chapter"),
                self.tr("This include is not bound to a file yet."),
            )
            return

        # Ensure the latest content is on disk before handing it to the main
        # window so that both editors see the same text.
        self._flush_container_to_file(widget)

        # Try to reuse an existing MainWindow; otherwise create a new one.
        from PySide6.QtWidgets import QApplication  # local import

        app = QApplication.instance()
        if app is None:
            return

        main_window = None
        try:
            from .main_window import MainWindow  # local import to avoid cycles

            for w in app.topLevelWidgets():
                if isinstance(w, MainWindow):
                    main_window = w
                    break
        except Exception:
            main_window = None

        if main_window is None:
            try:
                from .main_window import MainWindow  # type: ignore[no-redef]

                main_window = MainWindow(self._settings, parent=None)
                main_window.show()

                try:
                    main_window.raise_()
                    main_window.activateWindow()
                except Exception:
                    pass

                extra = getattr(app, "_extra_windows", None)
                if not isinstance(extra, list):
                    extra = []
                    setattr(app, "_extra_windows", extra)
                extra.append(main_window)
            except Exception:
                return

        try:
            # Delegate to the main window's existing open logic so all
            # project-space mapping and metadata behaviour is preserved.
            open_from_path = getattr(main_window, "_load_document_from_path", None)
            if callable(open_from_path):
                open_from_path(path)
        except Exception:
            return

        try:
            main_window.raise_()
            main_window.activateWindow()
        except Exception:
            pass

    def _on_container_rename_requested(self, widget: IncludeContainerWidget) -> None:
        """Show the chapter file in the explorer and start inline rename."""

        path = self._ensure_container_file_path(widget)
        if path is None:
            QMessageBox.information(
                self,
                self.tr("Rename chapter file"),
                self.tr("This include is not bound to a file yet."),
            )
            return

        explorer = self._explorer
        if explorer is None:
            return

        try:
            model = explorer.model()
            index = model.index(str(path))
            if not index.isValid():
                return

            # Allow renaming and focus the item so the user can edit the name.
            try:
                model.setReadOnly(False)
            except Exception:
                pass

            explorer.setCurrentIndex(index)
            explorer.scrollTo(index, QAbstractItemView.ScrollHint.PositionAtCenter)
            explorer.setFocus(Qt.FocusReason.OtherFocusReason)
            explorer.edit(index)
        except Exception:
            return

    def _build_clone_path(self, source: Path) -> Path:
        """Return a filesystem path for a cloned chapter file.

        The clone is created in the same directory as *source* using the
        naming pattern ``"<stem> copy<suffix>"`` with a numeric suffix when
        needed to avoid overwriting existing files.
        """

        directory = source.parent
        stem = source.stem
        suffix = source.suffix or ""

        candidate = directory / f"{stem} copy{suffix}"
        index = 2
        try:
            while candidate.exists():
                candidate = directory / f"{stem} copy {index}{suffix}"
                index += 1
        except Exception:
            # If existence checks fail for any reason, keep the last candidate
            # and let the write call surface any error.
            pass
        return candidate

    def _on_container_clone_file_requested(self, widget: IncludeContainerWidget) -> None:
        """Create a cloned copy of the underlying chapter file on disk."""

        path = self._ensure_container_file_path(widget)
        if path is None:
            QMessageBox.information(
                self,
                self.tr("Clone file"),
                self.tr("This include is not bound to a file yet."),
            )
            return

        self._flush_container_to_file(widget)

        clone_path = self._build_clone_path(path)

        try:
            # Use the container's current content as the source so the clone
            # reflects what the user sees, even if autosave has not fired yet.
            content = ""
            try:
                content = widget._content.toPlainText()  # type: ignore[attr-defined]
            except Exception:
                try:
                    content = storage.read_text(path)
                except Exception:
                    content = ""

            storage.write_text(clone_path, content)
        except Exception:
            QMessageBox.warning(
                self,
                self.tr("Clone file"),
                self.tr("The file could not be cloned."),
            )
            return

        QMessageBox.information(
            self,
            self.tr("Clone file"),
            self.tr("The file was cloned."),
        )

        # Optionally focus the new file in the explorer for discoverability.
        explorer = self._explorer
        if explorer is not None:
            try:
                model = explorer.model()
                index = model.index(str(clone_path))
                if index.isValid():
                    explorer.setCurrentIndex(index)
                    explorer.scrollTo(index, QAbstractItemView.ScrollHint.PositionAtCenter)
            except Exception:
                pass

    def _on_container_clone_container_requested(self, widget: IncludeContainerWidget) -> None:
        """Clone both the chapter file and the include container below it."""

        path = self._ensure_container_file_path(widget)
        if path is None:
            QMessageBox.information(
                self,
                self.tr("Clone container"),
                self.tr("This include is not bound to a file yet."),
            )
            return

        self._flush_container_to_file(widget)

        clone_path = self._build_clone_path(path)

        try:
            content = ""
            try:
                content = widget._content.toPlainText()  # type: ignore[attr-defined]
            except Exception:
                try:
                    content = storage.read_text(path)
                except Exception:
                    content = ""

            storage.write_text(clone_path, content)
        except Exception:
            QMessageBox.warning(
                self,
                self.tr("Clone container"),
                self.tr("The container could not be cloned."),
            )
            return

        # Create a new include container immediately below the original.
        original_item = self._container_items.get(widget)
        if original_item is None:
            return

        original_row = self._include_list.row(original_item)
        if original_row < 0:
            return

        cloned_widget = IncludeContainerWidget(getattr(widget, "_editable", False), parent=self._include_list)
        cloned_item = QListWidgetItem(self._include_list)

        # Height hint mirrors existing containers; width is stretched globally.
        hint = cloned_widget.sizeHint()
        cloned_item.setSizeHint(hint)
        cloned_item.setFlags(
            cloned_item.flags()
            | Qt.ItemFlag.ItemIsDragEnabled
            | Qt.ItemFlag.ItemIsDropEnabled
        )

        insert_row = original_row + 1
        self._include_list.insertItem(insert_row, cloned_item)
        self._include_list.setItemWidget(cloned_item, cloned_widget)

        self._container_items[cloned_widget] = cloned_item

        cloned_widget.deleteRequested.connect(self._on_container_delete_requested)
        cloned_widget.sizeChanged.connect(self._on_container_size_changed)
        cloned_widget.contentChanged.connect(self._on_container_modified)
        cloned_widget.filePathNeeded.connect(self._on_container_file_path_needed)
        cloned_widget.editInMainRequested.connect(self._on_container_edit_in_main_requested)
        cloned_widget.renameRequested.connect(self._on_container_rename_requested)
        cloned_widget.cloneFileRequested.connect(self._on_container_clone_file_requested)
        cloned_widget.cloneContainerRequested.connect(self._on_container_clone_container_requested)

        try:
            # Bind to the cloned file and populate content/title.
            cloned_widget.set_bound_path(clone_path)
            # Preserve the original title where possible.
            try:
                cloned_widget._title_edit.setText(widget._title_edit.text())  # type: ignore[attr-defined]
            except Exception:
                pass
            # Use the already-fetched content so we do not re-read from disk.
            try:
                cloned_widget._content.setPlainText(content)  # type: ignore[attr-defined]
            except Exception:
                pass
            # Update internal sizing hints.
            cloned_widget._update_height()  # type: ignore[attr-defined]
        except Exception:
            pass

        try:
            self._include_list._update_item_widths()  # type: ignore[attr-defined]
        except Exception:
            pass

        self._mark_dirty()

    # Context menu --------------------------------------------------------

    def _on_work_area_context_menu(self, pos: QPoint) -> None:  # pragma: no cover - UI wiring
        global_pos = self._include_list.viewport().mapToGlobal(pos)

        menu = QMenu(self)
        add_menu = menu.addMenu(self.tr("Add"))

        editable_action = QAction(self.tr("Editable live include container"), self)
        editable_action.triggered.connect(lambda: self._add_include_container(editable=True))
        add_menu.addAction(editable_action)

        readonly_action = QAction(self.tr("Read only include container"), self)
        readonly_action.triggered.connect(lambda: self._add_include_container(editable=False))
        add_menu.addAction(readonly_action)

        menu.exec(global_pos)

    # Autosave and serialisation -------------------------------------------

    def _mark_dirty(self) -> None:
        """Mark the master document as dirty and schedule an autosave."""

        self._dirty = True
        if self._autosave_timer.isActive():
            self._autosave_timer.stop()
        self._autosave_timer.start()

    def _ensure_master_path(self) -> Path | None:
        """Ensure there is a backing `.master` file path.

        New master documents are created inside the current project space
        using a timestamp-based filename.
        """

        if self._master_path is not None:
            return self._master_path

        if self._project_space is None:
            # Without a project space we have nowhere to persist the master
            # document; treat this as a no-op rather than raising.
            return None

        timestamp = datetime.now().strftime("%Y%m%d-%H%M%S")
        path = self._project_space / f"master-{timestamp}.master"
        self._master_path = path
        return path

    def _serialise_to_text(self) -> str:
        """Return a Markdown-like text representation of the master doc.

        Each include container is rendered as:

        * full path of the underlying file as a clickable file:// link
        * the container title as a heading
        * the current container content
        """

        parts: list[str] = []

        for row in range(self._include_list.count()):
            item = self._include_list.item(row)
            if item is None:
                continue
            widget = self._include_list.itemWidget(item)
            if not isinstance(widget, IncludeContainerWidget):
                continue

            path = widget.file_path
            title = widget._title_edit.text() if hasattr(widget, "_title_edit") else ""
            content = widget._content.toPlainText() if hasattr(widget, "_content") else ""

            if path is not None:
                full = str(path)
                parts.append(f"[{full}](file://{full})")

            title = (title or "").strip()
            if title:
                parts.append(f"## {title}")

            if content:
                parts.append("")
                parts.append(content.rstrip())

            # Separator between includes.
            parts.append("")
            parts.append("---")
            parts.append("")

        text = "\n".join(parts).rstrip() + "\n"
        return text

    def _perform_autosave(self) -> None:  # pragma: no cover - UI wiring
        """Persist the master document to its `.master` file and version it."""

        if not self._dirty:
            return

        path = self._ensure_master_path()
        if path is None:
            return

        try:
            body_md = self._serialise_to_text()
            storage.write_text(path, body_md)
            self._dirty = False
        except Exception:
            # Core persistence must be robust; if writing fails we keep the
            # dirty flag so that a later attempt may still succeed.
            return

        # Enqueue a full-snapshot update for versioning, mirroring the
        # behaviour used for regular documents.
        try:
            device_id = getattr(self._settings, "device_id", None) or "desktop"
            local_queue.enqueue_full_snapshot_update(
                path,
                device_id=device_id,
                body_md=body_md,
                body_html=None,
            )
        except Exception:
            # Versioning must never interfere with core behaviour.
            pass

    # ------------------------------------------------------------------
    # Save as helpers
    # ------------------------------------------------------------------

    def _get_combined_content(self) -> str:
        """Collect all container content into a single text string."""

        parts: list[str] = []
        for row in range(self._include_list.count()):
            item = self._include_list.item(row)
            if item is None:
                continue
            widget = self._include_list.itemWidget(item)
            if not isinstance(widget, IncludeContainerWidget):
                continue

            title = widget._title_edit.text() if hasattr(widget, "_title_edit") else ""
            content = widget._content.toPlainText() if hasattr(widget, "_content") else ""

            title = (title or "").strip()
            if title:
                parts.append(f"# {title}")
                parts.append("")

            if content:
                parts.append(content.rstrip())
                parts.append("")

        return "\n".join(parts).rstrip() + "\n"

    def _is_path_inside_space(self, target_path: Path) -> bool:
        """Return True if *target_path* is inside the current project space."""

        if self._project_space is None:
            return False

        try:
            space_resolved = self._project_space.resolve()
            target_resolved = target_path.resolve()
            return str(target_resolved).startswith(str(space_resolved) + "/") or target_resolved == space_resolved
        except Exception:
            return False

    def _show_outside_space_dialog(self, file_type: str) -> str:
        """Show a dialog when saving .story/.screenplay outside the current Space.

        Returns:
            "yes" - save outside space, reset space to None
            "cancel" - abort the operation
            "set_space" - user wants to set/create new space at target location
        """

        msg_box = QMessageBox(self)
        msg_box.setWindowTitle(self.tr("Save outside Space"))
        msg_box.setText(
            self.tr(
                "You're about to save the {file_type} file outside of a creative Space. "
                "Do you really want to do that?"
            ).format(file_type=file_type)
        )

        yes_btn = msg_box.addButton(self.tr("Yes"), QMessageBox.ButtonRole.AcceptRole)
        cancel_btn = msg_box.addButton(self.tr("Cancel"), QMessageBox.ButtonRole.RejectRole)
        set_space_btn = msg_box.addButton(
            self.tr("Set | Create new Space"), QMessageBox.ButtonRole.ActionRole
        )

        msg_box.exec()

        clicked = msg_box.clickedButton()
        if clicked == yes_btn:
            return "yes"
        elif clicked == set_space_btn:
            return "set_space"
        else:
            return "cancel"

    def _save_as_md(self) -> None:  # pragma: no cover - UI wiring
        """Save the combined master document content as a .md file."""

        content = self._get_combined_content()
        if not content.strip():
            QMessageBox.information(
                self,
                self.tr("Save as"),
                self.tr("The master document is empty; there is nothing to save."),
            )
            return

        # Suggest a default filename based on master document path or timestamp
        if self._master_path:
            default_name = f"{self._master_path.stem}.md"
        else:
            timestamp = datetime.now().strftime("%Y%m%d-%H%M%S")
            default_name = f"master-export-{timestamp}.md"

        start_dir = str(self._project_space) if self._project_space else ""
        if start_dir:
            initial = str(Path(start_dir) / default_name)
        else:
            initial = default_name

        path_str, _ = QFileDialog.getSaveFileName(
            self,
            self.tr("Save as Markdown"),
            initial,
            self.tr("Markdown files (*.md);;All files (*)"),
        )
        if not path_str:
            return

        target_path = Path(path_str)
        if target_path.suffix.lower() != ".md":
            target_path = target_path.with_suffix(".md")

        # Check if outside current Space
        if not self._is_path_inside_space(target_path):
            # For .md files, simply reset the Space to None without asking
            if self._project_space is not None:
                self._project_space = None
                try:
                    if self._settings is not None:
                        self._settings.project_space = None
                        save_settings(self._settings)
                except Exception:
                    pass

        try:
            storage.write_text(target_path, content)

            bar = self.statusBar()
            if bar is not None:
                bar.showMessage(
                    self.tr("Saved document to: {path}").format(path=target_path),
                    5000,
                )
        except Exception:
            import traceback
            traceback.print_exc()
            QMessageBox.critical(
                self,
                self.tr("Save failed"),
                self.tr("An unexpected error occurred while saving the document."),
            )

    def _save_as_story(self) -> None:  # pragma: no cover - UI wiring
        """Save the combined master document content as a .story file."""

        content = self._get_combined_content()
        if not content.strip():
            QMessageBox.information(
                self,
                self.tr("Save as"),
                self.tr("The master document is empty; there is nothing to save."),
            )
            return

        # Suggest a default filename
        if self._master_path:
            default_name = f"{self._master_path.stem}.story"
        else:
            timestamp = datetime.now().strftime("%Y%m%d-%H%M%S")
            default_name = f"master-export-{timestamp}.story"

        start_dir = str(self._project_space) if self._project_space else ""
        if start_dir:
            initial = str(Path(start_dir) / default_name)
        else:
            initial = default_name

        path_str, _ = QFileDialog.getSaveFileName(
            self,
            self.tr("Save as Story"),
            initial,
            self.tr("Story files (*.story);;All files (*)"),
        )
        if not path_str:
            return

        target_path = Path(path_str)
        if target_path.suffix.lower() != ".story":
            target_path = target_path.with_suffix(".story")

        # Check if outside current Space (or none set at all)
        if not self._is_path_inside_space(target_path):
            result = self._show_outside_space_dialog("story")
            if result == "cancel":
                return
            elif result == "yes":
                # Reset Space to None
                self._project_space = None
                try:
                    if self._settings is not None:
                        self._settings.project_space = None
                        save_settings(self._settings)
                except Exception:
                    pass
            elif result == "set_space":
                # Set the target directory as the new Space
                new_space = target_path.parent
                self._project_space = new_space
                try:
                    if self._settings is not None:
                        # Ensure the space is registered
                        spaces = getattr(self._settings, "spaces", None) or []
                        if not isinstance(spaces, list):
                            spaces = []
                        if new_space not in spaces:
                            spaces.append(new_space)
                            self._settings.spaces = spaces
                        self._settings.project_space = new_space
                        save_settings(self._settings)
                except Exception:
                    pass

        try:
            # Generate a new story_id
            new_story_id = str(uuid.uuid4())

            # Convert content to story DSL
            try:
                dsl_content = story_markup.markdown_to_dsl(content)
            except Exception:
                dsl_content = content

            # Write the file
            storage.write_text(target_path, dsl_content)

            # Set the story metadata
            file_metadata.set_attr(target_path, file_metadata.FIELD_STORY_ID, new_story_id)
            file_metadata.set_attr(target_path, file_metadata.FIELD_BODY_FORMAT, "story_v1")
            file_metadata.set_attr(target_path, file_metadata.FIELD_CREATION_DATE, file_metadata.now_human())
            file_metadata.touch_change_date(target_path)

            bar = self.statusBar()
            if bar is not None:
                bar.showMessage(
                    self.tr("Saved story to: {path} (Story ID: {id})").format(
                        path=target_path, id=new_story_id
                    ),
                    5000,
                )
        except Exception:
            import traceback
            traceback.print_exc()
            QMessageBox.critical(
                self,
                self.tr("Save failed"),
                self.tr("An unexpected error occurred while saving the story."),
            )

    def _save_as_screenplay(self) -> None:  # pragma: no cover - UI wiring
        """Save the combined master document content as a .screenplay file."""

        content = self._get_combined_content()
        if not content.strip():
            QMessageBox.information(
                self,
                self.tr("Save as"),
                self.tr("The master document is empty; there is nothing to save."),
            )
            return

        # Suggest a default filename
        if self._master_path:
            default_name = f"{self._master_path.stem}.screenplay"
        else:
            timestamp = datetime.now().strftime("%Y%m%d-%H%M%S")
            default_name = f"master-export-{timestamp}.screenplay"

        start_dir = str(self._project_space) if self._project_space else ""
        if start_dir:
            initial = str(Path(start_dir) / default_name)
        else:
            initial = default_name

        path_str, _ = QFileDialog.getSaveFileName(
            self,
            self.tr("Save as Screenplay"),
            initial,
            self.tr("Screenplay files (*.screenplay);;All files (*)"),
        )
        if not path_str:
            return

        target_path = Path(path_str)
        if target_path.suffix.lower() != ".screenplay":
            target_path = target_path.with_suffix(".screenplay")

        # Check if outside current Space (or none set at all)
        if not self._is_path_inside_space(target_path):
            result = self._show_outside_space_dialog("screenplay")
            if result == "cancel":
                return
            elif result == "yes":
                # Reset Space to None
                self._project_space = None
                try:
                    if self._settings is not None:
                        self._settings.project_space = None
                        save_settings(self._settings)
                except Exception:
                    pass
            elif result == "set_space":
                # Set the target directory as the new Space
                new_space = target_path.parent
                self._project_space = new_space
                try:
                    if self._settings is not None:
                        # Ensure the space is registered
                        spaces = getattr(self._settings, "spaces", None) or []
                        if not isinstance(spaces, list):
                            spaces = []
                        if new_space not in spaces:
                            spaces.append(new_space)
                            self._settings.spaces = spaces
                        self._settings.project_space = new_space
                        save_settings(self._settings)
                except Exception:
                    pass

        try:
            # Generate a new screenplay_id
            new_screenplay_id = str(uuid.uuid4())

            # Convert content to screenplay DSL
            try:
                dsl_content = screenplay_markup.markdown_to_dsl(content)
            except Exception:
                dsl_content = content

            # Write the file
            storage.write_text(target_path, dsl_content)

            # Set the screenplay metadata
            file_metadata.set_attr(target_path, "screenplay_id", new_screenplay_id)
            file_metadata.set_attr(target_path, file_metadata.FIELD_BODY_FORMAT, "screenplay_v1")
            file_metadata.set_attr(target_path, file_metadata.FIELD_CREATION_DATE, file_metadata.now_human())
            file_metadata.touch_change_date(target_path)

            bar = self.statusBar()
            if bar is not None:
                bar.showMessage(
                    self.tr("Saved screenplay to: {path} (Screenplay ID: {id})").format(
                        path=target_path, id=new_screenplay_id
                    ),
                    5000,
                )
        except Exception:
            import traceback
            traceback.print_exc()
            QMessageBox.critical(
                self,
                self.tr("Save failed"),
                self.tr("An unexpected error occurred while saving the screenplay."),
            )

    def closeEvent(self, event) -> None:  # pragma: no cover - UI wiring
        """Ensure pending changes are flushed before the window closes."""

        if self._autosave_timer.isActive():
            self._autosave_timer.stop()
        self._perform_autosave()
        super().closeEvent(event)

    def _retranslate_window_ui(self) -> None:
        """(Re-)apply translatable strings for the master document window."""

        # Window title and dock titles.
        try:
            self.setWindowTitle(self.tr("Master document"))
        except Exception:
            pass
        try:
            self._explorer_dock.setWindowTitle(self.tr("File explorer"))
        except Exception:
            pass

        # Save as menu.
        try:
            if hasattr(self, "_save_as_menu"):
                self._save_as_menu.setTitle(self.tr("Save as"))
        except Exception:
            pass
        try:
            if hasattr(self, "_action_save_as_md"):
                self._action_save_as_md.setText(self.tr("as .md file"))
        except Exception:
            pass
        try:
            if hasattr(self, "_action_save_as_story"):
                self._action_save_as_story.setText(self.tr("as .story file"))
        except Exception:
            pass
        try:
            if hasattr(self, "_action_save_as_screenplay"):
                self._action_save_as_screenplay.setText(self.tr("as .screenplay file"))
        except Exception:
            pass
        try:
            self._view_menu.setTitle(self.tr("View"))
        except Exception:
            pass

        # Propagate language changes to all include containers.
        try:
            for widget in self._container_items.keys():
                retranslate = getattr(widget, "_retranslate_ui", None)
                if callable(retranslate):
                    retranslate()
        except Exception:
            pass

    def changeEvent(self, event):  # pragma: no cover - UI wiring
        if event.type() == QEvent.LanguageChange:
            self._retranslate_window_ui()
        super().changeEvent(event)
