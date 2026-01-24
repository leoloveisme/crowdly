"""Preview widget for rendered Markdown in a WYSIWYG-style editor.

This widget provides a rich text view backed by Qt's markdown support. It
can be edited directly and kept in sync with the plain-text Markdown
source editor.
"""

from __future__ import annotations

from PySide6.QtCore import Signal, Qt, QEvent
from PySide6.QtWidgets import (
    QWidget,
    QVBoxLayout,
    QHBoxLayout,
    QToolButton,
    QComboBox,
    QTextEdit,
)
from PySide6.QtGui import QTextCharFormat, QTextCursor, QFont, QColor, QTextBlockFormat

import markdown
import re



# Canonical color names for DSL attributes, keyed by QColor.name() hex.
_NAMED_COLOR_BY_HEX = {
    QColor("black").name(): "black",
    QColor("red").name(): "red",
    QColor("green").name(): "green",
    QColor("blue").name(): "blue",
    QColor("orange").name(): "orange",
    QColor("yellow").name(): "yellow",
    QColor("white").name(): "white",
    QColor("brown").name(): "brown",
    QColor("gray").name(): "grey",
}


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
    # Emitted when the preview gains focus so the main window can treat the
    # WYSIWYG pane as the active one for save/format decisions.
    paneFocused = Signal(str)

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

        # Paragraph type selector (story/chapter structure).
        self._block_style = QComboBox(toolbar)
        self._block_style.addItems(
            [
                "Text formatting",
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
        self._font_family.addItems(["Font", "Sans", "Serif", "Monospace"])
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
        self._font_color.addItem("Color", None)
        self._font_color.addItem("Black", QColor("black"))
        self._font_color.addItem("Red", QColor("red"))
        self._font_color.addItem("Green", QColor("green"))
        self._font_color.addItem("Blue", QColor("blue"))
        self._font_color.addItem("Orange", QColor("orange"))
        self._font_color.addItem("Yellow", QColor("yellow"))
        self._font_color.addItem("White", QColor("white"))
        self._font_color.addItem("Brown", QColor("brown"))
        self._font_color.addItem("Grey", QColor("gray"))
        self._font_color.currentIndexChanged.connect(self._apply_font_color)
        toolbar_layout.addWidget(self._font_color)

        # Word/text wrap color drop-down (background highlight), using the
        # same palette as font color.
        self._wrap_color = QComboBox(toolbar)
        self._wrap_color.addItem("Text Wrap Color", None)
        self._wrap_color.addItem("Wrap: Black", QColor("black"))
        self._wrap_color.addItem("Wrap: Red", QColor("red"))
        self._wrap_color.addItem("Wrap: Green", QColor("green"))
        self._wrap_color.addItem("Wrap: Blue", QColor("blue"))
        self._wrap_color.addItem("Wrap: Orange", QColor("orange"))
        self._wrap_color.addItem("Wrap: Yellow", QColor("yellow"))
        self._wrap_color.addItem("Wrap: White", QColor("white"))
        self._wrap_color.addItem("Wrap: Brown", QColor("brown"))
        self._wrap_color.addItem("Wrap: Grey", QColor("gray"))
        self._wrap_color.currentIndexChanged.connect(self._apply_wrap_color)
        toolbar_layout.addWidget(self._wrap_color)

        # Horizontal positioning (applies to all text elements).
        self._h_position = QComboBox(toolbar)
        self._h_position.addItems(["Left", "Center", "Right"])
        self._h_position.setCurrentText("Left")
        self._h_position.currentIndexChanged.connect(self._apply_global_h_position)
        toolbar_layout.addWidget(self._h_position)

        # Vertical positioning (applies to the whole document visually).
        self._v_position = QComboBox(toolbar)
        self._v_position.addItems(["Top", "Middle", "Bottom"])
        self._v_position.setCurrentText("Top")
        self._v_position.currentIndexChanged.connect(self._apply_global_v_position)
        toolbar_layout.addWidget(self._v_position)

        layout.addWidget(toolbar)

        self._editor = QTextEdit(self)
        self._editor.textChanged.connect(self._on_text_changed)
        layout.addWidget(self._editor, 1)

        # Forward focus from the wrapper widget to the internal editor so
        # callers can treat the preview as a focusable text widget.
        self.setFocusProxy(self._editor)

        # Ensure Ctrl+wheel events delivered to the internal QTextEdit viewport
        # still drive our custom zoom logic, even when multiple tabs are open.
        try:
            self._editor.viewport().installEventFilter(self)
        except Exception:
            # Best-effort only; the preview remains functional without this.
            pass

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

    def set_html(self, html: str) -> None:
        """Replace the editor content with raw HTML without emitting Markdown.

        This is used for `.story` / `.screenplay` documents where the
        WYSIWYG pane is driven by a DSL → HTML mapping instead of Markdown.
        """

        self._updating_from_source = True
        try:
            self._editor.setHtml(html or "")
        finally:
            self._updating_from_source = False

    def get_html(self) -> str:
        """Return the current content as HTML.

        This exposes the underlying QTextEdit HTML for versioning and
        revisioning pipelines that want a high-fidelity representation
        alongside the Markdown.
        """

        return self._editor.toHtml()

    def get_cursor_state(self) -> dict:
        """Return the current caret and scroll position inside the preview.

        The result can be passed to :meth:`restore_cursor_state` to restore the
        user's visual position after programmatic content updates.
        """

        cursor = self._editor.textCursor()
        try:
            vscroll = self._editor.verticalScrollBar().value()
        except Exception:
            vscroll = 0

        return {
            "position": int(cursor.position()),
            "anchor": int(cursor.anchor()),
            "vscroll": int(vscroll),
        }

    def restore_cursor_state(self, state: dict | None) -> None:
        """Restore caret and scroll position previously captured.

        Positions are clamped to the current document length so incremental
        content changes remain safe.
        """

        if not state:
            return

        doc = self._editor.document()
        if doc is None:
            return

        try:
            max_pos = max(0, int(doc.characterCount()) - 1)
        except Exception:
            max_pos = 0

        pos = int(state.get("position", 0))
        anc = int(state.get("anchor", pos))
        pos = max(0, min(pos, max_pos))
        anc = max(0, min(anc, max_pos))

        cursor = self._editor.textCursor()
        cursor.setPosition(anc)
        if anc != pos:
            cursor.setPosition(pos, QTextCursor.MoveMode.KeepAnchor)
        else:
            cursor.setPosition(pos, QTextCursor.MoveMode.MoveAnchor)

        self._editor.setTextCursor(cursor)
        try:
            self._editor.ensureCursorVisible()
        except Exception:
            pass

        try:
            vscroll = int(state.get("vscroll", 0))
            self._editor.verticalScrollBar().setValue(vscroll)
        except Exception:
            pass

    # Story / screenplay DSL helpers --------------------------------------

    def build_story_dsl(self) -> str:
        """Generate `.story` DSL text from the current rich-text document.

        This inspects block-level alignment and the *dominant* character
        formatting per block (bold/italic/underline/strike, foreground color,
        font size, background color) to produce headers like::

            [paragraph right bold italic font_color=orange font_size=12]Text[/paragraph]

        The mapping is intentionally simple and focuses on block-level styling
        rather than preserving every inline variation.
        """

        doc = self._editor.document()
        lines: list[str] = []

        block = doc.begin()
        while block.isValid():  # type: ignore[truthy-function]
            text = block.text() or ""
            if not text.strip():
                block = block.next()
                continue

            block_fmt = block.blockFormat()
            heading_level = getattr(block_fmt, "headingLevel", lambda: 0)()

            if heading_level == 1:
                tag = "story_title"
            elif heading_level == 2:
                tag = "chapter_title"
            else:
                tag = "paragraph"

            # Alignment attribute as a bare token (left/center/right).
            align_token = "left"
            alignment = block_fmt.alignment()
            if alignment & Qt.AlignmentFlag.AlignHCenter:
                align_token = "center"
            elif alignment & Qt.AlignmentFlag.AlignRight:
                align_token = "right"

            tokens: list[str] = [align_token]

            # Derive dominant character formatting for this block.
            (
                is_bold,
                is_italic,
                is_underline,
                is_strike,
                font_color,
                font_size,
                bg_color,
            ) = self._dominant_char_style_for_block(block)

            if is_bold:
                tokens.append("bold")
            if is_italic:
                tokens.append("italic")
            if is_underline:
                tokens.append("underlined")
            if is_strike:
                tokens.append("stroke-through")

            if font_color:
                tokens.append(f"font_color={font_color}")

            if font_size is not None:
                # Store as integer when very close to an integer point size.
                if abs(font_size - round(font_size)) < 0.01:
                    tokens.append(f"font_size={int(round(font_size))}")
                else:
                    tokens.append(f"font_size={font_size:.1f}")

            # Background color is mapped to text_wrap attribute for now.
            if bg_color:
                tokens.append(f"text_wrap={bg_color}")

            header_attrs = " ".join(tokens) if tokens else ""
            header = f"[{tag} {header_attrs}]" if header_attrs else f"[{tag}]"
            closing = f"[/{tag}]"

            # QTextBlock.text() already omits the trailing newline; we keep the
            # raw text as-is and let downstream HTML rendering handle escaping.
            body = text.rstrip("\n")

            lines.append(f"{header}{body}{closing}")
            lines.append("")

            block = block.next()

        # Normalise trailing whitespace.
        return "\n".join(lines).rstrip() + "\n"

    def _dominant_char_style_for_block(self, block) -> tuple[bool, bool, bool, bool, str | None, float | None, str | None]:
        """Return dominant style flags for *block*.

        The result is a tuple of:

        (bold, italic, underline, strike, font_color, font_size, background_color)

        "Dominant" means "applies to more than half of the characters" for the
        boolean flags and "most frequent" for colors / sizes.
        """

        from PySide6.QtGui import QFont

        total_len = 0
        bold_chars = italic_chars = underline_chars = strike_chars = 0
        fg_counts: dict[str, int] = {}
        bg_counts: dict[str, int] = {}
        size_counts: dict[float, int] = {}

        it = block.begin()
        while not it.atEnd():  # type: ignore[truthy-function]
            frag = it.fragment()
            if frag.isValid():
                text = frag.text() or ""
                length = len(text)
                if length > 0:
                    fmt = frag.charFormat()
                    total_len += length

                    if fmt.fontWeight() > QFont.Weight.Normal:
                        bold_chars += length
                    if fmt.fontItalic():
                        italic_chars += length
                    if fmt.fontUnderline():
                        underline_chars += length
                    if fmt.fontStrikeOut():
                        strike_chars += length

                    fg = fmt.foreground()
                    if fg.isOpaque():
                        name = fg.color().name()
                        fg_counts[name] = fg_counts.get(name, 0) + length

                    bg = fmt.background()
                    if bg.isOpaque():
                        name = bg.color().name()
                        bg_counts[name] = bg_counts.get(name, 0) + length

                    size = float(fmt.fontPointSize())
                    if size > 0.0:
                        size_counts[size] = size_counts.get(size, 0) + length

            it += 1

        if total_len <= 0:
            return False, False, False, False, None, None, None

        def _majority(count: int) -> bool:
            return count > (total_len / 2.0)

        is_bold = _majority(bold_chars)
        is_italic = _majority(italic_chars)
        is_underline = _majority(underline_chars)
        is_strike = _majority(strike_chars)

        def _most_common(mapping: dict[str, int]) -> str | None:
            if not mapping:
                return None
            hex_code, _ = max(mapping.items(), key=lambda item: item[1])
            # Normalise to a friendly name when possible.
            return _NAMED_COLOR_BY_HEX.get(hex_code, hex_code)

        font_color = _most_common(fg_counts)
        bg_color = _most_common(bg_counts)

        font_size: float | None
        if not size_counts:
            font_size = None
        else:
            size, _ = max(size_counts.items(), key=lambda item: item[1])
            font_size = size

        return is_bold, is_italic, is_underline, is_strike, font_color, font_size, bg_color

    def build_screenplay_dsl(self) -> str:
        """Generate `.screenplay` DSL text from the current rich-text document.

        This mirrors :meth:`build_story_dsl` but uses screenplay-specific tag
        names:

        * heading level 1 → ``screenplay_title``
        * heading level 2 → ``scene_slugline``
        * other blocks → ``action``
        """

        doc = self._editor.document()
        lines: list[str] = []

        block = doc.begin()
        while block.isValid():  # type: ignore[truthy-function]
            text = block.text() or ""
            if not text.strip():
                block = block.next()
                continue

            block_fmt = block.blockFormat()
            heading_level = getattr(block_fmt, "headingLevel", lambda: 0)()

            if heading_level == 1:
                tag = "screenplay_title"
            elif heading_level == 2:
                tag = "scene_slugline"
            else:
                tag = "action"

            # Alignment attribute as a bare token (left/center/right).
            align_token = "left"
            alignment = block_fmt.alignment()
            if alignment & Qt.AlignmentFlag.AlignHCenter:
                align_token = "center"
            elif alignment & Qt.AlignmentFlag.AlignRight:
                align_token = "right"

            tokens: list[str] = [align_token]

            # Derive dominant character formatting for this block.
            (
                is_bold,
                is_italic,
                is_underline,
                is_strike,
                font_color,
                font_size,
                bg_color,
            ) = self._dominant_char_style_for_block(block)

            if is_bold:
                tokens.append("bold")
            if is_italic:
                tokens.append("italic")
            if is_underline:
                tokens.append("underlined")
            if is_strike:
                tokens.append("stroke-through")

            if font_color:
                tokens.append(f"font_color={font_color}")

            if font_size is not None:
                if abs(font_size - round(font_size)) < 0.01:
                    tokens.append(f"font_size={int(round(font_size))}")
                else:
                    tokens.append(f"font_size={font_size:.1f}")

            if bg_color:
                tokens.append(f"text_wrap={bg_color}")

            header_attrs = " ".join(tokens) if tokens else ""
            header = f"[{tag} {header_attrs}]" if header_attrs else f"[{tag}]"
            closing = f"[/{tag}]"

            body = text.rstrip("\n")

            lines.append(f"{header}{body}{closing}")
            lines.append("")

            block = block.next()

        return "\n".join(lines).rstrip() + "\n"

    # Text-widget compatibility layer -------------------------------------

    def eventFilter(self, obj, event):
        """Route Ctrl+wheel from the inner QTextEdit viewport to ``wheelEvent``.

        This keeps zoom behaviour consistent regardless of which tab or
        internal widget currently holds the wheel focus.
        """

        try:
            viewport = self._editor.viewport()
        except Exception:
            viewport = None

        try:
            if viewport is not None and obj is viewport and event.type() == QEvent.Type.Wheel:
                if event.modifiers() & Qt.KeyboardModifier.ControlModifier:
                    self.wheelEvent(event)
                    return True
        except Exception:
            # Never let event filtering break basic scrolling/interaction.
            return False

        return super().eventFilter(obj, event)

    def focusInEvent(self, event) -> None:  # pragma: no cover - UI wiring
        """Emit a pane-focused signal when the preview gains focus."""

        try:
            self.paneFocused.emit("wysiwyg")
        except Exception:
            pass
        super().focusInEvent(event)

    def textCursor(self) -> QTextCursor:
        """Expose the underlying editor cursor for search/replace helpers."""

        return self._editor.textCursor()

    def setTextCursor(self, cursor: QTextCursor) -> None:
        """Set the underlying editor cursor for search/replace helpers."""

        self._editor.setTextCursor(cursor)

    def find(self, pattern: str, flags) -> bool:
        """Proxy ``find`` to the internal QTextEdit.

        The signature matches :meth:`QTextEdit.find` so that callers can treat
        :class:`PreviewWidget` like a standard Qt text widget for search.
        """

        return self._editor.find(pattern, flags)

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
        - 0: Text formatting (no structural change; use other controls)
        - 1: Story title (H1)
        - 2: Chapter title (H2)
        - 3: Paragraph
        - 4: Branch paragraph (currently treated like paragraph)
        - 5: Text (generic body text; treated like paragraph)
        """

        # "Text formatting" is a neutral placeholder entry; it should not
        # implicitly change the block structure. This lets the user combine the
        # other toolbar controls (alignment, colors, etc.) without resetting the
        # current heading level.
        if index == 0:
            return

        cursor: QTextCursor = self._editor.textCursor()
        block_fmt = cursor.blockFormat()
        char_fmt = cursor.charFormat()

        if index == 1:  # Story title
            block_fmt.setHeadingLevel(1)
            block_fmt.setAlignment(Qt.AlignmentFlag.AlignHCenter)
            char_fmt.setFontWeight(QFont.Weight.Bold)
        elif index == 2:  # Chapter title
            block_fmt.setHeadingLevel(2)
            block_fmt.setAlignment(Qt.AlignmentFlag.AlignLeft)
            char_fmt.setFontWeight(QFont.Weight.Bold)
        else:
            # Paragraph / Branch paragraph / Text
            block_fmt.setHeadingLevel(0)
            block_fmt.setAlignment(Qt.AlignmentFlag.AlignLeft)
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

    def _apply_wrap_color(self, index: int) -> None:
        """Apply background highlight color for word/text wrap.

        When no selection is active the highlight is applied to the word under
        the cursor; otherwise it covers the current selection.
        """

        color = self._wrap_color.currentData()
        if color is None:
            # Clear background highlight.
            def _update(fmt: QTextCharFormat) -> None:
                fmt.clearBackground()
            self._merge_char_format(_update)
            return

        def _update(fmt: QTextCharFormat) -> None:
            fmt.setBackground(color)

        self._merge_char_format(_update)

    def _apply_global_h_position(self, index: int) -> None:
        """Apply horizontal alignment to the current block or selection.

        This lets different text elements (paragraphs, titles, etc.) be
        aligned independently (left/centre/right).
        """

        if index == 0:
            align = Qt.AlignmentFlag.AlignLeft
        elif index == 1:
            align = Qt.AlignmentFlag.AlignHCenter
        else:
            align = Qt.AlignmentFlag.AlignRight

        cursor = self._editor.textCursor()
        block_fmt = cursor.blockFormat()
        block_fmt.setAlignment(align)
        cursor.mergeBlockFormat(block_fmt)

    def _apply_global_v_position(self, index: int) -> None:
        """Approximate vertical positioning for the current block/selection.

        In a scrolling text view there is no absolute page vertical alignment,
        so we treat this as extra spacing before the block (top margin). This
        still allows different elements to "float" higher or lower relative to
        their neighbours.
        """

        # Choose additional top margin in points.
        if index == 0:      # Top
            top_margin = 0.0
        elif index == 1:    # Middle
            top_margin = 40.0
        else:               # Bottom
            top_margin = 80.0

        cursor = self._editor.textCursor()
        block_fmt = cursor.blockFormat()
        block_fmt.setTopMargin(top_margin)
        cursor.mergeBlockFormat(block_fmt)

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

        Some touchpads / high-resolution wheels report vertical motion only via
        ``pixelDelta().y()``; in that case we fall back to it so that zooming
        works consistently in both directions.
        """

        if event.modifiers() & Qt.KeyboardModifier.ControlModifier:
            delta = event.angleDelta().y()
            if delta == 0:
                # Fallback for devices that only populate pixelDelta.
                delta = event.pixelDelta().y()

            if delta == 0:
                # No usable delta; let the underlying QTextEdit handle the event
                # so normal scrolling still works.
                super().wheelEvent(event)
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
