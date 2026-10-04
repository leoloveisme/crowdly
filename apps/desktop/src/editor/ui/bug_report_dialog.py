"""Help → Report a bug… - a native bug report form for signed-in users.

Submits to the same ``POST /api/support-requests`` endpoint as the web form
on ``/support`` (kind = "bug", source = "desktop"), so reports land in the
Support dashboard's Bug Reports tab. Signed-in users skip the CAPTCHA; when
the user is signed out, the main window opens the web form in the browser
instead (with these diagnostics in the URL), see
``MainWindow._report_bug``.
"""

from __future__ import annotations

import platform
from pathlib import Path

from PySide6 import __version__ as PYSIDE_VERSION
from PySide6.QtCore import qVersion
from PySide6.QtWidgets import (
    QComboBox,
    QDialog,
    QDialogButtonBox,
    QFileDialog,
    QFormLayout,
    QHBoxLayout,
    QLabel,
    QLineEdit,
    QListWidget,
    QMessageBox,
    QPlainTextEdit,
    QPushButton,
    QVBoxLayout,
    QWidget,
)

MAX_SCREENSHOTS = 3
MAX_SCREENSHOT_BYTES = 10 * 1024 * 1024
SCREENSHOT_SUFFIXES = {".png", ".jpg", ".jpeg", ".webp", ".gif"}


def app_version() -> str:
    try:
        from importlib.metadata import version

        return version("distraction-free-wysiwyg-editor")
    except Exception:
        return "0.1.0"


def diagnostics(mode: str, language: str) -> dict[str, str]:
    """Technical details attached to every desktop bug report."""

    return {
        "source": "desktop app",
        "appVersion": app_version(),
        "os": platform.platform(),
        "python": platform.python_version(),
        "qt": qVersion(),
        "pyside": PYSIDE_VERSION,
        "mode": mode,
        "language": language,
    }


class BugReportDialog(QDialog):
    def __init__(self, tech: dict[str, str], parent: QWidget | None = None) -> None:
        super().__init__(parent)
        self.tech = tech
        self.attachments: list[Path] = []
        self.setWindowTitle(self.tr("Report a bug"))
        self.setMinimumWidth(560)

        layout = QVBoxLayout(self)
        intro = QLabel(
            self.tr("The more detail you give us, the faster we can find and fix it."),
            self,
        )
        intro.setWordWrap(True)
        layout.addWidget(intro)

        form = QFormLayout()
        self._title = QLineEdit(self)
        self._title.setMaxLength(200)
        self._title.setPlaceholderText(self.tr("e.g. Chapter disappears after saving"))
        form.addRow(self.tr("What went wrong?"), self._title)

        self._area = QComboBox(self)
        for value, label in (
            ("desktop_app", self.tr("Desktop app")),
            ("web_platform", self.tr("Web platform")),
            ("web_editor", self.tr("Web editor")),
            ("other", self.tr("Other")),
        ):
            self._area.addItem(label, value)
        form.addRow(self.tr("Where did it happen?"), self._area)

        self._steps = QPlainTextEdit(self)
        self._steps.setPlaceholderText(self.tr("1. Open a story\n2. Click …\n3. …"))
        self._steps.setMinimumHeight(100)
        form.addRow(self.tr("Steps to reproduce"), self._steps)

        self._expected = QPlainTextEdit(self)
        self._expected.setMaximumHeight(70)
        form.addRow(self.tr("What did you expect to happen?"), self._expected)

        self._actual = QPlainTextEdit(self)
        self._actual.setMaximumHeight(70)
        form.addRow(self.tr("What happened instead?"), self._actual)

        self._severity = QComboBox(self)
        for value, label in (
            ("annoying", self.tr("Annoying")),
            ("blocker", self.tr("Blocks me")),
            ("cosmetic", self.tr("Cosmetic")),
        ):
            self._severity.addItem(label, value)
        form.addRow(self.tr("How bad is it?"), self._severity)

        self._frequency = QComboBox(self)
        for value, label in (
            ("always", self.tr("Always")),
            ("sometimes", self.tr("Sometimes")),
            ("once", self.tr("Happened once")),
        ):
            self._frequency.addItem(label, value)
        form.addRow(self.tr("How often does it happen?"), self._frequency)

        shots = QWidget(self)
        shots_layout = QHBoxLayout(shots)
        shots_layout.setContentsMargins(0, 0, 0, 0)
        self._shots_list = QListWidget(shots)
        self._shots_list.setMaximumHeight(70)
        shots_layout.addWidget(self._shots_list, 1)
        buttons_col = QVBoxLayout()
        self._add_shot = QPushButton(self.tr("Add image…"), shots)
        self._add_shot.clicked.connect(self._choose_screenshots)
        self._remove_shot = QPushButton(self.tr("Remove"), shots)
        self._remove_shot.clicked.connect(self._remove_screenshot)
        buttons_col.addWidget(self._add_shot)
        buttons_col.addWidget(self._remove_shot)
        buttons_col.addStretch(1)
        shots_layout.addLayout(buttons_col)
        form.addRow(self.tr("Screenshots (optional, up to 3)"), shots)
        layout.addLayout(form)

        tech_label = QLabel(self.tr("Technical details sent with this report:"), self)
        layout.addWidget(tech_label)
        tech_view = QPlainTextEdit(self)
        tech_view.setReadOnly(True)
        tech_view.setMaximumHeight(110)
        tech_view.setPlainText("\n".join(f"{k}: {v}" for k, v in tech.items()))
        layout.addWidget(tech_view)

        box = QDialogButtonBox(QDialogButtonBox.StandardButton.Cancel, self)
        self._submit = box.addButton(self.tr("Submit bug report"), QDialogButtonBox.ButtonRole.AcceptRole)
        box.accepted.connect(self._accept_if_valid)
        box.rejected.connect(self.reject)
        layout.addWidget(box)
        self._update_shot_buttons()

    # -- screenshots ----------------------------------------------------------

    def _choose_screenshots(self) -> None:  # pragma: no cover - UI wiring
        paths, _ = QFileDialog.getOpenFileNames(
            self,
            self.tr("Add image…"),
            "",
            self.tr("Images (*.png *.jpg *.jpeg *.webp *.gif)"),
        )
        rejected = False
        for raw in paths:
            path = Path(raw)
            if len(self.attachments) >= MAX_SCREENSHOTS:
                rejected = True
                break
            if path.suffix.lower() not in SCREENSHOT_SUFFIXES or path.stat().st_size > MAX_SCREENSHOT_BYTES:
                rejected = True
                continue
            self.attachments.append(path)
            self._shots_list.addItem(path.name)
        if rejected:
            QMessageBox.information(
                self,
                self.tr("Report a bug"),
                self.tr("You can attach up to 3 PNG, JPEG, WEBP or GIF images of up to 10 MB each."),
            )
        self._update_shot_buttons()

    def _remove_screenshot(self) -> None:  # pragma: no cover - UI wiring
        row = self._shots_list.currentRow()
        if row < 0:
            return
        self._shots_list.takeItem(row)
        del self.attachments[row]
        self._update_shot_buttons()

    def _update_shot_buttons(self) -> None:
        self._add_shot.setEnabled(len(self.attachments) < MAX_SCREENSHOTS)
        self._remove_shot.setEnabled(bool(self.attachments))

    # -- result ---------------------------------------------------------------

    def _accept_if_valid(self) -> None:  # pragma: no cover - UI wiring
        if not self._title.text().strip() or not self._steps.toPlainText().strip():
            QMessageBox.warning(
                self,
                self.tr("Report a bug"),
                self.tr("Please add a title and the steps to reproduce the bug."),
            )
            return
        self.accept()

    def payload(self) -> tuple[dict[str, str], dict]:
        """``(fields, details)`` for ``CrowdlyClient.submit_bug_report``."""

        area = self._area.currentData()
        fields = {
            "subject": self._title.text().strip(),
            "message": self._steps.toPlainText().strip(),
            "category": "desktop_app" if area == "desktop_app" else "other",
        }
        details = {
            "area": area,
            "expected": self._expected.toPlainText().strip(),
            "actual": self._actual.toPlainText().strip(),
            "severity": self._severity.currentData(),
            "frequency": self._frequency.currentData(),
            "tech": self.tech,
        }
        return fields, details
