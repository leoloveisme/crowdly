"""Dialog for opening a story from the web.

Kept intentionally simple: a single input field for a story URL or story id.
"""

from __future__ import annotations

from PySide6.QtWidgets import (
    QDialog,
    QDialogButtonBox,
    QFormLayout,
    QLabel,
    QLineEdit,
    QVBoxLayout,
)


class OpenStoryDialog(QDialog):
    def __init__(self, parent: object | None = None, *, default_value: str = "") -> None:
        super().__init__(parent)

        self.setWindowTitle(self.tr("Open story or screenplay on the web"))
        self.setModal(True)

        layout = QVBoxLayout(self)

        form = QFormLayout()
        self._input = QLineEdit(self)
        self._input.setText(default_value)
        self._input.setPlaceholderText(
            self.tr(
                "Paste the full story or screenplay URL (e.g. https://…/story/<id> or https://…/screenplay/<id>) or just the ID."
            )
        )
        form.addRow(QLabel(self.tr("URL or ID"), self), self._input)
        layout.addLayout(form)

        buttons = QDialogButtonBox(QDialogButtonBox.Ok | QDialogButtonBox.Cancel, self)
        buttons.button(QDialogButtonBox.Ok).setText(self.tr("Open"))
        buttons.accepted.connect(self.accept)
        buttons.rejected.connect(self.reject)
        layout.addWidget(buttons)

        self._buttons = buttons

    def value(self) -> str:
        return self._input.text().strip()
