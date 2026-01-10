"""Master Document window and include containers.

This module implements a dedicated full-window workspace for composing a
"Master document" from multiple included files. It provides:

* A dockable file explorer pane for dragging files into the workspace.
* A central list of include containers that can be added via a
  right-click menu, reordered via drag-and-drop, edited inline, deleted,
  and collapsed/expanded.
"""

from __future__ import annotations

from pathlib import Path
from typing import Dict
from datetime import datetime

from PySide6.QtCore import Qt, QPoint, Signal, QTimer, QEvent
from PySide6.QtGui import QAction
from PySide6.QtWidgets import (
    QAbstractItemView,
    QDockWidget,
    QHBoxLayout,
    QLineEdit,
    QListWidget,
    QListWidgetItem,
    QMainWindow,
    QMenu,
    QPlainTextEdit,
    QSizePolicy,
    QToolButton,
    QVBoxLayout,
    QWidget,
)

from .. import storage
from ..versioning import local_queue
from .file_explorer_widget import FileExplorerWidget


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
    """

    def __init__(self, *args, **kwargs) -> None:  # pragma: no cover - UI wiring
        super().__init__(*args, **kwargs)
        # Ensure smooth scrolling during drag operations.
        self.setVerticalScrollMode(QAbstractItemView.ScrollPerPixel)
        self.setAutoScroll(True)
        # Use a slightly larger margin so scrolling kicks in before the
        # cursor hits the exact edge of the viewport.
        self.setAutoScrollMargin(32)

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

    def __init__(self, editable: bool, parent: object | None = None) -> None:
        super().__init__(parent)

        self._editable = editable
        self._file_path: Path | None = None
        self._collapsed = False
        self._loading_from_master = False
        # Track drag gestures that start from the header/toolbar area.
        self._drag_start_pos: QPoint | None = None

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
        self.contentChanged.emit()

    # Internal helpers ---------------------------------------------------

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

        self.adjustSize()
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

        # Path to the backing `.master` file and simple dirty flag.
        self._master_path: Path | None = master_path
        self._dirty: bool = False

        # Debounced autosave timer for the master document itself.
        self._autosave_timer = QTimer(self)
        self._autosave_timer.setSingleShot(True)
        self._autosave_timer.setInterval(2000)
        self._autosave_timer.timeout.connect(self._perform_autosave)

        self._setup_ui()

        # When opening an existing `.master` file, populate the workspace
        # from its contents.
        if master_path is not None:
            try:
                self._load_from_master_file(master_path)
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
        self._explorer_dock = QDockWidget(self.tr("File explorer"), self)
        self._explorer_dock.setObjectName("master_document_file_explorer")
        self._explorer_dock.setWidget(explorer)
        self._explorer_dock.setAllowedAreas(
            Qt.DockWidgetArea.LeftDockWidgetArea
            | Qt.DockWidgetArea.RightDockWidgetArea
            | Qt.DockWidgetArea.TopDockWidgetArea
            | Qt.DockWidgetArea.BottomDockWidgetArea
        )
        self.addDockWidget(Qt.DockWidgetArea.LeftDockWidgetArea, self._explorer_dock)

        # Simple menu bar with a View menu for toggling the explorer.
        view_menu = self.menuBar().addMenu(self.tr("View"))
        view_menu.addAction(self._explorer_dock.toggleViewAction())

    # Include containers --------------------------------------------------

    def _add_include_container(self, editable: bool) -> None:
        widget = IncludeContainerWidget(editable, parent=self._include_list)
        item = QListWidgetItem(self._include_list)

        # Force the row to span the full viewport width; only the height is
        # driven by the widget's size hint.
        hint = widget.sizeHint()
        try:
            viewport_width = self._include_list.viewport().width()
        except Exception:
            viewport_width = 0
        if viewport_width > 0:
            hint.setWidth(viewport_width)
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
            # Preserve width equal to the viewport width and only adjust the
            # height so that containers always span the full work area.
            current = item.sizeHint()
            new_hint = sender.sizeHint()
            if not current.isValid():
                current = new_hint
            else:
                current.setHeight(new_hint.height())

            try:
                viewport_width = self._include_list.viewport().width()
            except Exception:
                viewport_width = 0
            if viewport_width > 0:
                current.setWidth(viewport_width)

            item.setSizeHint(current)

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

            hint = widget.sizeHint()
            try:
                viewport_width = self._include_list.viewport().width()
            except Exception:
                viewport_width = 0
            if viewport_width > 0:
                hint.setWidth(viewport_width)
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

            # Initialise widget state without triggering autosave or
            # write-back into the underlying files.
            widget.load_from_master(file_path=file_path, title=title, content=content)

        # After a successful load the in-memory state reflects the file.
        self._dirty = False

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

    def closeEvent(self, event) -> None:  # pragma: no cover - UI wiring
        """Ensure pending changes are flushed before the window closes."""

        if self._autosave_timer.isActive():
            self._autosave_timer.stop()
        self._perform_autosave()
        super().closeEvent(event)
