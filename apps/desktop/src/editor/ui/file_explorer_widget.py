"""File explorer widget for the Master Document window.

Provides a read-only, drag-enabled view over the filesystem using
QFileSystemModel so that files can be dragged into include containers.
"""

from __future__ import annotations

from pathlib import Path

from PySide6.QtCore import Qt
from PySide6.QtWidgets import QFileSystemModel, QTreeView, QAbstractItemView


class FileExplorerWidget(QTreeView):
    """Simple file/directory explorer with drag support.

    The widget is read-only and intended to be embedded inside a
    QDockWidget. It exposes the current project space (when provided) or
    the user's home directory as the root.
    """

    def __init__(self, project_space: Path | None = None, parent: object | None = None) -> None:
        super().__init__(parent)

        self._model = QFileSystemModel(self)
        self._model.setReadOnly(True)

        # Determine root path: prefer project space when available.
        root_path: Path
        if isinstance(project_space, Path):
            root_path = project_space
        else:
            root_path = Path.home()

        root_index = self._model.setRootPath(str(root_path))

        self.setModel(self._model)
        self.setRootIndex(root_index)

        # Hide all columns except the name for a cleaner, distraction-free look.
        for column in range(1, self._model.columnCount()):
            self.hideColumn(column)

        self.setHeaderHidden(True)

        # Enable dragging of files/directories so they can be dropped onto
        # include containers. We use the standard text/uri-list payload.
        self.setDragEnabled(True)
        self.setDragDropMode(QAbstractItemView.DragOnly)
        self.setSelectionMode(QAbstractItemView.SingleSelection)

        # Limit drops into the explorer; it is a source, not a target.
        self.setAcceptDrops(False)
        self.setDefaultDropAction(Qt.CopyAction)

    def set_project_space(self, project_space: Path | None) -> None:
        """Update the root directory shown in the explorer.

        When *project_space* is ``None`` or invalid, falls back to the
        user's home directory.
        """

        if isinstance(project_space, Path):
            root_path = project_space
        else:
            root_path = Path.home()

        root_index = self._model.setRootPath(str(root_path))
        self.setRootIndex(root_index)
