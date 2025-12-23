"""Preview widget for rendered Markdown in a WYSIWYG-style editor.

This widget provides a rich text view backed by Qt's markdown support. It
can be edited directly and kept in sync with the plain-text Markdown
source editor.
"""

from __future__ import annotations

from PySide6.QtCore import Signal, Qt
from PySide6.QtWidgets import (
    QWidget,
    QVBoxLayout,
    QHBoxLayout,
    QToolButton,
    QComboBox,
    QTextEdit,
)
from PySide6.QtGui import QTextCharFormat, QTextCursor, QFont, QColor

import markdown
import re


class PreviewWidget(QWidget):
    """Editable WYSIWYG-style Markdown preview.

    Exposes a ``set_markdown`` method to load Markdown into the rich text
    view and emits ``markdownEdited`` whenever the user changes the
    content via the WYSIWYG editor.
    """

    # Emits the current content as a string representing the edited document.
    # We emit Markdown so the source editor, local file, and backend sync all
    # remain Markdown-based (sending raw HTML to the backend breaks story pages).
    markdownEdited = Signal(str)

    def __init__(self, parent: object | None = None) -> None:
        super().__init__(parent)

        self._updating_from_source = False

        layout = QVBoxLayout(self)
        layout.setContentsMargins(0, 0, 0, 0)
        layout.setSpacing(0)

        # Simple formatting toolbar aligned to the top-right of the preview
        # pane.
        toolbar = QWidget(self)
        toolbar_layout = QHBoxLayout(toolbar)
        toolbar_layout.setContentsMargins(4, 4, 4, 4)
        toolbar_layout.setSpacing(4)

        toolbar_layout.addStretch(1)

        # Bold
        self._btn_bold = QToolButton(toolbar)
        self._btn_bold.setText("B")
        self._btn_bold.setCheckable(False)
        self._btn_bold.clicked.connect(self._toggle_bold)
        toolbar_layout.addWidget(self._btn_bold)

        # Italic
        self._btn_italic = QToolButton(toolbar)
        self._btn_italic.setText("I")
        self._btn_italic.clicked.connect(self._toggle_italic)
        toolbar_layout.addWidget(self._btn_italic)

        # Underline
        self._btn_underline = QToolButton(toolbar)
        self._btn_underline.setText("U")
        self._btn_underline.clicked.connect(self._toggle_underline)
        toolbar_layout.addWidget(self._btn_underline)

        # Strikethrough
        self._btn_strike = QToolButton(toolbar)
        self._btn_strike.setText("S")
        self._btn_strike.clicked.connect(self._toggle_strike)
        toolbar_layout.addWidget(self._btn_strike)

        # Alignment: left / centre / right
        self._btn_align_left = QToolButton(toolbar)
        self._btn_align_left.setText("L")
        self._btn_align_left.setToolTip("Align left")
        self._btn_align_left.clicked.connect(self._align_left)
        toolbar_layout.addWidget(self._btn_align_left)

        self._btn_align_center = QToolButton(toolbar)
        self._btn_align_center.setText("C")
        self._btn_align_center.setToolTip("Align center")
        self._btn_align_center.clicked.connect(self._align_center)
        toolbar_layout.addWidget(self._btn_align_center)

        self._btn_align_right = QToolButton(toolbar)
        self._btn_align_right.setText("R")
        self._btn_align_right.setToolTip("Align right")
        self._btn_align_right.clicked.connect(self._align_right)
        toolbar_layout.addWidget(self._btn_align_right)

        # Paragraph type selector (story/chapter structure).
        self._block_style = QComboBox(toolbar)
        self._block_style.addItems(
            [
                "Story title",
                "Chapter title",
                "Paragraph",
                "Branch paragraph",
                "Text",
            ]
        )
        self._block_style.currentIndexChanged.connect(self._apply_block_style)
        toolbar_layout.addWidget(self._block_style)

        # Font family drop-down (limited set for now).
        self._font_family = QComboBox(toolbar)
        self._font_family.addItems(["Default", "Sans", "Serif", "Monospace"])
        self._font_family.currentIndexChanged.connect(self._apply_font_family)
        toolbar_layout.addWidget(self._font_family)

        # Font size drop-down.
        self._font_size = QComboBox(toolbar)
        for size in [9, 10, 11, 12, 14, 16, 18, 24]:
            self._font_size.addItem(str(size), size)
        self._font_size.setCurrentText("12")
        self._font_size.currentIndexChanged.connect(self._apply_font_size)
        toolbar_layout.addWidget(self._font_size)

        # Font color drop-down (basic palette).
        self._font_color = QComboBox(toolbar)
        self._font_color.addItem("Default", None)
        self._font_color.addItem("Black", QColor("black"))
        self._font_color.addItem("Red", QColor("red"))
        self._font_color.addItem("Green", QColor("green"))
        self._font_color.addItem("Blue", QColor("blue"))
        self._font_color.addItem("White", QColor("white"))
        self._font_color.addItem("Brown", QColor("brown"))
        self._font_color.addItem("Grey", QColor("gray"))
        self._font_color.currentIndexChanged.connect(self._apply_font_color)
        toolbar_layout.addWidget(self._font_color)

        layout.addWidget(toolbar)

        self._editor = QTextEdit(self)
        self._editor.textChanged.connect(self._on_text_changed)
        layout.addWidget(self._editor, 1)

        # Track zoom level for Ctrl+wheel zooming.
        self._zoom_level = 0

    # Public API -----------------------------------------------------------

    def set_markdown(self, text: str) -> None:
        """Load *text* as Markdown/HTML into the rich text editor.

        This method does not emit ``markdownEdited``.

        We continue to use the ``markdown`` package so that raw HTML (such as
        ``<img src="...">``) is preserved in the rendered output.
        """

        self._updating_from_source = True
        try:
            # First render Markdown to HTML; raw HTML blocks (e.g. <img>) are
            # passed through by the markdown library.
            html = markdown.markdown(text, extensions=["extra", "sane_lists"])

            # Strip explicit font-size declarations so that zooming applies
            # uniformly to all text. This prevents parts of the document from
            # ignoring zoom because they carry hard-coded sizes.
            html = re.sub(
                r"font-size:\s*[^;\"']+;?",
                "",
                html,
                flags=re.IGNORECASE,
            )

            self._editor.setHtml(html)
        finally:
            self._updating_from_source = False

    def get_markdown(self) -> str:
        """Return the current content as Markdown."""

        return self._editor.toMarkdown()

    def get_html(self) -> str:
        """Return the current content as HTML.

        This exposes the underlying QTextEdit HTML for versioning and
        revisioning pipelines that want a high-fidelity representation
        alongside the Markdown.
        """

        return self._editor.toHtml()

    # Internal helpers -----------------------------------------------------

    def _merge_char_format(self, callback) -> None:
        cursor: QTextCursor = self._editor.textCursor()
        if not cursor.hasSelection():
            # Select word under cursor for convenience.
            cursor.select(QTextCursor.SelectionType.WordUnderCursor)
        fmt = cursor.charFormat()
        callback(fmt)
        cursor.mergeCharFormat(fmt)
        self._editor.mergeCurrentCharFormat(fmt)

    def _toggle_bold(self) -> None:
        def _update(fmt: QTextCharFormat) -> None:
            weight = fmt.fontWeight()
            fmt.setFontWeight(QFont.Weight.Normal if weight > QFont.Weight.Normal else QFont.Weight.Bold)

        self._merge_char_format(_update)

    def _toggle_italic(self) -> None:
        def _update(fmt: QTextCharFormat) -> None:
            fmt.setFontItalic(not fmt.fontItalic())

        self._merge_char_format(_update)

    def _toggle_underline(self) -> None:
        def _update(fmt: QTextCharFormat) -> None:
            fmt.setFontUnderline(not fmt.fontUnderline())

        self._merge_char_format(_update)

    def _toggle_strike(self) -> None:
        def _update(fmt: QTextCharFormat) -> None:
            fmt.setFontStrikeOut(not fmt.fontStrikeOut())

        self._merge_char_format(_update)

    def _apply_block_style(self, index: int) -> None:
        """Apply a block-level style.

        Indices correspond to the combobox items:
        - 0: Story title (H1)
        - 1: Chapter title (H2)
        - 2: Paragraph
        - 3: Branch paragraph (placeholder for now; treated like paragraph)
        - 4: Text
        """

        cursor: QTextCursor = self._editor.textCursor()
        block_fmt = cursor.blockFormat()
        char_fmt = cursor.charFormat()

        if index == 0:  # Story title
            block_fmt.setHeadingLevel(1)
            char_fmt.setFontWeight(QFont.Weight.Bold)
        elif index == 1:  # Chapter title
            block_fmt.setHeadingLevel(2)
            char_fmt.setFontWeight(QFont.Weight.Bold)
        else:
            block_fmt.setHeadingLevel(0)
            char_fmt.setFontWeight(QFont.Weight.Normal)

        cursor.mergeBlockFormat(block_fmt)
        cursor.mergeCharFormat(char_fmt)
        self._editor.mergeCurrentCharFormat(char_fmt)

    def _align_left(self) -> None:
        cursor: QTextCursor = self._editor.textCursor()
        block_fmt = cursor.blockFormat()
        block_fmt.setAlignment(Qt.AlignmentFlag.AlignLeft)
        cursor.mergeBlockFormat(block_fmt)

    def _align_center(self) -> None:
        cursor: QTextCursor = self._editor.textCursor()
        block_fmt = cursor.blockFormat()
        block_fmt.setAlignment(Qt.AlignmentFlag.AlignHCenter)
        cursor.mergeBlockFormat(block_fmt)

    def _align_right(self) -> None:
        cursor: QTextCursor = self._editor.textCursor()
        block_fmt = cursor.blockFormat()
        block_fmt.setAlignment(Qt.AlignmentFlag.AlignRight)
        cursor.mergeBlockFormat(block_fmt)

    def _apply_font_family(self, index: int) -> None:
        family = self._font_family.currentText()
        if family == "Default":
            return

        def _update(fmt: QTextCharFormat) -> None:
            if family == "Sans":
                fmt.setFontFamily("Sans Serif")
            elif family == "Serif":
                fmt.setFontFamily("Serif")
            elif family == "Monospace":
                fmt.setFontFamily("Monospace")

        self._merge_char_format(_update)

    def _apply_font_size(self, index: int) -> None:
        size = self._font_size.currentData()
        if not size:
            return

        def _update(fmt: QTextCharFormat) -> None:
            fmt.setFontPointSize(float(size))

        self._merge_char_format(_update)

    def _apply_font_color(self, index: int) -> None:
        color = self._font_color.currentData()
        if color is None:
            # Default: let the document/theme decide.
            def _update(fmt: QTextCharFormat) -> None:
                fmt.clearForeground()
            self._merge_char_format(_update)
            return

        def _update(fmt: QTextCharFormat) -> None:
            fmt.setForeground(color)

        self._merge_char_format(_update)

    # Slots ----------------------------------------------------------------

    def _on_text_changed(self) -> None:  # pragma: no cover - UI wiring
        if self._updating_from_source:
            return

        # Emit Markdown so the source editor + backend receive clean Markdown,
        # not a full HTML document (<!DOCTYPE ...><html>...).
        self.markdownEdited.emit(self._editor.toMarkdown())

    def wheelEvent(self, event) -> None:  # pragma: no cover - UI wiring
        """Support Ctrl+wheel zooming for the WYSIWYG editor.

        When Ctrl is held, the mouse wheel zooms the rich-text view instead of
        scrolling. The zoom range is clamped to avoid extreme sizes.
        """

        if event.modifiers() & Qt.KeyboardModifier.ControlModifier:
            delta = event.angleDelta().y()
            if delta == 0:
                return

            step = 1 if delta > 0 else -1
            new_level = self._zoom_level + step
            if -5 <= new_level <= 10:
                self._zoom_level = new_level
                if step > 0:
                    self._editor.zoomIn(1)
                else:
                    self._editor.zoomOut(1)
            event.accept()
            return

        super().wheelEvent(event)
