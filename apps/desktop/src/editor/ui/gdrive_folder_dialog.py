"""Browse-and-pick dialog for choosing the Google Drive folder a local Space syncs with."""

from __future__ import annotations

from PySide6.QtCore import Qt
from PySide6.QtWidgets import (
    QDialog,
    QDialogButtonBox,
    QHBoxLayout,
    QInputDialog,
    QLabel,
    QListWidget,
    QListWidgetItem,
    QMessageBox,
    QPushButton,
    QVBoxLayout,
)

from ..gdrive.api import DriveClient, DriveFolder


class GoogleDriveFolderDialog(QDialog):
    """Folder-by-folder browser over the signed-in account's Drive.

    Double-click (or "Open") enters a folder; "Connect this folder" picks the
    folder currently shown. Network calls are small and quick, so they run on
    the UI thread with a busy cursor.
    """

    def __init__(self, client: DriveClient, *, account_email: str | None, default_new_name: str, parent=None) -> None:
        super().__init__(parent)
        self._client = client
        self._default_new_name = default_new_name
        self._trail: list[DriveFolder] = [DriveFolder("root", self.tr("My Drive"))]
        self.selected: DriveFolder | None = None

        self.setWindowTitle(self.tr("Choose a Google Drive folder"))
        self.setModal(True)
        self.resize(460, 420)

        layout = QVBoxLayout(self)
        if account_email:
            layout.addWidget(QLabel(self.tr("Google account: {email}").format(email=account_email), self))
        hint = QLabel(
            self.tr("The folder you open here, including all its subfolders, will be synced with this Space."),
            self,
        )
        hint.setWordWrap(True)
        layout.addWidget(hint)

        self._path_label = QLabel(self)
        self._path_label.setTextFormat(Qt.TextFormat.PlainText)
        layout.addWidget(self._path_label)

        self._list = QListWidget(self)
        self._list.itemDoubleClicked.connect(self._enter_item)
        layout.addWidget(self._list, 1)

        nav = QHBoxLayout()
        self._up_button = QPushButton(self.tr("Up"), self)
        self._up_button.clicked.connect(self._go_up)
        self._open_button = QPushButton(self.tr("Open"), self)
        self._open_button.clicked.connect(lambda: self._enter_item(self._list.currentItem()))
        self._new_button = QPushButton(self.tr("New folder…"), self)
        self._new_button.clicked.connect(self._create_folder)
        nav.addWidget(self._up_button)
        nav.addWidget(self._open_button)
        nav.addStretch(1)
        nav.addWidget(self._new_button)
        layout.addLayout(nav)

        buttons = QDialogButtonBox(QDialogButtonBox.Ok | QDialogButtonBox.Cancel, self)
        self._connect_button = buttons.button(QDialogButtonBox.Ok)
        self._connect_button.setText(self.tr("Connect this folder"))
        buttons.accepted.connect(self._accept_current)
        buttons.rejected.connect(self.reject)
        layout.addWidget(buttons)

        self._reload()

    def _current(self) -> DriveFolder:
        return self._trail[-1]

    def _reload(self) -> None:
        from PySide6.QtWidgets import QApplication

        self._path_label.setText(" / ".join(f.name for f in self._trail))
        self._up_button.setEnabled(len(self._trail) > 1)
        self._connect_button.setEnabled(len(self._trail) > 1)  # never sync all of My Drive
        self._list.clear()
        QApplication.setOverrideCursor(Qt.CursorShape.WaitCursor)
        try:
            folders = self._client.list_child_folders(self._current().id)
        except Exception as exc:  # pragma: no cover - network dependent
            QApplication.restoreOverrideCursor()
            QMessageBox.warning(self, self.windowTitle(), self.tr("Could not list folders:\n{error}").format(error=str(exc)))
            return
        QApplication.restoreOverrideCursor()
        for folder in folders:
            item = QListWidgetItem(f"📁 {folder.name}")
            item.setData(Qt.ItemDataRole.UserRole, folder)
            self._list.addItem(item)
        self._open_button.setEnabled(bool(folders))

    def _enter_item(self, item: QListWidgetItem | None) -> None:
        if item is None:
            return
        self._trail.append(item.data(Qt.ItemDataRole.UserRole))
        self._reload()

    def _go_up(self) -> None:
        if len(self._trail) > 1:
            self._trail.pop()
            self._reload()

    def _create_folder(self) -> None:
        name, ok = QInputDialog.getText(
            self, self.tr("New folder"), self.tr("Folder name:"), text=self._default_new_name
        )
        name = name.strip()
        if not ok or not name:
            return
        try:
            folder = self._client.create_folder(name, self._current().id)
        except Exception as exc:  # pragma: no cover - network dependent
            QMessageBox.warning(self, self.windowTitle(), self.tr("Could not create the folder:\n{error}").format(error=str(exc)))
            return
        self._trail.append(folder)
        self._reload()

    def _accept_current(self) -> None:
        if len(self._trail) > 1:
            self.selected = self._current()
            self.accept()
