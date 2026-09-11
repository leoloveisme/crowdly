"""Dialog for creating a new Crowdly story or screenplay.

This dialog is intentionally simple and mirrors the choice shown on the
Crowdly web index page: the user picks between a regular (novel) story
and a screenplay.
"""

from __future__ import annotations

from PySide6.QtWidgets import (
    QDialog,
    QDialogButtonBox,
    QLabel,
    QPushButton,
    QVBoxLayout,
    QHBoxLayout,
)


class CreateStoryDialog(QDialog):
    """Modal dialog asking what kind of story to create.

    The dialog exposes the user's choice via :meth:`choice`, which returns
    ``"story"`` for a regular (novel) story, ``"screenplay"`` for a
    screenplay, or ``None`` if the dialog was cancelled.
    """

    def __init__(self, parent: object | None = None) -> None:
        super().__init__(parent)

        self._choice: str | None = None

        self.setWindowTitle(self.tr("Create story"))
        self.setModal(True)

        root = QVBoxLayout(self)

        label = QLabel(
            self.tr("What kind of story would you like to create?"),
            self,
        )
        label.setWordWrap(True)
        root.addWidget(label)

        buttons_row = QHBoxLayout()

        story_btn = QPushButton(self.tr("Regular (novel) story"), self)
        screenplay_btn = QPushButton(self.tr("Screenplay"), self)

        story_btn.clicked.connect(self._on_story_clicked)  # type: ignore[arg-type]
        screenplay_btn.clicked.connect(self._on_screenplay_clicked)  # type: ignore[arg-type]

        buttons_row.addWidget(story_btn)
        buttons_row.addWidget(screenplay_btn)
        root.addLayout(buttons_row)

        # Provide an explicit Cancel button so the user can back out.
        button_box = QDialogButtonBox(QDialogButtonBox.Cancel, self)
        button_box.rejected.connect(self.reject)  # type: ignore[arg-type]
        root.addWidget(button_box)

    # Slots ---------------------------------------------------------------

    def _on_story_clicked(self) -> None:  # pragma: no cover - UI wiring
        self._choice = "story"
        self.accept()

    def _on_screenplay_clicked(self) -> None:  # pragma: no cover - UI wiring
        self._choice = "screenplay"
        self.accept()

    # Public API ---------------------------------------------------------

    def choice(self) -> str | None:
        """Return the selected story type, if any.

        ``"story"`` for a regular (novel) story, ``"screenplay"`` for a
        screenplay, or ``None`` when the dialog was cancelled or closed
        without a selection.
        """

        return self._choice
