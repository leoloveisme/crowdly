"""Crowdly web login dialog.

This is separate from the local Postgres-backed login dialog.

The intent is to authenticate against the Crowdly web platform when opening a
private story.

Today we implement a minimal credential prompt and use HTTP Basic auth for
subsequent requests. If Crowdly uses a different auth mechanism (cookie/JWT),
we can adapt this dialog + client later.
"""

from __future__ import annotations

from dataclasses import dataclass

from PySide6.QtCore import Qt
from PySide6.QtWidgets import (
    QDialog,
    QDialogButtonBox,
    QFormLayout,
    QHBoxLayout,
    QLabel,
    QLineEdit,
    QPushButton,
    QVBoxLayout,
    QWidget,
)


@dataclass(frozen=True)
class CrowdlyCredentials:
    username: str
    password: str


class CrowdlyLoginDialog(QDialog):
    """Prompt for Crowdly web credentials."""

    def __init__(self, parent: object | None = None) -> None:
        super().__init__(parent)

        self.setWindowTitle(self.tr("Please login"))
        self.setModal(True)

        layout = QVBoxLayout(self)

        form_widget = QWidget(self)
        form = QFormLayout(form_widget)

        self._username = QLineEdit(form_widget)
        form.addRow(QLabel(self.tr("Email"), form_widget), self._username)

        pwd_widget = QWidget(form_widget)
        pwd_layout = QHBoxLayout(pwd_widget)
        pwd_layout.setContentsMargins(0, 0, 0, 0)

        self._password = QLineEdit(pwd_widget)
        self._password.setEchoMode(QLineEdit.Password)

        self._toggle_password_btn = QPushButton(self.tr("Show"), pwd_widget)
        self._toggle_password_btn.setCheckable(True)
        self._toggle_password_btn.setFocusPolicy(Qt.NoFocus)
        self._toggle_password_btn.toggled.connect(self._on_toggle_password_visibility)

        pwd_layout.addWidget(self._password)
        pwd_layout.addWidget(self._toggle_password_btn)

        form.addRow(QLabel(self.tr("Password"), form_widget), pwd_widget)

        layout.addWidget(form_widget)

        buttons = QDialogButtonBox(QDialogButtonBox.Ok | QDialogButtonBox.Cancel, self)
        buttons.button(QDialogButtonBox.Ok).setText(self.tr("Login"))
        buttons.accepted.connect(self.accept)
        buttons.rejected.connect(self.reject)
        layout.addWidget(buttons)

        self._buttons = buttons

    def credentials(self) -> CrowdlyCredentials | None:
        username = self._username.text().strip()
        password = self._password.text()
        if not username or not password:
            return None
        return CrowdlyCredentials(username=username, password=password)

    def _on_toggle_password_visibility(self, checked: bool) -> None:
        if checked:
            self._password.setEchoMode(QLineEdit.Normal)
            self._toggle_password_btn.setText(self.tr("Hide"))
        else:
            self._password.setEchoMode(QLineEdit.Password)
            self._toggle_password_btn.setText(self.tr("Show"))
