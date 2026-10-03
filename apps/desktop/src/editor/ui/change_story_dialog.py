""""How would you like to change it?" - for readers who can't edit directly.

Shown by Discovery's "I want to change this story" when the reader is not
the story's owner or an invited collaborator. Each option is enabled
according to the story's policies (``CrowdlyClient.change_options``):

- Suggest changes      - always (proposals the owner approves)
- Make my own version  - when the story's clone policy allows it
- Translate            - when its translation policy allows it
- Ask to collaborate   - unless a request is already pending
"""

from __future__ import annotations

from PySide6.QtWidgets import (
    QButtonGroup,
    QComboBox,
    QCommandLinkButton,
    QDialog,
    QDialogButtonBox,
    QFormLayout,
    QLabel,
    QPlainTextEdit,
    QRadioButton,
    QStackedWidget,
    QVBoxLayout,
    QWidget,
)

CHOICE_SUGGEST = "suggest"
CHOICE_CLONE = "clone"
CHOICE_TRANSLATE = "translate"
CHOICE_COLLABORATE = "collaborate"


class ChangeStoryDialog(QDialog):
    def __init__(self, options: dict, locales: list[dict], parent: QWidget | None = None) -> None:
        super().__init__(parent)
        self.choice: str | None = None
        self.language: str | None = None
        self.start = "copy"
        self.message = ""
        self.setWindowTitle(self.tr("Change this story"))
        self.setMinimumWidth(520)

        layout = QVBoxLayout(self)
        intro = QLabel(
            self.tr(
                "\"{title}\" belongs to another author, so you can't change it directly. "
                "How would you like to change it?"
            ).format(title=options.get("title") or ""),
            self,
        )
        intro.setWordWrap(True)
        layout.addWidget(intro)

        self._stack = QStackedWidget(self)
        layout.addWidget(self._stack)

        # Page 1: the four choices ----------------------------------------------
        choices = QWidget(self._stack)
        choices_layout = QVBoxLayout(choices)
        choices_layout.setContentsMargins(0, 0, 0, 0)
        request = options.get("request") or {}
        pending = request.get("status") == "pending"
        self.buttons: dict[str, QCommandLinkButton] = {}
        specs = [
            (
                CHOICE_SUGGEST,
                self.tr("Suggest changes"),
                self.tr("Edit the story in Creation; your changes are sent to the author as suggestions to approve."),
                True,
                "",
            ),
            (
                CHOICE_CLONE,
                self.tr("Make my own version"),
                self.tr("Copy the story into a new story of your own that you can change freely."),
                bool(options.get("can_clone")),
                self.tr("The author doesn't allow copies of this story."),
            ),
            (
                CHOICE_TRANSLATE,
                self.tr("Translate"),
                self.tr("Start a translation into another language, as a new story of your own."),
                bool(options.get("can_translate")),
                self.tr("The author doesn't allow translations of this story."),
            ),
            (
                CHOICE_COLLABORATE,
                self.tr("Ask to collaborate"),
                self.tr("Ask the author to invite you, so you can change the story directly."),
                not pending,
                self.tr("You already asked; the author hasn't answered yet."),
            ),
        ]
        for key, label, description, enabled, reason in specs:
            button = QCommandLinkButton(label, description if enabled else reason, choices)
            button.setEnabled(enabled)
            button.clicked.connect(lambda _=False, k=key: self._choose(k))
            choices_layout.addWidget(button)
            self.buttons[key] = button
        if request.get("status") == "declined":
            note = QLabel(self.tr("The author declined your earlier request to collaborate."), choices)
            note.setWordWrap(True)
            note.setStyleSheet("color: #777;")
            choices_layout.addWidget(note)
        self._stack.addWidget(choices)

        # Page 2: translation language ----------------------------------------------
        translate = QWidget(self._stack)
        form = QFormLayout(translate)
        self._language = QComboBox(translate)
        story_language = (options.get("language") or "").lower()
        for locale in locales:
            code = locale.get("code") or ""
            if not code or code.lower() == story_language:
                continue
            name = locale.get("native_name") or locale.get("english_name") or code
            english = locale.get("english_name") or ""
            self._language.addItem(f"{name} ({english})" if english and english != name else name, code)
        form.addRow(self.tr("Translate into"), self._language)
        self._start_copy = QRadioButton(self.tr("Start from a copy of the original text"), translate)
        self._start_blank = QRadioButton(self.tr("Start with empty chapters"), translate)
        self._start_copy.setChecked(True)
        group = QButtonGroup(translate)
        group.addButton(self._start_copy)
        group.addButton(self._start_blank)
        form.addRow(self._start_copy)
        form.addRow(self._start_blank)
        self._stack.addWidget(translate)

        # Page 3: message to the author ---------------------------------------------
        collaborate = QWidget(self._stack)
        collaborate_layout = QVBoxLayout(collaborate)
        collaborate_layout.addWidget(QLabel(self.tr("Message to the author (optional):"), collaborate))
        self._message = QPlainTextEdit(collaborate)
        self._message.setPlaceholderText(self.tr("Hi! I'd love to help with this story…"))
        collaborate_layout.addWidget(self._message)
        self._stack.addWidget(collaborate)

        self._buttons = QDialogButtonBox(QDialogButtonBox.StandardButton.Cancel, self)
        self._ok = self._buttons.addButton(self.tr("Continue"), QDialogButtonBox.ButtonRole.AcceptRole)
        self._ok.setVisible(False)
        self._buttons.accepted.connect(self._confirm)
        self._buttons.rejected.connect(self.reject)
        layout.addWidget(self._buttons)

    def _choose(self, key: str) -> None:
        self.choice = key
        if key == CHOICE_TRANSLATE:
            self._stack.setCurrentIndex(1)
            self._ok.setText(self.tr("Start translation"))
            self._ok.setVisible(True)
            self._ok.setEnabled(self._language.count() > 0)
        elif key == CHOICE_COLLABORATE:
            self._stack.setCurrentIndex(2)
            self._ok.setText(self.tr("Send request"))
            self._ok.setVisible(True)
        else:
            self.accept()

    def _confirm(self) -> None:
        if self.choice == CHOICE_TRANSLATE:
            self.language = self._language.currentData()
            self.start = "blank" if self._start_blank.isChecked() else "copy"
        elif self.choice == CHOICE_COLLABORATE:
            self.message = self._message.toPlainText().strip()
        self.accept()
