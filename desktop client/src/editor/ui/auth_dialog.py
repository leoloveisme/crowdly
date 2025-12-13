"""Authentication dialog with Login and Register tabs.

The Login tab allows the user to enter credentials stored in the local
PostgreSQL ``crowdly`` database (``local_users`` table). The Register
tab is currently a placeholder.
"""

from __future__ import annotations

from typing import Optional

from PySide6.QtCore import Qt
from PySide6.QtWidgets import (
    QDialog,
    QDialogButtonBox,
    QFormLayout,
    QHBoxLayout,
    QLabel,
    QLineEdit,
    QPushButton,
    QTabWidget,
    QVBoxLayout,
    QWidget,
)

from ..auth import AuthResult, authenticate


class AuthDialog(QDialog):
    """Dialog providing Login and Register tabs.

    The Login tab is the default and contains "user name" and
    "password" fields along with a show/hide password toggle. When the
    user clicks the Login button and authentication succeeds, the dialog
    is accepted and :meth:`username` returns the logged-in user name.
    """

    def __init__(self, parent: Optional[object] = None) -> None:
        super().__init__(parent)

        self._username_value: Optional[str] = None

        self.setWindowTitle(self.tr("Login"))
        self.setModal(True)

        layout = QVBoxLayout(self)

        self._tabs = QTabWidget(self)
        layout.addWidget(self._tabs)

        self._login_tab = self._create_login_tab()
        self._register_tab = self._create_register_tab()
        self._tabs.addTab(self._login_tab, self.tr("Login"))
        self._tabs.addTab(self._register_tab, self.tr("Register"))

        buttons = QDialogButtonBox(QDialogButtonBox.Ok | QDialogButtonBox.Cancel, self)
        buttons.button(QDialogButtonBox.Ok).setText(self.tr("Login"))
        buttons.accepted.connect(self._handle_accept)
        buttons.rejected.connect(self.reject)
        layout.addWidget(buttons)

        self._buttons = buttons

    # Public API ---------------------------------------------------------

    def username(self) -> Optional[str]:
        """Return the username that successfully logged in, if any."""

        return self._username_value

    # Internal helpers ---------------------------------------------------

    def _create_login_tab(self) -> QDialog:
        widget = QDialog(self)
        form = QFormLayout(widget)

        # User name field.
        self._login_username = QLineEdit(widget)
        form.addRow(QLabel(self.tr("User name"), widget), self._login_username)

        # Password field + eye toggle.
        pwd_widget = QWidget(widget)
        pwd_layout = QHBoxLayout(pwd_widget)
        pwd_layout.setContentsMargins(0, 0, 0, 0)

        self._login_password = QLineEdit(pwd_widget)
        self._login_password.setEchoMode(QLineEdit.Password)

        self._toggle_password_btn = QPushButton(self.tr("Show"), pwd_widget)
        self._toggle_password_btn.setCheckable(True)
        self._toggle_password_btn.setFocusPolicy(Qt.NoFocus)
        self._toggle_password_btn.toggled.connect(self._on_toggle_password_visibility)

        pwd_layout.addWidget(self._login_password)
        pwd_layout.addWidget(self._toggle_password_btn)

        form.addRow(QLabel(self.tr("Password"), widget), pwd_widget)

        return widget

    def _create_register_tab(self) -> QDialog:
        widget = QDialog(self)
        layout = QVBoxLayout(widget)
        layout.addWidget(
            QLabel(
                self.tr(
                    "Registration is not implemented yet. Please use an existing account."
                ),
                widget,
            )
        )
        layout.addStretch(1)
        return widget

    def _on_toggle_password_visibility(self, checked: bool) -> None:
        if checked:
            self._login_password.setEchoMode(QLineEdit.Normal)
            self._toggle_password_btn.setText(self.tr("Hide"))
        else:
            self._login_password.setEchoMode(QLineEdit.Password)
            self._toggle_password_btn.setText(self.tr("Show"))

    def _handle_accept(self) -> None:
        """Handle clicks on the Login button.

        This method performs the authentication and either closes the
        dialog on success or shows a message box on failure. Any
        unexpected exceptions are logged to stderr and also surfaced in
        a message box so that failures are visible during development.
        """

        # Only Login tab is wired for now.
        if self._tabs.currentWidget() is not self._login_tab:
            self.reject()
            return

        from PySide6.QtWidgets import QMessageBox
        import sys
        import traceback

        username = self._login_username.text()
        password = self._login_password.text()

        try:
            result: AuthResult = authenticate(username, password)
        except Exception:
            # Log full traceback to stderr for debugging.
            traceback.print_exc()
            QMessageBox.critical(
                self,
                self.tr("Login failed"),
                self.tr("An unexpected error occurred while checking your credentials."),
            )
            return

        if not result.success:
            QMessageBox.warning(
                self,
                self.tr("Login failed"),
                result.error_message or self.tr("Invalid username or password."),
            )
            return

        # Successful login.
        self._username_value = result.username or username

        # Inform the main window (if any) so that it can update its state
        # and UI immediately.
        parent = self.parent()
        try:
            from .main_window import MainWindow
        except Exception:  # pragma: no cover - import-time issues
            MainWindow = None  # type: ignore

        if MainWindow is not None and isinstance(parent, MainWindow):  # type: ignore[arg-type]
            parent.apply_login(self._username_value)

        QMessageBox.information(
            self,
            self.tr("Login successful"),
            self.tr("You are now logged in as: {username}").format(username=self._username_value),
        )
        self.accept()
